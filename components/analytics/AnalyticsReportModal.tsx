
import React from 'react';
import { XMarkIcon } from '../icons/UIIcons';

interface AnalyticsReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: string;
    isLoading: boolean;
}

export const AnalyticsReportModal: React.FC<AnalyticsReportModalProps> = ({ isOpen, onClose, report, isLoading }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">AI Generated Report</h3>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                        <XMarkIcon />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto text-gray-800 dark:text-gray-200">
                    {isLoading ? (
                        <div className="text-center">
                            <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <p className="mt-4 font-semibold text-gray-700 dark:text-gray-300">Analyzing data...</p>
                        </div>
                    ) : (
                        <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap">
                            {report}
                        </div>
                    )}
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
