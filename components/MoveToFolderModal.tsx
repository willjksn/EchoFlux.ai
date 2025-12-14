import React, { useState } from 'react';
import { MediaFolder } from '../types';
import { FolderIcon, XMarkIcon } from './icons/UIIcons';

interface MoveToFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: MediaFolder[];
  currentFolderId: string;
  onMove: (folderId: string) => Promise<void>;
  itemCount: number;
}

export const MoveToFolderModal: React.FC<MoveToFolderModalProps> = ({
  isOpen,
  onClose,
  folders,
  currentFolderId,
  onMove,
  itemCount,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [isMoving, setIsMoving] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedFolderId('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const availableFolders = folders.filter(f => f.id !== currentFolderId);

  const handleMove = async () => {
    if (!selectedFolderId) return;

    setIsMoving(true);
    try {
      await onMove(selectedFolderId);
      onClose();
    } catch (error) {
      console.error('Failed to move items:', error);
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Move {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Select a folder to move {itemCount === 1 ? 'this item' : 'these items'} to:
          </p>

          {availableFolders.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">
                No other folders available. Create a folder first.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {availableFolders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`w-full px-4 py-3 rounded-lg text-left flex items-center justify-between transition-colors ${
                    selectedFolderId === folder.id
                      ? 'bg-primary-50 dark:bg-primary-900/20 border-2 border-primary-500'
                      : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <FolderIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-white">{folder.name}</span>
                  </div>
                  {folder.itemCount !== undefined && (
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400">
                      {folder.itemCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={handleMove}
              disabled={!selectedFolderId || isMoving || availableFolders.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isMoving ? 'Moving...' : 'Move'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};





