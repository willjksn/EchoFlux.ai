import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MediaLibraryItem, MediaFolder } from '../types';
import { useAppContext } from './AppContext';
import { UploadIcon, TrashIcon, ImageIcon, VideoIcon, CheckCircleIcon, PlusIcon, XMarkIcon, FolderIcon } from './icons/UIIcons';
import { db, storage } from '../firebaseConfig';
import { collection, setDoc, doc, getDocs, deleteDoc, query, orderBy, updateDoc, writeBatch, where } from 'firebase/firestore';
// @ts-ignore
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { MediaFolderSidebar } from './MediaFolderSidebar';
import { CreateFolderModal } from './CreateFolderModal';
import { MoveToFolderModal } from './MoveToFolderModal';

const GENERAL_FOLDER_ID = 'general';

export const MediaLibrary: React.FC = () => {
  const { user, showToast, setActivePage } = useAppContext();
  const [mediaItems, setMediaItems] = useState<MediaLibraryItem[]>([]);
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(GENERAL_FOLDER_ID);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewingItem, setViewingItem] = useState<MediaLibraryItem | null>(null);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<{ id: string; name: string } | null>(null);

  // Load folders
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const loadFolders = async () => {
      try {
        const foldersRef = collection(db, 'users', user.id, 'media_folders');
        const snapshot = await getDocs(foldersRef);
        
        const loadedFolders: MediaFolder[] = [];
        snapshot.forEach((doc) => {
          loadedFolders.push({
            id: doc.id,
            ...doc.data(),
          } as MediaFolder);
        });

        // Ensure General folder exists
        const generalFolder = loadedFolders.find(f => f.id === GENERAL_FOLDER_ID);
        if (!generalFolder) {
          const generalFolderData: MediaFolder = {
            id: GENERAL_FOLDER_ID,
            userId: user.id,
            name: 'General',
            createdAt: new Date().toISOString(),
          };
          await setDoc(doc(db, 'users', user.id, 'media_folders', GENERAL_FOLDER_ID), generalFolderData);
          loadedFolders.unshift(generalFolderData);
        } else {
          // Sort: General first, then by name
          loadedFolders.sort((a, b) => {
            if (a.id === GENERAL_FOLDER_ID) return -1;
            if (b.id === GENERAL_FOLDER_ID) return 1;
            return a.name.localeCompare(b.name);
          });
        }

        setFolders(loadedFolders);
      } catch (error) {
        console.error('Failed to load folders:', error);
      }
    };

    loadFolders();
  }, [user]);

  // Load media items
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
        const batch = writeBatch(db);
        let needsMigration = false;

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const item = {
            id: docSnap.id,
            ...data,
          } as MediaLibraryItem;

          // Migration: assign folderId to items without it
          if (!item.folderId) {
            item.folderId = GENERAL_FOLDER_ID;
            batch.update(docSnap.ref, { folderId: GENERAL_FOLDER_ID });
            needsMigration = true;
          }

          items.push(item);
        });

        if (needsMigration) {
          await batch.commit();
        }
        
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

  // Update folder item counts
  useEffect(() => {
    const updateFolderCounts = () => {
      const updatedFolders = folders.map(folder => ({
        ...folder,
        itemCount: mediaItems.filter(item => (item.folderId || GENERAL_FOLDER_ID) === folder.id).length,
      }));
      setFolders(updatedFolders);
    };

    if (folders.length > 0 && mediaItems.length >= 0) {
      updateFolderCounts();
    }
  }, [mediaItems, folders.length]);

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
            folderId: selectedFolderId, // Upload to currently selected folder
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
    if (e.dataTransfer.files) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, [handleFileSelect]);

  const handleDelete = async (id: string) => {
    if (!user) return;
    
    try {
      const item = mediaItems.find(m => m.id === id);
      if (!item) return;

      await deleteDoc(doc(db, 'users', user.id, 'media_library', id));
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
    const filtered = getFilteredItems();
    if (selectedItems.size === filtered.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filtered.map(m => m.id)));
    }
  };

  const handleUseInCompose = (item: MediaLibraryItem) => {
    const mediaToAdd = {
      url: item.url,
      type: item.type,
      mimeType: item.mimeType || (item.type === 'image' ? 'image/jpeg' : 'video/mp4'),
      name: item.name,
    };
    localStorage.setItem('pendingMediaFromLibrary', JSON.stringify(mediaToAdd));
    setActivePage('compose');
    window.dispatchEvent(new CustomEvent('mediaLibraryItemAdded'));
    showToast('Media added to Compose page', 'success');
  };

  // Folder management functions
  const handleCreateFolder = async (name: string) => {
    if (!user) return;

    // Check for duplicate names
    const existingFolder = folders.find(f => f.name.toLowerCase() === name.toLowerCase());
    if (existingFolder) {
      showToast('A folder with this name already exists', 'error');
      throw new Error('Duplicate folder name');
    }

    const folderId = `folder_${Date.now()}`;
    const newFolder: MediaFolder = {
      id: folderId,
      userId: user.id,
      name,
      createdAt: new Date().toISOString(),
      itemCount: 0,
    };

    await setDoc(doc(db, 'users', user.id, 'media_folders', folderId), newFolder);
    setFolders(prev => [...prev, newFolder].sort((a, b) => {
      if (a.id === GENERAL_FOLDER_ID) return -1;
      if (b.id === GENERAL_FOLDER_ID) return 1;
      return a.name.localeCompare(b.name);
    }));
    showToast(`Folder "${name}" created`, 'success');
  };

  const handleRenameFolder = async (name: string) => {
    if (!user || !editingFolder) return;

    // Check for duplicate names (excluding current folder)
    const existingFolder = folders.find(f => 
      f.id !== editingFolder.id && f.name.toLowerCase() === name.toLowerCase()
    );
    if (existingFolder) {
      showToast('A folder with this name already exists', 'error');
      throw new Error('Duplicate folder name');
    }

    await updateDoc(doc(db, 'users', user.id, 'media_folders', editingFolder.id), {
      name,
    });

    setFolders(prev => prev.map(f => 
      f.id === editingFolder.id ? { ...f, name } : f
    ).sort((a, b) => {
      if (a.id === GENERAL_FOLDER_ID) return -1;
      if (b.id === GENERAL_FOLDER_ID) return 1;
      return a.name.localeCompare(b.name);
    }));

    setEditingFolder(null);
    showToast(`Folder renamed to "${name}"`, 'success');
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!user || folderId === GENERAL_FOLDER_ID) return;

    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    if (!window.confirm(`Delete folder "${folder.name}"? All items will be moved to General.`)) {
      return;
    }

    try {
      // Move all items in this folder to General
      const itemsToMove = mediaItems.filter(item => (item.folderId || GENERAL_FOLDER_ID) === folderId);
      if (itemsToMove.length > 0) {
        const batch = writeBatch(db);
        itemsToMove.forEach(item => {
          batch.update(doc(db, 'users', user.id, 'media_library', item.id), {
            folderId: GENERAL_FOLDER_ID,
          });
        });
        await batch.commit();

        // Update local state
        setMediaItems(prev => prev.map(item => 
          (item.folderId || GENERAL_FOLDER_ID) === folderId
            ? { ...item, folderId: GENERAL_FOLDER_ID }
            : item
        ));
      }

      // Delete folder
      await deleteDoc(doc(db, 'users', user.id, 'media_folders', folderId));
      setFolders(prev => prev.filter(f => f.id !== folderId));

      // Switch to General if deleted folder was selected
      if (selectedFolderId === folderId) {
        setSelectedFolderId(GENERAL_FOLDER_ID);
      }

      showToast(`Folder "${folder.name}" deleted. Items moved to General.`, 'success');
    } catch (error) {
      console.error('Failed to delete folder:', error);
      showToast('Failed to delete folder', 'error');
    }
  };

  const handleMoveItems = async (targetFolderId: string) => {
    if (!user || selectedItems.size === 0) return;

    try {
      const batch = writeBatch(db);
      Array.from(selectedItems).forEach(itemId => {
        batch.update(doc(db, 'users', user.id, 'media_library', itemId), {
          folderId: targetFolderId,
        });
      });
      await batch.commit();

      setMediaItems(prev => prev.map(item => 
        selectedItems.has(item.id) ? { ...item, folderId: targetFolderId } : item
      ));

      const movedCount = selectedItems.size;
      setSelectedItems(new Set());
      showToast(`Moved ${movedCount} ${movedCount === 1 ? 'item' : 'items'}`, 'success');
    } catch (error) {
      console.error('Failed to move items:', error);
      showToast('Failed to move items', 'error');
    }
  };

  // Get filtered items based on selected folder and type filter
  const getFilteredItems = () => {
    let filtered = mediaItems.filter(item => 
      (item.folderId || GENERAL_FOLDER_ID) === selectedFolderId
    );

    if (filterType !== 'all') {
      filtered = filtered.filter(m => m.type === filterType);
    }

    return filtered;
  };

  const filteredItems = getFilteredItems();
  const currentFolder = folders.find(f => f.id === selectedFolderId);

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
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Folder Sidebar */}
      <MediaFolderSidebar
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={setSelectedFolderId}
        onCreateFolder={() => {
          setEditingFolder(null);
          setShowCreateFolderModal(true);
        }}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 overflow-y-auto flex-1">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Media Library
                </h1>
                {currentFolder && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <FolderIcon className="w-4 h-4" />
                    <span>{currentFolder.name}</span>
                    {currentFolder.id !== GENERAL_FOLDER_ID && (
                      <>
                        <button
                          onClick={() => {
                            setEditingFolder({ id: currentFolder.id, name: currentFolder.name });
                            setShowCreateFolderModal(true);
                          }}
                          className="text-primary-600 dark:text-primary-400 hover:underline"
                        >
                          Rename
                        </button>
                        <span>•</span>
                        <button
                          onClick={() => handleDeleteFolder(currentFolder.id)}
                          className="text-red-600 dark:text-red-400 hover:underline"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                Upload and manage images and videos that you can reuse across your posts.
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
                className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors relative"
              >
                <PlusIcon className="w-8 h-8 text-gray-400 dark:text-primary-500" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-1">
                  Drop files here or click to upload
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
                      All ({filteredItems.length})
                    </button>
                    <button
                      onClick={() => setFilterType('image')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                        filterType === 'image'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      Images ({filteredItems.filter(m => m.type === 'image').length})
                    </button>
                    <button
                      onClick={() => setFilterType('video')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                        filterType === 'video'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      Videos ({filteredItems.filter(m => m.type === 'video').length})
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedItems.size > 0 && (
                    <>
                      <button
                        onClick={() => setShowMoveModal(true)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-md hover:bg-primary-100 dark:hover:bg-primary-900/50"
                      >
                        <FolderIcon className="w-4 h-4" />
                        Move ({selectedItems.size})
                      </button>
                      <button
                        onClick={handleBulkDelete}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/50"
                      >
                        <TrashIcon className="w-4 h-4" />
                        Delete ({selectedItems.size})
                      </button>
                    </>
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
                  No media in this folder
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  {filterType === 'all' 
                    ? 'Upload images or videos to get started'
                    : `No ${filterType}s in this folder. Try uploading some!`}
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
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none px-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingItem(item);
                        }}
                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium pointer-events-auto whitespace-nowrap"
                      >
                        View
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUseInCompose(item);
                        }}
                        className="flex-1 px-3 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-medium pointer-events-auto whitespace-nowrap"
                      >
                        Use in Post
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete ${item.name}?`)) {
                            handleDelete(item.id);
                          }
                        }}
                        className="flex-1 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium pointer-events-auto whitespace-nowrap flex items-center justify-center gap-1"
                      >
                        <TrashIcon className="w-4 h-4" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <CreateFolderModal
        isOpen={showCreateFolderModal}
        onClose={() => {
          setShowCreateFolderModal(false);
          setEditingFolder(null);
        }}
        onCreate={editingFolder ? handleRenameFolder : handleCreateFolder}
        editingFolder={editingFolder}
      />

      <MoveToFolderModal
        isOpen={showMoveModal}
        onClose={() => setShowMoveModal(false)}
        folders={folders}
        currentFolderId={selectedFolderId}
        onMove={handleMoveItems}
        itemCount={selectedItems.size}
      />

      {/* View Modal */}
      {viewingItem && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => setViewingItem(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setViewingItem(null)}
              className="absolute top-4 right-4 z-10 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-full p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
            {viewingItem.type === 'video' ? (
              <video
                src={viewingItem.url}
                controls
                autoPlay
                className="w-full h-auto max-h-[90vh] rounded-lg"
              />
            ) : (
              <img
                src={viewingItem.url}
                alt={viewingItem.name}
                className="w-full h-auto max-h-[90vh] object-contain rounded-lg bg-black"
              />
            )}
            <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {viewingItem.name}
              </h3>
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span>Uploaded: {new Date(viewingItem.uploadedAt).toLocaleString()}</span>
                {viewingItem.size && (
                  <span>Size: {(viewingItem.size / 1024 / 1024).toFixed(2)} MB</span>
                )}
                {viewingItem.usedInPosts && viewingItem.usedInPosts.length > 0 && (
                  <span className="text-primary-600 dark:text-primary-400">
                    Used in {viewingItem.usedInPosts.length} post(s)
                  </span>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    handleUseInCompose(viewingItem);
                    setViewingItem(null);
                  }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                >
                  Use in Post
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete ${viewingItem.name}?`)) {
                      handleDelete(viewingItem.id);
                      setViewingItem(null);
                    }
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaLibrary;
