import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MediaLibraryItem, MediaFolder } from '../types';
import { useAppContext } from './AppContext';
import { UploadIcon, TrashIcon, ImageIcon, VideoIcon, CheckCircleIcon, PlusIcon, XMarkIcon, FolderIcon, MicrophoneIcon } from './icons/UIIcons';
import { auth, db, storage } from '../firebaseConfig';
import { collection, setDoc, doc, getDocs, deleteDoc, query, orderBy, updateDoc, writeBatch, where } from 'firebase/firestore';
// @ts-ignore
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { CreateFolderModal } from './CreateFolderModal';
import { MoveToFolderModal } from './MoveToFolderModal';
import {
  AUDIO_RECORDER_TIMESLICE_MS,
  createAudioMediaRecorder,
  effectiveBlobType,
  fileExtensionForAudioMime,
  normalizeVoiceRecordingFileType,
  stopMediaRecorderSafe,
} from '../src/lib/browserMediaRecording';
import { AudioLevelMeter } from './AudioLevelMeter';
import { RecordingDurationLabel } from './RecordingDurationLabel';

const GENERAL_FOLDER_ID = 'general';

export const MediaLibrary: React.FC = () => {
  const { user, showToast, setActivePage } = useAppContext();
  const [mediaItems, setMediaItems] = useState<MediaLibraryItem[]>([]);
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(GENERAL_FOLDER_ID);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video' | 'audio'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewingItem, setViewingItem] = useState<MediaLibraryItem | null>(null);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<{ id: string; name: string } | null>(null);
  
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingCountdown, setRecordingCountdown] = useState<number | null>(null);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [voiceMeterStream, setVoiceMeterStream] = useState<MediaStream | null>(null);
  const [voiceMeterKey, setVoiceMeterKey] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  /** Firestore/Storage rules key off request.auth.uid — path must use the signed-in principal. */
  const fsOwnerUid = () => auth.currentUser?.uid ?? user?.id ?? '';

  // Load folders
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const loadFolders = async () => {
      try {
        const uid = fsOwnerUid();
        if (!uid) return;
        const foldersRef = collection(db, 'users', uid, 'media_folders');
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
            userId: uid,
            name: 'General',
            createdAt: new Date().toISOString(),
          };
          await setDoc(doc(db, 'users', uid, 'media_folders', GENERAL_FOLDER_ID), generalFolderData);
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
        const uid = fsOwnerUid();
        if (!uid) {
          setIsLoading(false);
          return;
        }
        const mediaRef = collection(db, 'users', uid, 'media_library');
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
    const uid = fsOwnerUid();
    if (!uid) return;

    setIsUploading(true);
    const uploadPromises: Promise<void>[] = [];

    Array.from(files).forEach((file) => {
      const uploadPromise = (async () => {
        try {
          let fileType: 'image' | 'video' | 'audio' = 'image';
          if (file.type.startsWith('video')) {
            fileType = 'video';
          } else if (file.type.startsWith('audio')) {
            fileType = 'audio';
          }
          const timestamp = Date.now();
          const storagePath = `users/${uid}/media_library/${timestamp}_${file.name}`;
          const storageRef = ref(storage, storagePath);

          await uploadBytes(storageRef, file, { contentType: file.type });
          const mediaUrl = await getDownloadURL(storageRef);

          const mediaItem: MediaLibraryItem = {
            id: timestamp.toString(),
            userId: uid,
            url: mediaUrl,
            name: file.name,
            type: fileType,
            mimeType: file.type,
            size: file.size,
            uploadedAt: new Date().toISOString(),
            usedInPosts: [],
            tags: fileType === 'audio' ? ['voice-note'] : [],
            folderId: selectedFolderId,
          };

          // Save to Firestore
          await setDoc(doc(db, 'users', uid, 'media_library', mediaItem.id), mediaItem);
          
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
    const uid = fsOwnerUid();
    if (!uid) return;
    
    try {
      const item = mediaItems.find(m => m.id === id);
      if (!item) return;

      await deleteDoc(doc(db, 'users', uid, 'media_library', id));
      setMediaItems(prev => prev.filter(m => m.id !== id));
      showToast('Media deleted from library', 'success');
    } catch (error) {
      console.error('Failed to delete media:', error);
      showToast('Failed to delete media', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (!user || selectedItems.size === 0) return;
    const uid = fsOwnerUid();
    if (!uid) return;

    try {
      const deletePromises = Array.from(selectedItems).map(id => 
        deleteDoc(doc(db, 'users', uid, 'media_library', id))
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
    // Navigate first, then dispatch event after a short delay to ensure Compose is mounted
    setActivePage('compose');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('mediaLibraryItemAdded'));
    }, 100);
    showToast('Opening Write Captions with selected media...', 'success');
  };

  // Folder management functions
  const handleCreateFolder = async (name: string) => {
    if (!user) return;
    const uid = fsOwnerUid();
    if (!uid) return;

    // Check for duplicate names
    const existingFolder = folders.find(f => f.name.toLowerCase() === name.toLowerCase());
    if (existingFolder) {
      showToast('A folder with this name already exists', 'error');
      throw new Error('Duplicate folder name');
    }

    const folderId = `folder_${Date.now()}`;
    const newFolder: MediaFolder = {
      id: folderId,
      userId: uid,
      name,
      createdAt: new Date().toISOString(),
      itemCount: 0,
    };

    await setDoc(doc(db, 'users', uid, 'media_folders', folderId), newFolder);
    setFolders(prev => [...prev, newFolder].sort((a, b) => {
      if (a.id === GENERAL_FOLDER_ID) return -1;
      if (b.id === GENERAL_FOLDER_ID) return 1;
      return a.name.localeCompare(b.name);
    }));
    showToast(`Folder "${name}" created`, 'success');
  };

  const handleRenameFolder = async (name: string) => {
    if (!user || !editingFolder) return;
    const uid = fsOwnerUid();
    if (!uid) return;

    // Check for duplicate names (excluding current folder)
    const existingFolder = folders.find(f => 
      f.id !== editingFolder.id && f.name.toLowerCase() === name.toLowerCase()
    );
    if (existingFolder) {
      showToast('A folder with this name already exists', 'error');
      throw new Error('Duplicate folder name');
    }

    await updateDoc(doc(db, 'users', uid, 'media_folders', editingFolder.id), {
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
    const uid = fsOwnerUid();
    if (!uid) return;

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
          batch.update(doc(db, 'users', uid, 'media_library', item.id), {
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
      await deleteDoc(doc(db, 'users', uid, 'media_folders', folderId));
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

  // Move single item to folder
  const handleMoveToFolder = async (itemId: string, folderId: string) => {
    if (!user) return;
    const uid = fsOwnerUid();
    if (!uid) return;

    try {
      await updateDoc(doc(db, 'users', uid, 'media_library', itemId), {
        folderId,
      });

      setMediaItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, folderId } : item
      ));

      showToast('Item moved to folder', 'success');
    } catch (error) {
      console.error('Failed to move item:', error);
      showToast('Failed to move item', 'error');
    }
  };

  const handleMoveItems = async (targetFolderId: string) => {
    if (!user || selectedItems.size === 0) return;
    const uid = fsOwnerUid();
    if (!uid) return;

    try {
      const batch = writeBatch(db);
      Array.from(selectedItems).forEach(itemId => {
        batch.update(doc(db, 'users', uid, 'media_library', itemId), {
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

  // Voice recording functions
  const [isRequestingMic, setIsRequestingMic] = useState(false);
  
  const startRecording = async () => {
    let stream: MediaStream | null = null;
    try {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (permissionStatus.state === 'denied') {
          showToast('Microphone access was denied. Please enable it in your browser settings.', 'error');
          return;
        }
        if (permissionStatus.state === 'prompt') {
          setIsRequestingMic(true);
          showToast('Please allow microphone access to record voice notes', 'info');
        }
      } catch {
        /* permissions.query unsupported */
      }

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsRequestingMic(false);
      setVoiceMeterStream(stream);
      setVoiceMeterKey((k) => k + 1);

      setRecordingCountdown(3);
      await new Promise((r) => setTimeout(r, 1000));
      setRecordingCountdown(2);
      await new Promise((r) => setTimeout(r, 1000));
      setRecordingCountdown(1);
      await new Promise((r) => setTimeout(r, 1000));
      setRecordingCountdown(null);

      const mediaRecorder = createAudioMediaRecorder(stream);
      const requestedMime = mediaRecorder.mimeType || undefined;
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        setVoiceMeterStream(null);
        stream?.getTracks().forEach((t) => t.stop());
        const blobType = effectiveBlobType(mediaRecorder, requestedMime);
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
        
        const voiceUid = auth.currentUser?.uid ?? user?.id;
        if (!voiceUid) {
          showToast('Please sign in to save recordings', 'error');
          setIsRecording(false);
          return;
        }
        
        if (audioBlob.size < 256) {
          showToast('Recording was too short or empty.', 'error');
          setIsRecording(false);
          return;
        }
        
        setIsSavingVoice(true);
        
        try {
          const normType = normalizeVoiceRecordingFileType(blobType);
          const ext = fileExtensionForAudioMime(normType);
          const timestamp = Date.now();
          const fileName = `voice_${timestamp}.${ext}`;
          const storagePath = `users/${voiceUid}/media_library/${fileName}`;
          const storageRef = ref(storage, storagePath);
          
          await uploadBytes(storageRef, audioBlob, { contentType: normType });
          const mediaUrl = await getDownloadURL(storageRef);
          
          const mediaItem: MediaLibraryItem = {
            id: timestamp.toString(),
            userId: voiceUid,
            url: mediaUrl,
            name: fileName,
            type: 'audio',
            mimeType: normType,
            size: audioBlob.size,
            uploadedAt: new Date().toISOString(),
            usedInPosts: [],
            tags: ['voice-recording'],
            folderId: selectedFolderId,
          };
          
          await setDoc(doc(db, 'users', voiceUid, 'media_library', mediaItem.id), mediaItem);
          
          setMediaItems(prev => [mediaItem, ...prev]);
          showToast('Voice note saved to vault', 'success');
        } catch (error) {
          console.error('Failed to save voice recording:', error);
          showToast('Failed to save voice recording', 'error');
        } finally {
          setIsSavingVoice(false);
          setIsRecording(false);
        }
      };
      
      mediaRecorder.start(AUDIO_RECORDER_TIMESLICE_MS);
      setIsRecording(true);
    } catch (error: unknown) {
      console.error('Failed to start recording:', error);
      stream?.getTracks().forEach((t) => t.stop());
      setIsRequestingMic(false);
      setRecordingCountdown(null);
      setVoiceMeterStream(null);
      
      // Provide specific error messages
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          showToast('Microphone access denied. Please allow microphone access in your browser settings.', 'error');
        } else if (error.name === 'NotFoundError') {
          showToast('No microphone found. Please connect a microphone and try again.', 'error');
        } else {
          showToast('Could not access microphone. Please check your settings.', 'error');
        }
      } else {
        showToast('Could not access microphone', 'error');
      }
    }
  };

  const stopRecording = () => {
    stopMediaRecorderSafe(mediaRecorderRef.current);
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
        <p className="text-gray-600 dark:text-gray-400">Please sign in to access My Vault.</p>
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-4 sm:mb-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                  My Vault
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Upload and manage images, videos, and voice notes that you can reuse across your posts.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Voice Recording Button */}
                {isSavingVoice ? (
                  <div className="px-4 py-2 text-sm bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-md flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </div>
                ) : isRequestingMic ? (
                  <div className="px-4 py-2 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    Allow microphone...
                  </div>
                ) : recordingCountdown !== null ? (
                  <div className="px-4 py-2 text-sm bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-md flex items-center gap-2">
                    Starting in {recordingCountdown}...
                  </div>
                ) : isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-2 animate-pulse"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    Stop Recording
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center gap-2"
                  >
                    <MicrophoneIcon className="w-4 h-4" />
                    Record Voice
                  </button>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center gap-2 disabled:opacity-50"
                >
                  <UploadIcon className="w-4 h-4" />
                  {isUploading ? 'Uploading...' : 'Upload Media'}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
            </div>
            {voiceMeterStream && (recordingCountdown !== null || isRecording) ? (
              <div className="mt-3 max-w-xl space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <RecordingDurationLabel active={isRecording && recordingCountdown === null} />
                  {recordingCountdown !== null ? (
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Get ready… {recordingCountdown}
                    </span>
                  ) : null}
                </div>
                <AudioLevelMeter key={`vault-voice-${voiceMeterKey}`} stream={voiceMeterStream} />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 overflow-x-hidden">
            {/* Folder Sidebar */}
            <div className="md:col-span-3">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 overflow-hidden max-w-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Folders</h3>
                  <button
                    onClick={() => {
                      setEditingFolder(null);
                      setShowCreateFolderModal(true);
                    }}
                    className="p-1 text-primary-600 dark:text-primary-400 hover:text-primary-700"
                    title="Create folder"
                  >
                    <PlusIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                  {folders.map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => setSelectedFolderId(folder.id)}
                      className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between text-sm transition-colors ${
                        selectedFolderId === folder.id
                          ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FolderIcon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{folder.name}</span>
                      </div>
                      {folder.itemCount !== undefined && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
                          {folder.itemCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {currentFolder && currentFolder.id !== GENERAL_FOLDER_ID && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
                      <FolderIcon className="w-4 h-4" />
                      <span className="truncate">{currentFolder.name}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingFolder({ id: currentFolder.id, name: currentFolder.name });
                          setShowCreateFolderModal(true);
                        }}
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDeleteFolder(currentFolder.id)}
                        className="flex-1 px-3 py-2 text-sm border border-red-200 dark:border-red-700 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="md:col-span-9 min-w-0 overflow-hidden">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4 overflow-x-auto">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setFilterType('all')}
                        className={`px-3 py-1 rounded-md text-sm ${
                          filterType === 'all'
                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setFilterType('image')}
                        className={`px-3 py-1 rounded-md text-sm ${
                          filterType === 'image'
                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        Images
                      </button>
                      <button
                        onClick={() => setFilterType('video')}
                        className={`px-3 py-1 rounded-md text-sm ${
                          filterType === 'video'
                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        Videos
                      </button>
                      <button
                        onClick={() => setFilterType('audio')}
                        className={`px-3 py-1 rounded-md text-sm flex items-center gap-1.5 ${
                          filterType === 'audio'
                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <MicrophoneIcon className="w-4 h-4" />
                        Voice notes
                      </button>
                    </div>
                    {selectedItems.size > 0 && (
                      <>
                        <button
                          onClick={() => setShowMoveModal(true)}
                          className="px-3 py-1 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md"
                        >
                          Move {selectedItems.size} selected
                        </button>
                        <button
                          onClick={handleBulkDelete}
                          className="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md"
                        >
                          Delete {selectedItems.size} selected
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {filteredItems.length > 0 && (
                      <button
                        onClick={handleSelectAll}
                        className="px-3 py-1 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md"
                      >
                        {selectedItems.size === filteredItems.length ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {filteredItems.length} items
                    </span>
                    <button
                      onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {viewMode === 'grid' ? 'List' : 'Grid'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Drop Zone / Grid */}
              <div
                ref={dropZoneRef}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => {
                  if (filteredItems.length === 0) {
                    fileInputRef.current?.click();
                  }
                }}
                className={`bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-4 sm:p-6 min-h-64 overflow-hidden ${
                  viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4' : 'flex flex-col space-y-2'
                } ${filteredItems.length === 0 ? 'cursor-pointer' : ''}`}
              >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
              {isUploading && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
                  <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full"></div>
                </div>
              )}
              {filteredItems.length === 0 ? (
                <div className="col-span-full text-center py-12">
                  <UploadIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600 dark:text-gray-400 mb-2">
                    No media in this folder
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500">
                    Drag and drop files here or click to upload
                  </p>
                </div>
              ) : (
                filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                      selectedItems.has(item.id)
                        ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600'
                    } ${viewMode === 'grid' ? 'aspect-square' : 'flex items-center gap-4'}`}
                    onClick={() => setViewingItem(item)}
                  >
                    {item.type === 'audio' ? (
                      <div className={`${viewMode === 'grid' ? 'w-full h-full' : 'w-24 h-24'} bg-primary-100 dark:bg-primary-900/30 flex flex-col items-center justify-center p-3`}>
                        <MicrophoneIcon className="w-8 h-8 text-primary-500 dark:text-primary-400 mb-2" />
                        <audio
                          src={item.url}
                          controls
                          className="w-full max-w-[140px]"
                          onClick={(e) => e.stopPropagation()}
                          style={{ height: '32px' }}
                        />
                      </div>
                    ) : item.type === 'video' ? (
                      <video
                        src={item.url}
                        className={`${viewMode === 'grid' ? 'w-full h-full' : 'w-24 h-24'} object-contain bg-gray-100 dark:bg-gray-700`}
                        controls={false}
                        preload="metadata"
                        playsInline
                        muted
                        onLoadedMetadata={(e) => {
                          const video = e.currentTarget;
                          if (video.duration && video.duration > 0) {
                            const previewTime = Math.min(1, video.duration * 0.1);
                            video.currentTime = previewTime;
                          }
                        }}
                      />
                    ) : (
                      <img
                        src={item.url}
                        alt={item.name}
                        className={`${viewMode === 'grid' ? 'w-full h-full' : 'w-24 h-24'} object-contain bg-gray-100 dark:bg-gray-700`}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          console.error('Failed to load image:', item.url);
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ccc" width="100" height="100"/%3E%3Ctext x="50" y="50" text-anchor="middle" fill="%23999"%3EFailed to load%3C/text%3E%3C/svg%3E';
                        }}
                      />
                    )}
                    
                    {/* Overlay with actions */}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-opacity flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingItem(item);
                        }}
                        className="p-2 bg-white dark:bg-gray-800 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 shadow-md"
                        title="View"
                      >
                        <ImageIcon className="w-4 h-4 text-gray-900 dark:text-gray-100" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUseInCompose(item);
                        }}
                        className="p-2 bg-white dark:bg-gray-800 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 shadow-md"
                      >
                        <CheckCircleIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete ${item.name}?`)) {
                            handleDelete(item.id);
                          }
                        }}
                        className="p-2 bg-white dark:bg-gray-800 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 shadow-md"
                        title="Delete"
                      >
                        <TrashIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </button>
                    </div>

                    {/* Selection checkbox */}
                    <div
                      className="absolute top-2 left-2 z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectItem(item.id);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="w-4 h-4 text-primary-600 rounded cursor-pointer"
                      />
                    </div>

                    {/* Type indicator */}
                    <div className="absolute top-2 right-2">
                      {item.type === 'audio' ? (
                        <MicrophoneIcon className="w-4 h-4 text-white bg-primary-500/80 rounded p-1" />
                      ) : item.type === 'video' ? (
                        <VideoIcon className="w-4 h-4 text-white bg-black/50 rounded p-1" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-white bg-black/50 rounded p-1" />
                      )}
                    </div>

                    {/* Item info (for list view) */}
                    {viewMode === 'list' && (
                      <div className="flex-1 p-3 min-w-0">
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
                    )}
                  </div>
                  ))
                )}
              </div>
            </div>
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
        onClose={() => {
          setShowMoveModal(false);
          setViewingItem(null);
        }}
        folders={folders}
        currentFolderId={selectedFolderId}
        onMove={async (targetFolderId: string) => {
          if (selectedItems.size === 1) {
            // Single item move (from view modal)
            const itemId = Array.from(selectedItems)[0];
            await handleMoveToFolder(itemId, targetFolderId);
            setViewingItem(null);
            setSelectedItems(new Set());
          } else {
            // Bulk move
            await handleMoveItems(targetFolderId);
          }
        }}
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
            {viewingItem.type === 'audio' ? (
              <div className="bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/40 dark:to-primary-800/40 rounded-lg p-8 flex flex-col items-center justify-center">
                <MicrophoneIcon className="w-20 h-20 text-primary-500 dark:text-primary-400 mb-6" />
                <audio
                  src={viewingItem.url}
                  controls
                  autoPlay
                  className="w-full max-w-md"
                />
              </div>
            ) : viewingItem.type === 'video' ? (
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
              <div className="mt-4 flex gap-2 flex-wrap">
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
                    setSelectedItems(new Set([viewingItem.id]));
                    setShowMoveModal(true);
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Move to Folder
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
