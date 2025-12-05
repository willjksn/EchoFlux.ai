import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MediaLibraryItem } from '../types';
import { useAppContext } from './AppContext';
import { UploadIcon, TrashIcon, ImageIcon, VideoIcon, CheckCircleIcon, PlusIcon } from './icons/UIIcons';
import { db, storage } from '../firebaseConfig';
import { collection, setDoc, doc, getDocs, deleteDoc, query, orderBy } from 'firebase/firestore';
// @ts-ignore
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export const MediaLibrary: React.FC = () => {
  const { user, showToast, setActivePage } = useAppContext();
  const [mediaItems, setMediaItems] = useState<MediaLibraryItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const loadMedia = async () => {
      try {
        const mediaRef = collection(db, 'users', user.id, 'media_library');
        const q = query(mediaRef, orderBy('uploadedAt', 'desc'));
        const snapshot = await getDocs(q);
        
        const items: MediaLibraryItem[] = [];
        snapshot.forEach((doc) => {
          items.push({
            id: doc.id,
            ...doc.data(),
          } as MediaLibraryItem);
        });
        
        setMediaItems(items);
      } catch (error) {
        console.error('Failed to load media library:', error);
        showToast('Failed to load media library', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    loadMedia();
  }, [user, showToast]);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;

    setIsUploading(true);
    const uploadPromises: Promise<void>[] = [];

    Array.from(files).forEach((file) => {
      const uploadPromise = (async () => {
        try {
          const fileType = file.type.startsWith('image') ? 'image' : 'video';
          const timestamp = Date.now();
          const ext = file.type.split('/')[1] || (fileType === 'image' ? 'jpg' : 'mp4');
          const storagePath = `users/${user.id}/media_library/${timestamp}_${file.name}`;
          const storageRef = ref(storage, storagePath);

          await uploadBytes(storageRef, file, { contentType: file.type });
          const mediaUrl = await getDownloadURL(storageRef);

          const mediaItem: MediaLibraryItem = {
            id: timestamp.toString(),
            userId: user.id,
            url: mediaUrl,
            name: file.name,
            type: fileType,
            mimeType: file.type,
            size: file.size,
            uploadedAt: new Date().toISOString(),
            usedInPosts: [],
            tags: [],
          };

          // Save to Firestore
          await setDoc(doc(db, 'users', user.id, 'media_library', mediaItem.id), mediaItem);
          
          setMediaItems(prev => [mediaItem, ...prev]);
          showToast(`Uploaded ${file.name}`, 'success');
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          showToast(`Failed to upload ${file.name}`, 'error');
        }
      })();

      uploadPromises.push(uploadPromise);
    });

    await Promise.all(uploadPromises);
    setIsUploading(false);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleFileSelect(e.dataTransfer.files);
  }, [user]);

  const handleDelete = async (id: string) => {
    if (!user) return;
    
    try {
      const item = mediaItems.find(m => m.id === id);
      if (!item) return;

      // Delete from Firestore
      await deleteDoc(doc(db, 'users', user.id, 'media_library', id));
      
      // Note: We don't delete from Storage to avoid breaking existing posts
      // Storage cleanup can be done separately if needed
      
      setMediaItems(prev => prev.filter(m => m.id !== id));
      showToast('Media deleted from library', 'success');
    } catch (error) {
      console.error('Failed to delete media:', error);
      showToast('Failed to delete media', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (!user || selectedItems.size === 0) return;

    try {
      const deletePromises = Array.from(selectedItems).map(id => 
        deleteDoc(doc(db, 'users', user.id, 'media_library', id))
      );
      
      await Promise.all(deletePromises);
      setMediaItems(prev => prev.filter(m => !selectedItems.has(m.id)));
      setSelectedItems(new Set());
      showToast(`Deleted ${selectedItems.size} item(s)`, 'success');
    } catch (error) {
      console.error('Failed to delete media:', error);
      showToast('Failed to delete media', 'error');
    }
  };

  const handleSelectItem = (id: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const filtered = filterType === 'all' 
      ? mediaItems 
      : mediaItems.filter(m => m.type === filterType);
    
    if (selectedItems.size === filtered.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filtered.map(m => m.id)));
    }
  };

  const handleUseInCompose = (item: MediaLibraryItem) => {
    // Navigate to compose page
    setActivePage('compose');
    
    // Store the media item in localStorage so Compose can pick it up
    const mediaToAdd = {
      url: item.url,
      type: item.type,
      mimeType: item.mimeType || (item.type === 'image' ? 'image/jpeg' : 'video/mp4'),
      name: item.name,
    };
    localStorage.setItem('pendingMediaFromLibrary', JSON.stringify(mediaToAdd));
    
    showToast('Media added to Compose page', 'success');
  };

  const filteredItems = filterType === 'all' 
    ? mediaItems 
    : mediaItems.filter(m => m.type === filterType);

  if (!user) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600 dark:text-gray-400">Please sign in to access Media Library.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Loading media library...</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Media Library
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Upload and manage images and videos that you can reuse across your posts. Media stays until you delete it.
          </p>
        </div>

        {/* Upload Area */}
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6"
        >
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <PlusIcon className="w-8 h-8 text-gray-400 dark:text-primary-500" />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-1">
              image/video
            </span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50/50 dark:bg-gray-700/50 rounded-lg">
                <div className="animate-spin h-6 w-6 border-2 border-primary-600 border-t-transparent rounded-full"></div>
              </div>
            )}
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                    filterType === 'all'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  All ({mediaItems.length})
                </button>
                <button
                  onClick={() => setFilterType('image')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                    filterType === 'image'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  Images ({mediaItems.filter(m => m.type === 'image').length})
                </button>
                <button
                  onClick={() => setFilterType('video')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                    filterType === 'video'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  Videos ({mediaItems.filter(m => m.type === 'video').length})
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedItems.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/50"
                >
                  <TrashIcon className="w-4 h-4" />
                  Delete Selected ({selectedItems.size})
                </button>
              )}
              <button
                onClick={handleSelectAll}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                {selectedItems.size === filteredItems.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>
        </div>

        {/* Media Grid */}
        {filteredItems.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 p-12 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
            <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No media found
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              {filterType === 'all' 
                ? 'Upload images or videos to get started'
                : `No ${filterType}s found. Try uploading some!`}
            </p>
          </div>
        ) : (
          <div className={`grid gap-4 ${
            viewMode === 'grid' 
              ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' 
              : 'grid-cols-1'
          }`}>
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={`relative group bg-white dark:bg-gray-800 rounded-lg overflow-hidden border-2 transition-all ${
                  selectedItems.has(item.id)
                    ? 'border-primary-500 shadow-lg'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
                }`}
              >
                <div className="relative">
                  {item.type === 'video' ? (
                    <video
                      src={item.url}
                      className="w-full h-48 object-contain bg-gray-100 dark:bg-gray-700"
                      controls={false}
                    />
                  ) : (
                    <img
                      src={item.url}
                      alt={item.name}
                      className="w-full h-48 object-contain bg-gray-100 dark:bg-gray-700"
                    />
                  )}
                  <div className="absolute top-2 left-2 z-30">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleSelectItem(item.id);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className="w-5 h-5 text-primary-600 bg-white border-gray-300 rounded focus:ring-primary-500 cursor-pointer pointer-events-auto"
                    />
                  </div>
                  <div className="absolute top-2 right-2">
                    {item.type === 'video' ? (
                      <VideoIcon className="w-6 h-6 text-white bg-black/50 rounded p-1" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-white bg-black/50 rounded p-1" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {new Date(item.uploadedAt).toLocaleDateString()}
                    </p>
                    {item.usedInPosts && item.usedInPosts.length > 0 && (
                      <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                        Used in {item.usedInPosts.length} post(s)
                      </p>
                    )}
                  </div>
                </div>
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUseInCompose(item);
                    }}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-medium pointer-events-auto"
                  >
                    Use in Post
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item.id);
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium pointer-events-auto"
                  >
                    <TrashIcon className="w-4 h-4 inline mr-1" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaLibrary;

