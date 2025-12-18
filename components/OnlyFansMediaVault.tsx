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
                deleteDoc(doc(db, 'users', user.id, 'onlyfans_media_library', id))
            );
            
            await Promise.all(deletePromises);
            setMediaItems(prev => prev.filter(m => !selectedItems.has(m.id)));
            const count = selectedItems.size;
            setSelectedItems(new Set());
            showToast(`Deleted ${count} item(s)`, 'success');
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
            await updateDoc(doc(db, 'users', user.id, 'onlyfans_media_library', itemId), {
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
                    onEdit={() => {
                        setEditorItem(viewingItem);
                        setShowEditor(true);
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
                    className="p-2 bg-white dark:bg-gray-800 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 shadow-md"
                    title="Generate AI Tags"
                    disabled={isGeneratingTags}
                >
                    <SparklesIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                    }}
                    className="p-2 bg-white dark:bg-gray-800 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 shadow-md"
                    title="Edit"
                >
                    <EditIcon className="w-4 h-4 text-gray-900 dark:text-gray-100" />
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
                    checked={isSelected}
                    onChange={(e) => {
                        e.stopPropagation();
                        onSelect();
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                    className="w-4 h-4 text-primary-600 rounded cursor-pointer"
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
    onEdit: () => void;
    folders: MediaFolder[];
    isGeneratingTags: boolean;
}> = ({ item, onClose, onDelete, onGenerateTags, onMoveToFolder, onEdit, folders, isGeneratingTags }) => {
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
                        {item.type === 'image' && (
                            <button
                                onClick={() => {
                                    onEdit();
                                    onClose();
                                }}
                                className="px-4 py-2 text-sm border border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-400 rounded-md hover:bg-primary-50 dark:hover:bg-primary-900/30 flex items-center gap-2"
                            >
                                <EditIcon className="w-4 h-4" />
                                Edit Image
                            </button>
                        )}
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
    const { showToast } = useAppContext();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [brightness, setBrightness] = useState(0);
    const [contrast, setContrast] = useState(0);
    const [saturate, setSaturate] = useState(0);
    const [blur, setBlur] = useState(0);
    const [watermarkText, setWatermarkText] = useState('');
    const [watermarkPosition, setWatermarkPosition] = useState<'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'>('bottom-right');
    const [watermarkOpacity, setWatermarkOpacity] = useState(0.7);
    const [watermarkSize, setWatermarkSize] = useState(100);
    const [watermarkTextColor, setWatermarkTextColor] = useState('#ffffff');
    const [watermarkImage, setWatermarkImage] = useState<string | null>(null);
    const watermarkImageInputRef = useRef<HTMLInputElement>(null);
    const watermarkImageRef = useRef<HTMLImageElement | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isBlurSelecting, setIsBlurSelecting] = useState(false);
    const [blurSelection, setBlurSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [blurSelectionStart, setBlurSelectionStart] = useState<{ x: number; y: number } | null>(null);
    const [blurSelectionEnd, setBlurSelectionEnd] = useState<{ x: number; y: number } | null>(null);
    const [blurSelections, setBlurSelections] = useState<{ x: number; y: number; width: number; height: number }[]>([]);
    const [isEraseSelecting, setIsEraseSelecting] = useState(false);
    const [eraseSelectionStart, setEraseSelectionStart] = useState<{ x: number; y: number } | null>(null);
    const [eraseSelectionEnd, setEraseSelectionEnd] = useState<{ x: number; y: number } | null>(null);
    const [eraseSelections, setEraseSelections] = useState<{ x: number; y: number; width: number; height: number }[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const originalImageRef = useRef<HTMLImageElement | null>(null);
    const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isLoadingImageRef = useRef<boolean>(false);
    const [showFilters, setShowFilters] = useState(false);
    const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
    const [hue, setHue] = useState(0);
    const [sepia, setSepia] = useState(0);
    const [grayscale, setGrayscale] = useState(0);
    const [invert, setInvert] = useState(0);

    const getScaledCoordinates = (displayX: number, displayY: number) => {
        if (!canvasRef.current) return { x: 0, y: 0 };
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: displayX * scaleX,
            y: displayY * scaleY
        };
    };

    const applyFilters = useCallback((skipSelectionRendering = false) => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        
        // Use originalImageRef if available, otherwise use imageRef
        const img = originalImageRef.current || imageRef.current;
        if (!img || !img.complete) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw base image with lighting filters (no blur yet)
        ctx.filter = `brightness(${100 + brightness}%) contrast(${100 + contrast}%) saturate(${100 + saturate}%) hue-rotate(${hue}deg) sepia(${sepia}%) grayscale(${grayscale}%) invert(${invert}%)`;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';
        
        // Apply selective blur:
        // - Always apply committed blur selections
        // - Apply active drag preview only when not skipping selection rendering
        const committedBlurs = blurSelections;
        const activeBlur = !skipSelectionRendering && blurSelection ? [blurSelection] : [];
        const allBlurSelections = [...committedBlurs, ...activeBlur];
        if (allBlurSelections.length && blur > 0) {
            for (const sel of allBlurSelections) {
                const { x, y, width, height } = sel;
                const safeX = Math.max(0, Math.min(x, canvas.width));
                const safeY = Math.max(0, Math.min(y, canvas.height));
                const safeWidth = Math.max(0, Math.min(width, canvas.width - safeX));
                const safeHeight = Math.max(0, Math.min(height, canvas.height - safeY));
                
                if (safeWidth > 0 && safeHeight > 0) {
                    try {
                        const imageData = ctx.getImageData(safeX, safeY, safeWidth, safeHeight);
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = safeWidth;
                        tempCanvas.height = safeHeight;
                        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                        if (tempCtx) {
                            tempCtx.putImageData(imageData, 0, 0);
                            const blurIntensity = blur * 2.5; // heavier blur
                            tempCtx.filter = `blur(${blurIntensity}px)`;
                            tempCtx.drawImage(tempCanvas, 0, 0);
                            tempCtx.filter = 'none';
                            ctx.drawImage(tempCanvas, safeX, safeY);
                        }
                    } catch (error) {
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = safeWidth;
                        tempCanvas.height = safeHeight;
                        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                        if (tempCtx && originalImageRef.current) {
                            const blurIntensity = blur * 2.5;
                            tempCtx.filter = `brightness(${100 + brightness}%) contrast(${100 + contrast}%) saturate(${100 + saturate}%) hue-rotate(${hue}deg) sepia(${sepia}%) grayscale(${grayscale}%) invert(${invert}%) blur(${blurIntensity}px)`;
                            tempCtx.drawImage(
                                originalImageRef.current,
                                safeX, safeY, safeWidth, safeHeight,
                                0, 0, safeWidth, safeHeight
                            );
                            tempCtx.filter = 'none';
                            ctx.drawImage(tempCanvas, safeX, safeY);
                        }
                    }
                }
            }
        }
        
        // Draw blur selection rectangle and preview blur if selecting (always show during drag for visual feedback)
        if (isBlurSelecting && blurSelectionStart && blurSelectionEnd) {
            // Convert display coordinates to actual canvas coordinates
            const start = getScaledCoordinates(blurSelectionStart.x, blurSelectionStart.y);
            const end = getScaledCoordinates(blurSelectionEnd.x, blurSelectionEnd.y);
            
            const x = Math.min(start.x, end.x);
            const y = Math.min(start.y, end.y);
            const width = Math.abs(end.x - start.x);
            const height = Math.abs(end.y - start.y);

            // Safeguard coordinates within canvas bounds for preview + overlay drawing
            const safeX = Math.max(0, Math.min(x, canvas.width));
            const safeY = Math.max(0, Math.min(y, canvas.height));
            const safeWidth = Math.max(0, Math.min(width, canvas.width - safeX));
            const safeHeight = Math.max(0, Math.min(height, canvas.height - safeY));

            // Only show preview if selection is large enough
            if (width > 10 && height > 10 && blur > 0) {
                if (safeWidth > 0 && safeHeight > 0) {
                    try {
                        // Get the selected area from the current canvas (using actual canvas coordinates)
                        const imageData = ctx.getImageData(safeX, safeY, safeWidth, safeHeight);
                        
                        // Create a temporary canvas for the blurred preview
                        const previewCanvas = document.createElement('canvas');
                        previewCanvas.width = safeWidth;
                        previewCanvas.height = safeHeight;
                        const previewCtx = previewCanvas.getContext('2d', { willReadFrequently: true });
                        if (previewCtx) {
                            previewCtx.putImageData(imageData, 0, 0);
                            // Apply blur preview - multiply blur intensity for heavier effect
                            const blurIntensity = blur * 2.5;
                            previewCtx.filter = `blur(${blurIntensity}px)`;
                            previewCtx.drawImage(previewCanvas, 0, 0);
                            previewCtx.filter = 'none';
                            
                            // Draw the blurred preview back onto the main canvas (using actual canvas coordinates)
                            ctx.drawImage(previewCanvas, safeX, safeY);
                        }
                    } catch (error) {
                        // If getImageData fails, skip preview blur
                        console.warn('Could not create blur preview:', error);
                    }
                }
            }

            // Draw semi-transparent red fill overlay using canvas coordinates
            ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
            ctx.fillRect(safeX, safeY, safeWidth, safeHeight);
            
            // Draw red border (using canvas coordinates so overlay matches blur area)
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 4]);
            ctx.strokeRect(safeX, safeY, safeWidth, safeHeight);
            
            // Draw inner border for better definition
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.strokeRect(safeX + 1, safeY + 1, Math.max(0, safeWidth - 2), Math.max(0, safeHeight - 2));
        }
        
        // Draw magic eraser selection overlay while dragging
        if (isEraseSelecting && eraseSelectionStart && eraseSelectionEnd) {
            const start = getScaledCoordinates(eraseSelectionStart.x, eraseSelectionStart.y);
            const end = getScaledCoordinates(eraseSelectionEnd.x, eraseSelectionEnd.y);

            const x = Math.min(start.x, end.x);
            const y = Math.min(start.y, end.y);
            const width = Math.abs(end.x - start.x);
            const height = Math.abs(end.y - start.y);

            const safeX = Math.max(0, Math.min(x, canvas.width));
            const safeY = Math.max(0, Math.min(y, canvas.height));
            const safeWidth = Math.max(0, Math.min(width, canvas.width - safeX));
            const safeHeight = Math.max(0, Math.min(height, canvas.height - safeY));

            if (safeWidth > 0 && safeHeight > 0) {
                ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
                ctx.fillRect(safeX, safeY, safeWidth, safeHeight);

                ctx.strokeStyle = '#2563eb';
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 4]);
                ctx.strokeRect(safeX, safeY, safeWidth, safeHeight);

                ctx.strokeStyle = '#e0f2fe';
                ctx.lineWidth = 1;
                ctx.setLineDash([]);
                ctx.strokeRect(safeX + 1, safeY + 1, Math.max(0, safeWidth - 2), Math.max(0, safeHeight - 2));
            }
        }

        // Existing blur selections overlay (so users see queued areas)
        if (blurSelections.length && blur > 0) {
            ctx.save();
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.fillStyle = 'rgba(249, 115, 22, 0.08)';
            for (const sel of blurSelections) {
                const safeX = Math.max(0, Math.min(sel.x, canvas.width));
                const safeY = Math.max(0, Math.min(sel.y, canvas.height));
                const safeWidth = Math.max(0, Math.min(sel.width, canvas.width - safeX));
                const safeHeight = Math.max(0, Math.min(sel.height, canvas.height - safeY));
                if (safeWidth > 0 && safeHeight > 0) {
                    ctx.fillRect(safeX, safeY, safeWidth, safeHeight);
                    ctx.strokeRect(safeX, safeY, safeWidth, safeHeight);
                }
            }
            ctx.restore();
        }
        
        // Apply watermark (text or image)
        if (watermarkText || watermarkImage) {
            ctx.save();
            ctx.globalAlpha = watermarkOpacity;
            
            if (watermarkImage && watermarkImageRef.current && watermarkImageRef.current.complete) {
                // Draw image watermark (only if already loaded)
                const img = watermarkImageRef.current;
                const imgSize = watermarkSize; // Use size slider for image scale
                const aspectRatio = img.width / img.height;
                const displayWidth = imgSize;
                const displayHeight = imgSize / aspectRatio;
                
                let x = 0;
                let y = 0;
                
                switch (watermarkPosition) {
                    case 'bottom-right':
                        x = canvas.width - displayWidth - 20;
                        y = canvas.height - displayHeight - 20;
                        break;
                    case 'bottom-left':
                        x = 20;
                        y = canvas.height - displayHeight - 20;
                        break;
                    case 'top-right':
                        x = canvas.width - displayWidth - 20;
                        y = 20;
                        break;
                    case 'top-left':
                        x = 20;
                        y = 20;
                        break;
                }
                
                ctx.drawImage(img, x, y, displayWidth, displayHeight);
            } else if (watermarkText) {
                // Draw text watermark
                ctx.font = `bold ${watermarkSize}px Arial`;
                ctx.fillStyle = watermarkTextColor;
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2;
                const metrics = ctx.measureText(watermarkText);
                const textWidth = metrics.width;
                const textHeight = watermarkSize + 6;
                
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
            }
            
            ctx.restore();
        }
    }, [brightness, contrast, saturate, blur, watermarkText, watermarkPosition, watermarkOpacity, watermarkSize, watermarkTextColor, watermarkImage, isBlurSelecting, blurSelectionStart, blurSelectionEnd, blurSelection, blurSelections, hue, sepia, grayscale, invert, isEraseSelecting, eraseSelectionStart, eraseSelectionEnd]);

    const applyMagicErase = useCallback(
        async (selections: { x: number; y: number; width: number; height: number }[]) => {
            if (!canvasRef.current || !originalImageRef.current || !selections.length) return;
            setIsProcessing(true);

            try {
                const workCanvas = document.createElement('canvas');
                workCanvas.width = canvasRef.current.width;
                workCanvas.height = canvasRef.current.height;
                const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
                if (!workCtx) throw new Error('Canvas not available for eraser');

                workCtx.drawImage(originalImageRef.current, 0, 0, workCanvas.width, workCanvas.height);

                for (const selection of selections) {
                    const { x, y, width, height } = selection;
                    const margin = Math.max(10, Math.min(40, Math.round(Math.min(width, height) / 1.5)));
                    const sampleX = Math.max(0, x - margin);
                    const sampleY = Math.max(0, y - margin);
                    const sampleWidth = Math.min(width + margin * 2, workCanvas.width - sampleX);
                    const sampleHeight = Math.min(height + margin * 2, workCanvas.height - sampleY);

                    const sampleCanvas = document.createElement('canvas');
                    sampleCanvas.width = sampleWidth;
                    sampleCanvas.height = sampleHeight;
                    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

                    if (!sampleCtx) continue;

                    sampleCtx.filter = 'blur(25px)';
                    sampleCtx.drawImage(
                        originalImageRef.current,
                        sampleX,
                        sampleY,
                        sampleWidth,
                        sampleHeight,
                        0,
                        0,
                        sampleWidth,
                        sampleHeight
                    );
                    sampleCtx.filter = 'none';

                    const offsetX = Math.max(0, Math.min(margin, sampleWidth - width));
                    const offsetY = Math.max(0, Math.min(margin, sampleHeight - height));

                    workCtx.drawImage(
                        sampleCanvas,
                        offsetX,
                        offsetY,
                        Math.max(1, width),
                        Math.max(1, height),
                        x,
                        y,
                        Math.max(1, width),
                        Math.max(1, height)
                    );
                }

                const dataUrl = workCanvas.toDataURL('image/png');
                // Update visible canvas immediately to avoid flicker/revert perception
                const mainCtx = canvasRef.current.getContext('2d');
                if (mainCtx) {
                    mainCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    mainCtx.drawImage(workCanvas, 0, 0);
                }

                const newImg = new Image();
                newImg.crossOrigin = 'anonymous';
                newImg.onload = () => {
                    originalImageRef.current = newImg;
                    if (imageRef.current) {
                        imageRef.current.src = dataUrl;
                    }
                    setEraseSelections([]);
                    applyFilters();
                    showToast('Magic eraser applied', 'success');
                };
                newImg.onerror = () => {
                    showToast('Magic eraser failed to update image', 'error');
                };
                newImg.src = dataUrl;
            } catch (error) {
                console.error('Magic eraser failed', error);
                showToast('Magic eraser failed. Try a smaller area.', 'error');
            } finally {
                setIsProcessing(false);
            }
        },
        [applyFilters, showToast]
    );

    const applyBlurToImage = useCallback(
        async (selections: { x: number; y: number; width: number; height: number }[]) => {
            if (!canvasRef.current || !originalImageRef.current || !selections.length || blur <= 0) return;
            setIsProcessing(true);

            try {
                const workCanvas = document.createElement('canvas');
                workCanvas.width = canvasRef.current.width;
                workCanvas.height = canvasRef.current.height;
                const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
                if (!workCtx) throw new Error('Canvas not available for blur apply');

                workCtx.drawImage(originalImageRef.current, 0, 0, workCanvas.width, workCanvas.height);

                for (const sel of selections) {
                    const { x, y, width, height } = sel;
                    const safeX = Math.max(0, Math.min(x, workCanvas.width));
                    const safeY = Math.max(0, Math.min(y, workCanvas.height));
                    const safeWidth = Math.max(0, Math.min(width, workCanvas.width - safeX));
                    const safeHeight = Math.max(0, Math.min(height, workCanvas.height - safeY));
                    if (safeWidth <= 0 || safeHeight <= 0) continue;

                    const imageData = workCtx.getImageData(safeX, safeY, safeWidth, safeHeight);
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = safeWidth;
                    tempCanvas.height = safeHeight;
                    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                    if (!tempCtx) continue;
                    tempCtx.putImageData(imageData, 0, 0);
                    const blurIntensity = Math.max(1, blur) * 2.5;
                    tempCtx.filter = `blur(${blurIntensity}px)`;
                    tempCtx.drawImage(tempCanvas, 0, 0);
                    tempCtx.filter = 'none';
                    workCtx.drawImage(tempCanvas, safeX, safeY);
                }

                const dataUrl = workCanvas.toDataURL('image/png');
                // Update visible canvas immediately so it doesn't appear to revert
                const mainCtx = canvasRef.current.getContext('2d');
                if (mainCtx) {
                    mainCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    mainCtx.drawImage(workCanvas, 0, 0);
                }

                const newImg = new Image();
                newImg.crossOrigin = 'anonymous';
                newImg.onload = () => {
                    originalImageRef.current = newImg;
                    if (imageRef.current) {
                        imageRef.current.src = dataUrl;
                    }
                    setBlurSelections([]);
                    setBlurSelection(null);
                    applyFilters();
                    showToast('Blur applied to image', 'success');
                };
                newImg.onerror = () => {
                    showToast('Failed to update image with blur', 'error');
                };
                newImg.src = dataUrl;
            } catch (error) {
                console.error('Blur apply failed', error);
                showToast('Blur apply failed. Try again.', 'error');
            } finally {
                setIsProcessing(false);
            }
        },
        [applyFilters, showToast, blur]
    );

    useEffect(() => {
        // Prevent multiple simultaneous image loads
        if (isLoadingImageRef.current) return;
        
        // Load image with CORS handling - use proxy for Firebase Storage images
        const loadImage = async () => {
            isLoadingImageRef.current = true;
            
            // Use proxy API for Firebase Storage images to bypass CORS
            const isFirebaseStorage = item.url.includes('firebasestorage.googleapis.com');
            
            // For Firebase Storage, use proxy; otherwise use direct URL
            let imageUrl = item.url;
            let needsAuth = false;
            
            if (isFirebaseStorage) {
                // Get auth token for proxy request
                try {
                    const { auth } = await import('../firebaseConfig');
                    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
                    if (token) {
                        // Firebase Storage URLs may already be encoded, so we need to decode first
                        // then encode properly for the query parameter to avoid double encoding
                        let urlToEncode = item.url;
                        try {
                            // Try to decode multiple times if it's already encoded (contains %)
                            // This handles cases where the URL is already encoded
                            let previousUrl = urlToEncode;
                            for (let i = 0; i < 3; i++) {
                                if (urlToEncode.includes('%')) {
                                    const decoded = decodeURIComponent(urlToEncode);
                                    if (decoded === previousUrl) break; // No more decoding possible
                                    urlToEncode = decoded;
                                    previousUrl = decoded;
                                } else {
                                    break; // Not encoded, no need to decode
                                }
                            }
                        } catch (e) {
                            // If decode fails, use original URL
                            console.warn('Could not decode URL, using as-is:', item.url);
                            urlToEncode = item.url;
                        }
                        // Now encode it properly for the query parameter
                        imageUrl = `/api/proxyImage?url=${encodeURIComponent(urlToEncode)}`;
                        needsAuth = true;
                    }
                } catch (err) {
                    // If we can't get token, fall back to direct URL (may have CORS issues)
                    console.warn('Could not get auth token for image proxy, using direct URL');
                }
            }
            
            // Try fetching as blob first (best for canvas operations)
            try {
                const headers: HeadersInit = {};
                if (needsAuth) {
                    const { auth } = await import('../firebaseConfig');
                    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
                    if (token) {
                        headers['Authorization'] = `Bearer ${token}`;
                    }
                }
                
                console.log('Fetching image from proxy:', imageUrl.substring(0, 200));
                const response = await fetch(imageUrl, { 
                    credentials: 'include',
                    headers
                });
                
                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Unknown error');
                    console.error('Proxy returned error:', response.status, errorText);
                    throw new Error(`Proxy failed: ${response.status} - ${errorText.substring(0, 100)}`);
                }
                
                // Check if response is actually an image
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.startsWith('image/')) {
                    console.error('Proxy returned non-image content:', contentType);
                    throw new Error('Proxy returned non-image content');
                }
                
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                
                const img = new Image();
                img.crossOrigin = 'anonymous'; // Helps with canvas operations
                img.onload = () => {
                    if (canvasRef.current && imageRef.current) {
                        const canvas = canvasRef.current;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) {
                            isLoadingImageRef.current = false;
                            URL.revokeObjectURL(objectUrl);
                            showToast('Failed to initialize canvas', 'error');
                            return;
                        }
                        
                        canvas.width = img.width;
                        canvas.height = img.height;
                        originalImageRef.current = img;
                        imageRef.current.src = objectUrl;
                        imageRef.current.crossOrigin = 'anonymous';
                        imageRef.current.onload = () => {
                            // Initialize base canvas
                            if (!baseCanvasRef.current) {
                                baseCanvasRef.current = document.createElement('canvas');
                            }
                            baseCanvasRef.current.width = img.width;
                            baseCanvasRef.current.height = img.height;
                            isLoadingImageRef.current = false;
                            applyFilters(true);
                        };
                        imageRef.current.onerror = () => {
                            URL.revokeObjectURL(objectUrl);
                            isLoadingImageRef.current = false;
                            showToast('Failed to load image for editing', 'error');
                        };
                    } else {
                        isLoadingImageRef.current = false;
                        URL.revokeObjectURL(objectUrl);
                    }
                };
                img.onerror = () => {
                    URL.revokeObjectURL(objectUrl);
                    console.error('Image load error after blob fetch');
                    isLoadingImageRef.current = false;
                    showToast('Failed to load image. Please try again.', 'error');
                };
                img.src = objectUrl;
            } catch (error: any) {
                console.error('Error fetching image from proxy:', error);
                isLoadingImageRef.current = false;
                // Show error to user instead of silently failing
                showToast(`Failed to load image: ${error?.message || 'Unknown error'}. Please try again.`, 'error');
            }
        };

        // Note: Removed loadDirect fallback since it won't work with CORS
        // If proxy fails, we show an error message instead
        
        loadImage();
        
        // Cleanup function
        return () => {
            isLoadingImageRef.current = false;
        };
    }, [item.url, applyFilters]);

    useEffect(() => {
        // Debounce filter application to prevent excessive redraws during drag
        if (imageRef.current?.complete && canvasRef.current) {
            if (renderTimeoutRef.current) {
                clearTimeout(renderTimeoutRef.current);
            }
            // During blur selection, render with selection rectangles visible (skipSelectionRendering = false)
            // Otherwise, skip selection rendering for performance
            const skipSelection = !isBlurSelecting;
            renderTimeoutRef.current = setTimeout(() => {
                requestAnimationFrame(() => {
                    applyFilters(skipSelection);
                });
            }, 50); // slightly slower to reduce flashing during drags
            return () => {
                if (renderTimeoutRef.current) {
                    clearTimeout(renderTimeoutRef.current);
                }
            };
        }
    }, [brightness, contrast, saturate, blur, watermarkText, watermarkPosition, watermarkOpacity, watermarkSize, watermarkTextColor, watermarkImage, blurSelection, blurSelections, hue, sepia, grayscale, invert, blurSelectionStart, blurSelectionEnd, isBlurSelecting, applyFilters]);

    // Preload watermark image when it changes
    useEffect(() => {
        if (watermarkImage) {
            const img = new Image();
            img.onload = () => {
                watermarkImageRef.current = img;
                applyFilters();
            };
            img.onerror = () => {
                console.error('Failed to load watermark image');
                watermarkImageRef.current = null;
            };
            img.src = watermarkImage;
        } else {
            watermarkImageRef.current = null;
        }
    }, [watermarkImage, applyFilters]);

    // Global mouse event listeners for drag operations (blur + magic eraser)
    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (isBlurSelecting && blurSelectionStart) {
                const coords = getCanvasCoordinates(e.clientX, e.clientY);
                if (!coords) return;
                
                setBlurSelectionEnd(coords);
            }
            if (isEraseSelecting && eraseSelectionStart) {
                const coords = getCanvasCoordinates(e.clientX, e.clientY);
                if (!coords) return;
                setEraseSelectionEnd(coords);
            }
        };

        const handleGlobalMouseUp = (e: MouseEvent) => {
            if (isBlurSelecting && blurSelectionStart && blurSelectionEnd) {
                const start = getScaledCoordinates(blurSelectionStart.x, blurSelectionStart.y);
                const end = getScaledCoordinates(blurSelectionEnd.x, blurSelectionEnd.y);
                
                const x = Math.min(start.x, end.x);
                const y = Math.min(start.y, end.y);
                const width = Math.abs(end.x - start.x);
                const height = Math.abs(end.y - start.y);
                
                if (width > 10 && height > 10) {
                    const selection = { x, y, width, height };
                    setBlurSelection(selection);
                    // Auto-apply blur so it persists when switching tools
                    applyBlurToImage([selection]);
                }
                
                setBlurSelectionStart(null);
                setBlurSelectionEnd(null);
                setIsBlurSelecting(false);
                setTimeout(() => applyFilters(), 0);
            }
            if (isEraseSelecting && eraseSelectionStart && eraseSelectionEnd) {
                const start = getScaledCoordinates(eraseSelectionStart.x, eraseSelectionStart.y);
                const end = getScaledCoordinates(eraseSelectionEnd.x, eraseSelectionEnd.y);

                const x = Math.min(start.x, end.x);
                const y = Math.min(start.y, end.y);
                const width = Math.abs(end.x - start.x);
                const height = Math.abs(end.y - start.y);

                if (width > 10 && height > 10) {
                    const selection = { x, y, width, height };
                    setEraseSelections([selection]);
                    // Auto-apply magic erase so the removal persists
                    applyMagicErase([selection]);
                }

                setEraseSelectionStart(null);
                setEraseSelectionEnd(null);
                setIsEraseSelecting(false);
            }
        };

        if (isBlurSelecting || isEraseSelecting) {
            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('mouseup', handleGlobalMouseUp);
            
            return () => {
                window.removeEventListener('mousemove', handleGlobalMouseMove);
                window.removeEventListener('mouseup', handleGlobalMouseUp);
            };
        }
    }, [isBlurSelecting, blurSelectionStart, blurSelectionEnd, isEraseSelecting, eraseSelectionStart, eraseSelectionEnd, applyFilters, applyMagicErase, applyBlurToImage]);


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

    const getCanvasCoordinates = (clientX: number, clientY: number) => {
        if (!canvasRef.current) return null;
        const rect = canvasRef.current.getBoundingClientRect();
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const coords = getCanvasCoordinates(e.clientX, e.clientY);
        if (!coords) return;
        
        if (isBlurSelecting) {
            setBlurSelectionStart(coords);
            setBlurSelectionEnd(coords);
        } else if (isEraseSelecting) {
            setEraseSelectionStart(coords);
            setEraseSelectionEnd(coords);
        }
    };

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const coords = getCanvasCoordinates(e.clientX, e.clientY);
        if (!coords) return;
        
        if (isBlurSelecting && blurSelectionStart) {
            setBlurSelectionEnd(coords);
        } else if (isEraseSelecting && eraseSelectionStart) {
            setEraseSelectionEnd(coords);
        }
    };

    const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (isBlurSelecting && blurSelectionStart && blurSelectionEnd) {
            // Calculate blur selection area (scaled to actual canvas size)
            const start = getScaledCoordinates(blurSelectionStart.x, blurSelectionStart.y);
            const end = getScaledCoordinates(blurSelectionEnd.x, blurSelectionEnd.y);
            
            const x = Math.min(start.x, end.x);
            const y = Math.min(start.y, end.y);
            const width = Math.abs(end.x - start.x);
            const height = Math.abs(end.y - start.y);
            
            console.log('Blur selection:', { x, y, width, height });
            
            if (width > 10 && height > 10) {
                const selection = { x, y, width, height };
                setBlurSelection(selection);
                setBlurSelections([selection]);
                applyBlurToImage([selection]);
            }
            
            setBlurSelectionStart(null);
            setBlurSelectionEnd(null);
            setIsBlurSelecting(false);
            // Apply filters after selection is complete
            setTimeout(() => applyFilters(), 0);
        }
        if (isEraseSelecting && eraseSelectionStart && eraseSelectionEnd) {
            const start = getScaledCoordinates(eraseSelectionStart.x, eraseSelectionStart.y);
            const end = getScaledCoordinates(eraseSelectionEnd.x, eraseSelectionEnd.y);

            const x = Math.min(start.x, end.x);
            const y = Math.min(start.y, end.y);
            const width = Math.abs(end.x - start.x);
            const height = Math.abs(end.y - start.y);

            if (width > 10 && height > 10) {
                const selection = { x, y, width, height };
                setEraseSelections([selection]);
                applyMagicErase([selection]);
            }

            setEraseSelectionStart(null);
            setEraseSelectionEnd(null);
            setIsEraseSelecting(false);
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
                                    style={{ touchAction: 'none', userSelect: 'none' }}
                                    onMouseDown={handleCanvasMouseDown}
                                    onMouseMove={handleCanvasMouseMove}
                                    onMouseUp={handleCanvasMouseUp}
                                    onMouseLeave={(e) => {
                                        // If dragging and mouse leaves canvas, still track it
                                        if (isBlurSelecting && blurSelectionStart) {
                                            // Let global handlers take over
                                        }
                                    }}
                                />
                                <img ref={imageRef} className="hidden" alt="Source" />
                            </div>
                        </div>

                        {/* Editing Controls */}
                        <div className="space-y-6">
                            {/* Filters Section - Large Scrollable */}
                            {showFilters && (
                                <div className="mb-6">
                                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Filters</h4>
                                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-[400px] overflow-y-auto">
                                        <div className="grid grid-cols-4 gap-3">
                                            {[
                                                { name: 'None', brightness: 0, contrast: 0, saturate: 0, hue: 0, sepia: 0, grayscale: 0, invert: 0 },
                                                { name: 'Vintage', brightness: 5, contrast: 10, saturate: -20, hue: 15, sepia: 30, grayscale: 0, invert: 0 },
                                                { name: 'B&W', brightness: 0, contrast: 15, saturate: -100, hue: 0, sepia: 0, grayscale: 100, invert: 0 },
                                                { name: 'Sepia', brightness: 5, contrast: 10, saturate: -50, hue: 0, sepia: 80, grayscale: 0, invert: 0 },
                                                { name: 'Cool', brightness: 5, contrast: 5, saturate: 20, hue: -15, sepia: 0, grayscale: 0, invert: 0 },
                                                { name: 'Warm', brightness: 10, contrast: 5, saturate: 30, hue: 25, sepia: 10, grayscale: 0, invert: 0 },
                                                { name: 'Dramatic', brightness: -10, contrast: 40, saturate: 30, hue: 0, sepia: 0, grayscale: 0, invert: 0 },
                                                { name: 'Vibrant', brightness: 10, contrast: 20, saturate: 50, hue: 0, sepia: 0, grayscale: 0, invert: 0 },
                                                { name: 'Soft', brightness: 15, contrast: -15, saturate: -10, hue: 0, sepia: 0, grayscale: 0, invert: 0 },
                                                { name: 'Sharp', brightness: 5, contrast: 50, saturate: 10, hue: 0, sepia: 0, grayscale: 0, invert: 0 },
                                            { name: 'Skin Smooth', brightness: 8, contrast: -12, saturate: 12, hue: 6, sepia: 6, grayscale: 0, invert: 0 },
                                            { name: 'Blemish Soft', brightness: 6, contrast: -8, saturate: -5, hue: 0, sepia: 8, grayscale: 0, invert: 0 },
                                            { name: 'Warm Glow (Makeup)', brightness: 10, contrast: 8, saturate: 22, hue: 8, sepia: 15, grayscale: 0, invert: 0 },
                                            { name: 'Rosy Lips', brightness: 5, contrast: 10, saturate: 35, hue: 12, sepia: 5, grayscale: 0, invert: 0 },
                                            { name: 'Eye Bright', brightness: 12, contrast: 18, saturate: -5, hue: -6, sepia: 0, grayscale: 0, invert: 0 },
                                            { name: 'Bronzed', brightness: 8, contrast: 14, saturate: 28, hue: 18, sepia: 18, grayscale: 0, invert: 0 },
                                                { name: 'Faded', brightness: 20, contrast: -30, saturate: -30, hue: 0, sepia: 0, grayscale: 0, invert: 0 },
                                                { name: 'Moody', brightness: -20, contrast: 30, saturate: -20, hue: 0, sepia: 20, grayscale: 20, invert: 0 },
                                                { name: 'Sunset', brightness: 15, contrast: 20, saturate: 40, hue: 30, sepia: 15, grayscale: 0, invert: 0 },
                                                { name: 'Cinema', brightness: -5, contrast: 35, saturate: 25, hue: -5, sepia: 10, grayscale: 0, invert: 0 },
                                                { name: 'Noir', brightness: -15, contrast: 50, saturate: -100, hue: 0, sepia: 0, grayscale: 100, invert: 0 },
                                                { name: 'Pop', brightness: 20, contrast: 25, saturate: 60, hue: 5, sepia: 0, grayscale: 0, invert: 0 },
                                                { name: 'Classic', brightness: 5, contrast: 15, saturate: -15, hue: 0, sepia: 50, grayscale: 0, invert: 0 },
                                                { name: 'Bleach', brightness: 30, contrast: 15, saturate: -40, hue: 0, sepia: 0, grayscale: 0, invert: 0 },
                                                { name: 'Invert', brightness: 0, contrast: 0, saturate: 0, hue: 0, sepia: 0, grayscale: 0, invert: 100 },
                                                { name: 'Cool Blue', brightness: 5, contrast: 10, saturate: 25, hue: -30, sepia: 0, grayscale: 0, invert: 0 },
                                                { name: 'Warm Gold', brightness: 15, contrast: 20, saturate: 40, hue: 40, sepia: 25, grayscale: 0, invert: 0 },
                                                { name: 'Pink Dream', brightness: 15, contrast: 10, saturate: 35, hue: 10, sepia: 5, grayscale: 0, invert: 0 },
                                                { name: 'Green Chill', brightness: 5, contrast: 15, saturate: 30, hue: -45, sepia: 0, grayscale: 0, invert: 0 },
                                                { name: 'Purple Haze', brightness: 10, contrast: 15, saturate: 35, hue: 60, sepia: 0, grayscale: 0, invert: 0 },
                                                { name: 'Orange Glow', brightness: 15, contrast: 25, saturate: 45, hue: 20, sepia: 15, grayscale: 0, invert: 0 },
                                            ].map((filter) => (
                                                <button
                                                    key={filter.name}
                                                    onClick={() => {
                                                        setBrightness(filter.brightness);
                                                        setContrast(filter.contrast);
                                                        setSaturate(filter.saturate);
                                                        setHue(filter.hue);
                                                        setSepia(filter.sepia);
                                                        setGrayscale(filter.grayscale);
                                                        setInvert(filter.invert);
                                                        setSelectedFilter(filter.name);
                                                    }}
                                                    className={`p-2 rounded-lg border-2 transition-all ${
                                                        selectedFilter === filter.name
                                                            ? 'border-purple-600 bg-purple-100 dark:bg-purple-900/30'
                                                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                                                    }`}
                                                >
                                                    <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 truncate">
                                                        {filter.name}
                                                    </div>
                                                    <div className="w-full h-16 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden relative">
                                                        {imageRef.current && imageRef.current.complete ? (
                                                            <img
                                                                src={imageRef.current.src}
                                                                alt={filter.name}
                                                                className="w-full h-full object-cover"
                                                                style={{
                                                                    filter: `brightness(${100 + filter.brightness}%) contrast(${100 + filter.contrast}%) saturate(${100 + filter.saturate}%) hue-rotate(${filter.hue}deg) sepia(${filter.sepia}%) grayscale(${filter.grayscale}%) invert(${filter.invert}%)`
                                                                }}
                                                            />
                                                        ) : (
                                                            <div 
                                                                className="w-full h-full"
                                                                style={{
                                                                    filter: `brightness(${100 + filter.brightness}%) contrast(${100 + filter.contrast}%) saturate(${100 + filter.saturate}%) hue-rotate(${filter.hue}deg) sepia(${filter.sepia}%) grayscale(${filter.grayscale}%) invert(${filter.invert}%)`,
                                                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
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

                            {/* Blur & Magic Eraser disabled */}
                            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Blur & Magic Eraser</h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    These tools are temporarily disabled. You can still adjust other filters and add watermarks.
                                </p>
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
                                    <div>
                                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                                            Size: {watermarkSize}px
                                        </label>
                                        <input
                                            type="range"
                                            min="50"
                                            max="300"
                                            step="5"
                                            value={watermarkSize}
                                            onChange={(e) => setWatermarkSize(Number(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                    {watermarkText && (
                                        <div>
                                            <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                                                Text Color
                                            </label>
                                            <input
                                                type="color"
                                                value={watermarkTextColor}
                                                onChange={(e) => setWatermarkTextColor(e.target.value)}
                                                className="w-full h-10 rounded cursor-pointer"
                                            />
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                                            Or Upload Image/Logo
                                        </label>
                                        <input
                                            ref={watermarkImageInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onload = (event) => {
                                                        const result = event.target?.result;
                                                        if (typeof result === 'string') {
                                                            setWatermarkImage(result);
                                                            setWatermarkText(''); // Clear text if image is set
                                                            // Preload the image
                                                            const img = new Image();
                                                            img.onload = () => {
                                                                watermarkImageRef.current = img;
                                                                applyFilters();
                                                            };
                                                            img.src = result;
                                                        }
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                                e.target.value = '';
                                            }}
                                            className="hidden"
                                        />
                                        <button
                                            onClick={() => watermarkImageInputRef.current?.click()}
                                            className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium"
                                        >
                                            {watermarkImage ? 'Change Image' : 'Upload Image'}
                                        </button>
                                        {watermarkImage && (
                                            <div className="mt-2 relative">
                                                <img src={watermarkImage} alt="Watermark" className="w-full h-20 object-contain bg-gray-100 dark:bg-gray-800 rounded" />
                                                <button
                                                    onClick={() => {
                                                        setWatermarkImage(null);
                                                        watermarkImageRef.current = null;
                                                        watermarkImageInputRef.current && (watermarkImageInputRef.current.value = '');
                                                        applyFilters();
                                                    }}
                                                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        )}
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

                            {/* Filters */}
                            <div>
                                <button
                                    onClick={() => setShowFilters(!showFilters)}
                                    className={`w-full px-4 py-2 rounded-md text-sm font-medium ${
                                        showFilters
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                                    }`}
                                >
                                    {showFilters ? 'Hide Filters' : 'Show Filters'}
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
                                        setWatermarkSize(100);
                                        setWatermarkTextColor('#ffffff');
                                        setWatermarkImage(null);
                                        if (watermarkImageInputRef.current) {
                                            watermarkImageInputRef.current.value = '';
                                        }
                                        setIsCropping(false);
                                        setHue(0);
                                        setSepia(0);
                                        setGrayscale(0);
                                        setInvert(0);
                                        setSelectedFilter(null);
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
