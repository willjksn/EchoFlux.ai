import React from 'react';
import { MediaFolder } from '../types';
import { FolderIcon } from './icons/UIIcons';

interface MediaFolderSidebarProps {
  folders: MediaFolder[];
  selectedFolderId: string;
  onSelectFolder: (folderId: string) => void;
  onCreateFolder: () => void;
}

export const MediaFolderSidebar: React.FC<MediaFolderSidebarProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
}) => {
  return (
    <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Folders</h2>
        <button
          onClick={onCreateFolder}
          className="w-full px-3 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-medium flex items-center justify-center gap-2"
        >
          <span className="text-lg">+</span>
          Create Folder
        </button>
      </div>

      {/* Folder List */}
      <div className="flex-1 overflow-y-auto p-2">
        {folders.map((folder) => {
          const isSelected = folder.id === selectedFolderId;
          return (
            <button
              key={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              className={`w-full px-3 py-2 rounded-md text-left flex items-center justify-between group transition-colors ${
                isSelected
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FolderIcon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium truncate">{folder.name}</span>
              </div>
              {folder.itemCount !== undefined && (
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                  isSelected
                    ? 'bg-primary-200 dark:bg-primary-800 text-primary-800 dark:text-primary-200'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {folder.itemCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};






