import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MediaLibraryItem, MediaFolder } from '../types';
import { useAppContext } from './AppContext';
import { UploadIcon, TrashIcon, ImageIcon, VideoIcon, CheckCircleIcon, PlusIcon, XMarkIcon, FolderIcon, EditIcon, SparklesIcon } from './icons/UIIcons';
import { db, storage } from '../firebaseConfig';
import { collection, setDoc, doc, getDocs, deleteDoc, query, orderBy, updateDoc, writeBatch, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const GENERAL_FOLDER_ID = 'general';
const ONLYFANS_DEFAULT_FOLDERS = ['Photosets', 'Videos', 'Teasers', 'Roleplay Content'];

export interface OnlyFansMediaItem extends MediaLibraryItem {
    aiTags?: {
        outfits?: string[];
        poses?: string[];
        vibes?: string[];
    };
}

export const OnlyFansMediaVault: React.FC = () => {
    const { user, showToast } = useAppContext();
    const [mediaItems, setMediaItems] = useState<OnlyFansMediaItem[]>([]);
    const [folders, setFolders] = useState<MediaFolder[]>([]);
    const [selectedFolderId, setSelectedFolderId] = useState<string>(GENERAL_FOLDER_ID);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dropZoneRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [viewingItem, setViewingItem] = useState<OnlyFansMediaItem | null>(null);
    const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
    const [editingItem, setEditingItem] = useState<OnlyFansMediaItem | null>(null);
    const [isGeneratingTags, setIsGeneratingTags] = useState(false);
    const [showEditor, setShowEditor] = useState(false);
    const [editorItem, setEditorItem] = useState<OnlyFansMediaItem | null>(null);

    // Initialize default OnlyFans folders
    useEffect(() => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        const initializeFolders = async () => {
            try {
                const foldersRef = collection(db, 'users', user.id, 'onlyfans_media_folders');
                const snapshot = await getDocs(foldersRef);
                
                const existingFolders: MediaFolder[] = [];
                snapshot.forEach((doc) => {
                    existingFolders.push({
                        id: doc.id,
                        ...doc.data(),
                    } as MediaFolder);
                });

                // Create default OnlyFans folders if they don't exist
                const batch = writeBatch(db);
                const foldersToCreate: MediaFolder[] = [];
                
                ONLYFANS_DEFAULT_FOLDERS.forEach(folderName => {
                    const exists = existingFolders.some(f => f.name === folderName);
                    if (!exists) {
                        const folderId = `onlyfans_${folderName.toLowerCase().replace(/\s+/g, '_')}`;
                        const newFolder: MediaFolder = {
                            id: folderId,
                            userId: user.id,
                            name: folderName,
                            createdAt: new Date().toISOString(),
                            itemCount: 0,
                        };
                        foldersToCreate.push(newFolder);
                        batch.set(doc(db, 'users', user.id, 'onlyfans_media_folders', folderId), newFolder);
                    }
                });

                // Ensure General folder exists
                const generalFolder = existingFolders.find(f => f.id === GENERAL_FOLDER_ID);
                if (!generalFolder) {
                    const generalFolderData: MediaFolder = {
                        id: GENERAL_FOLDER_ID,
                        userId: user.id,
                        name: 'General',
                        createdAt: new Date().toISOString(),
                    };
                    batch.set(doc(db, 'users', user.id, 'media_folders', GENERAL_FOLDER_ID), generalFolderData);
                    foldersToCreate.push(generalFolderData);
                }

                if (foldersToCreate.length > 0) {
                    await batch.commit();
                }

                // Combine existing and new folders, sort
                const allFolders = [...existingFolders, ...foldersToCreate].sort((a, b) => {
                    if (a.id === GENERAL_FOLDER_ID) return -1;
                    if (b.id === GENERAL_FOLDER_ID) return 1;
                    // Sort OnlyFans default folders first, then alphabetical
                    const aIndex = ONLYFANS_DEFAULT_FOLDERS.indexOf(a.name);
                    const bIndex = ONLYFANS_DEFAULT_FOLDERS.indexOf(b.name);
                    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                    if (aIndex !== -1) return -1;
                    if (bIndex !== -1) return 1;
                    return a.name.localeCompare(b.name);
                });

                setFolders(allFolders);
            } catch (error) {
                console.error('Failed to initialize folders:', error);
            }
        };

        initializeFolders();
    }, [user]);

    // Load media items
    useEffect(() => {
        if (!user) {
            setIsLoading(false);
            return;
        }

        const loadMedia = async () => {
            try {
                const mediaRef = collection(db, 'users', user.id, 'onlyfans_media_library');
                const q = query(mediaRef, orderBy('uploadedAt', 'desc'));
                const snapshot = await getDocs(q);
                
                const items: OnlyFansMediaItem[] = [];
                snapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    items.push({
                        id: docSnap.id,
                        ...data,
                        folderId: data.folderId || GENERAL_FOLDER_ID,
                    } as OnlyFansMediaItem);
                });
                
                setMediaItems(items);
            } catch (error) {
                console.error('Failed to load media library:', error);
                showToast('Failed to load media vault', 'error');
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

    const handleFileSelect = useCallback(async (files: FileList | null) => {
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

                    const mediaItem: OnlyFansMediaItem = {
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
                        folderId: selectedFolderId,
                        // aiTags is optional and will be added when AI tagging is generated
                    };

                    await setDoc(doc(db, 'users', user.id, 'onlyfans_media_library', mediaItem.id), mediaItem);
                    
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
    }, [user, selectedFolderId, showToast]);

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
            await deleteDoc(doc(db, 'users', user.id, 'onlyfans_media_library', id));
            setMediaItems(prev => prev.filter(m => m.id !== id));
            showToast('Media deleted', 'success');
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

    // Generate AI tags
    const handleGenerateAITags = async (item: OnlyFansMediaItem) => {
        if (!user) return;

        setIsGeneratingTags(true);
        try {
            // Call API to generate AI tags
            const { auth } = await import('../firebaseConfig');
            const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
            const response = await fetch('/api/generateMediaTags', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    mediaUrl: item.url,
                    mediaType: item.type,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate tags');
            }

            const data = await response.json();
            const aiTags = data.tags || { outfits: [], poses: [], vibes: [] };

            // Update item with AI tags
            await updateDoc(doc(db, 'users', user.id, 'onlyfans_media_library', item.id), {
                aiTags,
            });

            setMediaItems(prev => prev.map(m => 
                m.id === item.id ? { ...m, aiTags } : m
            ));

            showToast('AI tags generated successfully!', 'success');
        } catch (error) {
            console.error('Error generating AI tags:', error);
            showToast('Failed to generate AI tags', 'error');
        } finally {
            setIsGeneratingTags(false);
        }
    };

    // Move item to folder
    const handleMoveToFolder = async (itemId: string, folderId: string) => {
        if (!user) return;

        try {
            await updateDoc(doc(db, 'users', user.id, 'media_library', itemId), {
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

    const getFilteredItems = () => {
        let filtered = mediaItems.filter(item => 
            (item.folderId || GENERAL_FOLDER_ID) === selectedFolderId
        );

        if (filterType !== 'all') {
            filtered = filtered.filter(item => item.type === filterType);
        }

        return filtered;
    };

    const filteredItems = getFilteredItems();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-500 dark:text-gray-400">Loading media vault...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Media Vault</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Organize and manage your OnlyFans content with AI tagging and editing tools.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center gap-2 disabled:opacity-50"
                    >
                        <UploadIcon className="w-4 h-4" />
                        {isUploading ? 'Uploading...' : 'Upload Media'}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        onChange={(e) => handleFileSelect(e.target.files)}
                        className="hidden"
                    />
                </div>
            </div>

            <div className="grid grid-cols-12 gap-6">
                {/* Folder Sidebar */}
                <div className="col-span-3">
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-gray-900 dark:text-white">Folders</h3>
                            <button
                                onClick={() => setShowCreateFolderModal(true)}
                                className="p-1 text-primary-600 dark:text-primary-400 hover:text-primary-700"
                                title="Create folder"
                            >
                                <PlusIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="space-y-1">
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
                                    <div className="flex items-center gap-2">
                                        <FolderIcon className="w-4 h-4" />
                                        <span>{folder.name}</span>
                                    </div>
                                    {folder.itemCount !== undefined && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            {folder.itemCount}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="col-span-9">
                    {/* Filters and View Toggle */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
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
                                </div>
                                {selectedItems.size > 0 && (
                                    <button
                                        onClick={handleBulkDelete}
                                        className="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md"
                                    >
                                        Delete {selectedItems.size} selected
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
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
                        className={`bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-6 min-h-64 ${
                            viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4' : 'space-y-2'
                        }`}
                    >
                        {filteredItems.length === 0 ? (
                            <div className="col-span-full text-center py-12">
                                <UploadIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                                <p className="text-gray-600 dark:text-gray-400 mb-2">
                                    No media in this folder
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-500">
                                    Drag and drop files here or click Upload Media
                                </p>
                            </div>
                        ) : (
                            filteredItems.map(item => (
                                <MediaItemCard
                                    key={item.id}
                                    item={item}
                                    isSelected={selectedItems.has(item.id)}
                                    onSelect={() => handleSelectItem(item.id)}
                                    onDelete={() => handleDelete(item.id)}
                                    onView={() => setViewingItem(item)}
                                    onEdit={() => {
                                        setEditorItem(item);
                                        setShowEditor(true);
                                        setViewingItem(null);
                                    }}
                                    onGenerateTags={() => handleGenerateAITags(item)}
                                    onMoveToFolder={(folderId) => handleMoveToFolder(item.id, folderId)}
                                    folders={folders}
                                    isGeneratingTags={isGeneratingTags && editingItem?.id === item.id}
                                    viewMode={viewMode}
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* View/Edit Modal */}
            {viewingItem && !showEditor && (
                <MediaViewModal
                    item={viewingItem}
                    onClose={() => setViewingItem(null)}
                    onDelete={() => {
                        handleDelete(viewingItem.id);
                        setViewingItem(null);
                    }}
                    onGenerateTags={() => handleGenerateAITags(viewingItem)}
                    onMoveToFolder={(folderId) => {
                        handleMoveToFolder(viewingItem.id, folderId);
                        setViewingItem(null);
                    }}
                    folders={folders}
                    isGeneratingTags={isGeneratingTags}
                />
            )}

            {/* Media Editor Modal */}
            {showEditor && editorItem && editorItem.type === 'image' && (
                <MediaEditor
                    item={editorItem}
                    onClose={() => {
                        setShowEditor(false);
                        setEditorItem(null);
                    }}
                    onSave={async (editedImageUrl: string) => {
                        if (!user) return;
                        try {
                            // Upload edited image to Firebase Storage
                            const response = await fetch(editedImageUrl);
                            const blob = await response.blob();
                            const timestamp = Date.now();
                            const storagePath = `users/${user.id}/onlyfans_media_library/${timestamp}_edited_${editorItem.name}`;
                            const storageRef = ref(storage, storagePath);
                            await uploadBytes(storageRef, blob);
                            const newUrl = await getDownloadURL(storageRef);
                            
                            // Update Firestore with new URL
                            await updateDoc(doc(db, 'users', user.id, 'onlyfans_media_library', editorItem.id), {
                                url: newUrl,
                                editedAt: new Date().toISOString(),
                            });
                            
                            // Update local state
                            setMediaItems(prev => prev.map(m => 
                                m.id === editorItem.id ? { ...m, url: newUrl } : m
                            ));
                            
                            setShowEditor(false);
                            setEditorItem(null);
                            showToast('Image edited and saved successfully!', 'success');
                        } catch (error) {
                            console.error('Error saving edited image:', error);
                            showToast('Failed to save edited image', 'error');
                        }
                    }}
                />
            )}

            {/* Create Folder Modal */}
            {showCreateFolderModal && (
                <CreateFolderModal
                    onClose={() => setShowCreateFolderModal(false)}
                    onCreate={async (name: string) => {
                        if (!user) return;
                        const folderId = `folder_${Date.now()}`;
                        const newFolder: MediaFolder = {
                            id: folderId,
                            userId: user.id,
                            name,
                            createdAt: new Date().toISOString(),
                            itemCount: 0,
                        };
                        await setDoc(doc(db, 'users', user.id, 'onlyfans_media_folders', folderId), newFolder);
                        setFolders(prev => [...prev, newFolder].sort((a, b) => a.name.localeCompare(b.name)));
                        setShowCreateFolderModal(false);
                        showToast(`Folder "${name}" created`, 'success');
                    }}
                />
            )}
        </div>
    );
};

// Media Item Card Component
const MediaItemCard: React.FC<{
    item: OnlyFansMediaItem;
    isSelected: boolean;
    onSelect: () => void;
    onDelete: () => void;
    onView: () => void;
    onEdit: () => void;
    onGenerateTags: () => void;
    onMoveToFolder: (folderId: string) => void;
    folders: MediaFolder[];
    isGeneratingTags: boolean;
    viewMode: 'grid' | 'list';
}> = ({ item, isSelected, onSelect, onView, onEdit, onGenerateTags, isGeneratingTags, viewMode }) => {
    return (
        <div
            className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                isSelected
                    ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600'
            } ${viewMode === 'grid' ? 'aspect-square' : 'flex items-center gap-4'}`}
            onClick={onView}
        >
            {item.type === 'video' ? (
                <video
                    src={item.url}
                    className={`${viewMode === 'grid' ? 'w-full h-full' : 'w-24 h-24'} object-contain bg-gray-100 dark:bg-gray-700`}
                    controls={false}
                />
            ) : (
                <img
                    src={item.url}
                    alt={item.name}
                    className={`${viewMode === 'grid' ? 'w-full h-full' : 'w-24 h-24'} object-contain bg-gray-100 dark:bg-gray-700`}
                />
            )}
            
            {/* Overlay with actions */}
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-opacity flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onGenerateTags();
                    }}
                    className="p-2 bg-white rounded-full hover:bg-gray-100"
                    title="Generate AI Tags"
                    disabled={isGeneratingTags}
                >
                    <SparklesIcon className="w-4 h-4 text-primary-600" />
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                    }}
                    className="p-2 bg-white rounded-full hover:bg-gray-100"
                    title="Edit"
                >
                    <EditIcon className="w-4 h-4 text-gray-700" />
                </button>
            </div>

            {/* Selection checkbox */}
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect();
                }}
                className="absolute top-2 left-2"
            >
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onSelect}
                    className="w-4 h-4 text-primary-600 rounded"
                />
            </div>

            {/* AI Tags indicator */}
            {item.aiTags && (
                <div className="absolute top-2 right-2 bg-primary-600 text-white text-xs px-2 py-1 rounded">
                    AI Tagged
                </div>
            )}
        </div>
    );
};

// Media View Modal Component (simplified - full version would include editing)
const MediaViewModal: React.FC<{
    item: OnlyFansMediaItem;
    onClose: () => void;
    onDelete: () => void;
    onGenerateTags: () => void;
    onMoveToFolder: (folderId: string) => void;
    folders: MediaFolder[];
    isGeneratingTags: boolean;
}> = ({ item, onClose, onDelete, onGenerateTags, onMoveToFolder, folders, isGeneratingTags }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{item.name}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
                <div className="p-6">
                    <div className="mb-4">
                        {item.type === 'video' ? (
                            <video src={item.url} controls className="w-full max-h-96 rounded-lg" />
                        ) : (
                            <img src={item.url} alt={item.name} className="w-full max-h-96 object-contain rounded-lg" />
                        )}
                    </div>
                    
                    {/* AI Tags Display */}
                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-gray-900 dark:text-white">AI Tags</h4>
                            <button
                                onClick={onGenerateTags}
                                disabled={isGeneratingTags}
                                className="px-3 py-1 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                <SparklesIcon className="w-4 h-4" />
                                {isGeneratingTags ? 'Generating...' : 'Generate Tags'}
                            </button>
                        </div>
                        {item.aiTags ? (
                            <div className="space-y-2">
                                {item.aiTags.outfits && item.aiTags.outfits.length > 0 && (
                                    <div>
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Outfits: </span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {item.aiTags.outfits.map((tag, idx) => (
                                                <span key={idx} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs rounded">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {item.aiTags.poses && item.aiTags.poses.length > 0 && (
                                    <div>
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Poses: </span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {item.aiTags.poses.map((tag, idx) => (
                                                <span key={idx} className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-xs rounded">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {item.aiTags.vibes && item.aiTags.vibes.length > 0 && (
                                    <div>
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Vibes: </span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {item.aiTags.vibes.map((tag, idx) => (
                                                <span key={idx} className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 text-xs rounded">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No AI tags yet. Click "Generate Tags" to analyze this media.</p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setShowEditor(true);
                                onClose();
                            }}
                            className="px-4 py-2 text-sm border border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-400 rounded-md hover:bg-primary-50 dark:hover:bg-primary-900/30 flex items-center gap-2"
                        >
                            <EditIcon className="w-4 h-4" />
                            Edit Image
                        </button>
                        <button
                            onClick={onDelete}
                            className="px-4 py-2 text-sm border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Media Editor Component
const MediaEditor: React.FC<{
    item: OnlyFansMediaItem;
    onClose: () => void;
    onSave: (editedImageUrl: string) => Promise<void>;
}> = ({ item, onClose, onSave }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const [brightness, setBrightness] = useState(0);
    const [contrast, setContrast] = useState(0);
    const [saturate, setSaturate] = useState(0);
    const [blur, setBlur] = useState(0);
    const [watermarkText, setWatermarkText] = useState('');
    const [watermarkPosition, setWatermarkPosition] = useState<'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'>('bottom-right');
    const [watermarkOpacity, setWatermarkOpacity] = useState(0.7);
    const [isProcessing, setIsProcessing] = useState(false);
    const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
    const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);
    const [isCropping, setIsCropping] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const applyFilters = useCallback(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx || !imageRef.current || !imageRef.current.complete) return;

        const img = imageRef.current;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Apply filters
        ctx.filter = `brightness(${100 + brightness}%) contrast(${100 + contrast}%) saturate(${100 + saturate}%) blur(${blur}px)`;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Reset filter for watermark
        ctx.filter = 'none';
        
        // Apply watermark
        if (watermarkText) {
            ctx.save();
            ctx.globalAlpha = watermarkOpacity;
            ctx.font = 'bold 24px Arial';
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            const metrics = ctx.measureText(watermarkText);
            const textWidth = metrics.width;
            const textHeight = 30;
            
            let x = 0;
            let y = 0;
            
            switch (watermarkPosition) {
                case 'bottom-right':
                    x = canvas.width - textWidth - 20;
                    y = canvas.height - 20;
                    break;
                case 'bottom-left':
                    x = 20;
                    y = canvas.height - 20;
                    break;
                case 'top-right':
                    x = canvas.width - textWidth - 20;
                    y = textHeight;
                    break;
                case 'top-left':
                    x = 20;
                    y = textHeight;
                    break;
            }
            
            ctx.strokeText(watermarkText, x, y);
            ctx.fillText(watermarkText, x, y);
            ctx.restore();
        }
    }, [brightness, contrast, saturate, blur, watermarkText, watermarkPosition, watermarkOpacity]);

    useEffect(() => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            if (canvasRef.current && imageRef.current) {
                const canvas = canvasRef.current;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                
                canvas.width = img.width;
                canvas.height = img.height;
                imageRef.current.src = item.url;
                imageRef.current.onload = () => {
                    applyFilters();
                };
            }
        };
        img.onerror = () => {
            // If crossOrigin fails, try without it
            const img2 = new Image();
            img2.onload = () => {
                if (canvasRef.current && imageRef.current) {
                    const canvas = canvasRef.current;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    
                    canvas.width = img2.width;
                    canvas.height = img2.height;
                    imageRef.current.src = item.url;
                    imageRef.current.onload = () => {
                        applyFilters();
                    };
                }
            };
            img2.src = item.url;
        };
        img.src = item.url;
    }, [item.url, applyFilters]);

    useEffect(() => {
        if (imageRef.current?.complete) {
            applyFilters();
        }
    }, [applyFilters]);

    const handleCrop = () => {
        if (!canvasRef.current || !cropStart || !cropEnd) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const x = Math.min(cropStart.x, cropEnd.x);
        const y = Math.min(cropStart.y, cropEnd.y);
        const width = Math.abs(cropEnd.x - cropStart.x);
        const height = Math.abs(cropEnd.y - cropStart.y);

        const imageData = ctx.getImageData(x, y, width, height);
        canvas.width = width;
        canvas.height = height;
        ctx.putImageData(imageData, 0, 0);
        
        setCropStart(null);
        setCropEnd(null);
        setIsCropping(false);
    };

    const handleGenerateThumbnail = () => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const thumbnailSize = 300;
        const thumbnailCanvas = document.createElement('canvas');
        thumbnailCanvas.width = thumbnailSize;
        thumbnailCanvas.height = thumbnailSize;
        const thumbnailCtx = thumbnailCanvas.getContext('2d');
        if (!thumbnailCtx) return;

        thumbnailCtx.drawImage(canvas, 0, 0, thumbnailSize, thumbnailSize);
        const thumbnailUrl = thumbnailCanvas.toDataURL('image/jpeg', 0.9);
        
        const link = document.createElement('a');
        link.download = `thumbnail_${item.name}`;
        link.href = thumbnailUrl;
        link.click();
    };

    const handleSave = async () => {
        if (!canvasRef.current) return;
        setIsProcessing(true);
        try {
            const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.9);
            await onSave(dataUrl);
        } catch (error) {
            console.error('Error saving:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isCropping || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setCropStart({ x, y });
        setCropEnd({ x, y });
    };

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isCropping || !cropStart || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setCropEnd({ x, y });
    };

    const handleCanvasMouseUp = () => {
        if (isCropping && cropStart && cropEnd) {
            handleCrop();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Image: {item.name}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Canvas Preview */}
                        <div className="lg:col-span-2">
                            <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4 flex items-center justify-center" ref={containerRef}>
                                <canvas
                                    ref={canvasRef}
                                    className="max-w-full max-h-[600px] cursor-crosshair"
                                    onMouseDown={handleCanvasMouseDown}
                                    onMouseMove={handleCanvasMouseMove}
                                    onMouseUp={handleCanvasMouseUp}
                                />
                                <img ref={imageRef} className="hidden" alt="Source" />
                            </div>
                        </div>

                        {/* Editing Controls */}
                        <div className="space-y-6">
                            {/* Lighting */}
                            <div>
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Lighting</h4>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                                            Brightness: {brightness > 0 ? '+' : ''}{brightness}%
                                        </label>
                                        <input
                                            type="range"
                                            min="-100"
                                            max="100"
                                            value={brightness}
                                            onChange={(e) => setBrightness(Number(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                                            Contrast: {contrast > 0 ? '+' : ''}{contrast}%
                                        </label>
                                        <input
                                            type="range"
                                            min="-100"
                                            max="100"
                                            value={contrast}
                                            onChange={(e) => setContrast(Number(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                                            Saturation: {saturate > 0 ? '+' : ''}{saturate}%
                                        </label>
                                        <input
                                            type="range"
                                            min="-100"
                                            max="100"
                                            value={saturate}
                                            onChange={(e) => setSaturate(Number(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Blur */}
                            <div>
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Blur</h4>
                                <div>
                                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                                        Blur Amount: {blur}px
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="20"
                                        value={blur}
                                        onChange={(e) => setBlur(Number(e.target.value))}
                                        className="w-full"
                                    />
                                </div>
                            </div>

                            {/* Crop */}
                            <div>
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Crop</h4>
                                <button
                                    onClick={() => setIsCropping(!isCropping)}
                                    className={`w-full px-4 py-2 rounded-md text-sm font-medium ${
                                        isCropping
                                            ? 'bg-primary-600 text-white'
                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                                    }`}
                                >
                                    {isCropping ? 'Click and drag to crop' : 'Enable Crop Tool'}
                                </button>
                            </div>

                            {/* Watermark */}
                            <div>
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Watermark</h4>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={watermarkText}
                                        onChange={(e) => setWatermarkText(e.target.value)}
                                        placeholder="Watermark text"
                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    />
                                    <select
                                        value={watermarkPosition}
                                        onChange={(e) => setWatermarkPosition(e.target.value as any)}
                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    >
                                        <option value="bottom-right">Bottom Right</option>
                                        <option value="bottom-left">Bottom Left</option>
                                        <option value="top-right">Top Right</option>
                                        <option value="top-left">Top Left</option>
                                    </select>
                                    <div>
                                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                                            Opacity: {Math.round(watermarkOpacity * 100)}%
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={watermarkOpacity}
                                            onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Thumbnail */}
                            <div>
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Thumbnail</h4>
                                <button
                                    onClick={handleGenerateThumbnail}
                                    className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium"
                                >
                                    Generate Thumbnail
                                </button>
                            </div>

                            {/* Reset */}
                            <div>
                                <button
                                    onClick={() => {
                                        setBrightness(0);
                                        setContrast(0);
                                        setSaturate(0);
                                        setBlur(0);
                                        setWatermarkText('');
                                        setIsCropping(false);
                                    }}
                                    className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium"
                                >
                                    Reset All
                                </button>
                            </div>

                            {/* Save Button */}
                            <button
                                onClick={handleSave}
                                disabled={isProcessing}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 font-medium"
                            >
                                {isProcessing ? 'Saving...' : 'Save Edited Image'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Create Folder Modal Component
const CreateFolderModal: React.FC<{
    onClose: () => void;
    onCreate: (name: string) => Promise<void>;
}> = ({ onClose, onCreate }) => {
    const [folderName, setFolderName] = useState('');

    const handleCreate = async () => {
        if (!folderName.trim()) return;
        await onCreate(folderName.trim());
        setFolderName('');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create Folder</h3>
                <input
                    type="text"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    placeholder="Folder name"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-4"
                    onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
                />
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700"
                    >
                        Create
                    </button>
                </div>
            </div>
        </div>
    );
};
