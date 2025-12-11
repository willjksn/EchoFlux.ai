import React, { useState, useEffect } from 'react';
import { XMarkIcon } from './icons/UIIcons';
import { PinterestIcon } from './icons/PlatformIcons';
import { fetchPinterestBoards, PinterestBoard } from '../src/services/socialMediaService';

interface PinterestBoardSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (boardId: string, boardName: string) => void;
  currentBoardId?: string;
}

export const PinterestBoardSelectionModal: React.FC<PinterestBoardSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentBoardId,
}) => {
  const [boards, setBoards] = useState<PinterestBoard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string>(currentBoardId || '');

  useEffect(() => {
    if (isOpen && boards.length === 0) {
      fetchBoards();
    }
  }, [isOpen]);

  useEffect(() => {
    if (currentBoardId) {
      setSelectedBoardId(currentBoardId);
    }
  }, [currentBoardId]);

  const fetchBoards = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedBoards = await fetchPinterestBoards();
      setBoards(fetchedBoards);
      // Auto-select first board if none selected and boards available
      if (!selectedBoardId && fetchedBoards.length > 0) {
        setSelectedBoardId(fetchedBoards[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch Pinterest boards');
      console.error('Failed to fetch Pinterest boards:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = () => {
    const selectedBoard = boards.find(b => b.id === selectedBoardId);
    if (selectedBoard) {
      onSelect(selectedBoard.id, selectedBoard.name);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <PinterestIcon className="w-6 h-6 text-red-600" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Select Pinterest Board
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading boards...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              <button
                onClick={fetchBoards}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : boards.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600 dark:text-gray-400 mb-4">No boards found</p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                Create a board on Pinterest to start pinning
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {boards.map((board) => (
                <button
                  key={board.id}
                  onClick={() => setSelectedBoardId(board.id)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                    selectedBoardId === board.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {board.name}
                        </h3>
                        {board.privacy === 'SECRET' && (
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                            Secret
                          </span>
                        )}
                      </div>
                      {board.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                          {board.description}
                        </p>
                      )}
                    </div>
                    {selectedBoardId === board.id && (
                      <div className="ml-4 w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && !error && boards.length > 0 && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSelect}
              disabled={!selectedBoardId}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Select Board
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
