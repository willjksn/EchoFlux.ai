import React from 'react';
import { BriefcaseIcon } from './icons/UIIcons';

interface UpgradePromptProps {
    featureName: string;
    onUpgradeClick: () => void;
    secondaryActionText?: string;
    onSecondaryActionClick?: () => void;
    userType?: 'Creator' | 'Business';
}

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({ featureName, onUpgradeClick, secondaryActionText, onSecondaryActionClick, userType }) => {
    // Determine the appropriate message based on user type and feature
  const getUpgradeMessage = () => {
    // Business/Agency temporarily hidden; focus on Creator plans
    return 'This premium feature is available on our Pro and Elite plans.';
  };

    return (
        <div className="max-w-4xl mx-auto text-center bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400">
                <BriefcaseIcon />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Upgrade to Unlock {featureName}</h2>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
                {getUpgradeMessage()}
            </p>
            <div className="mt-6 flex flex-col sm:flex-row justify-center items-center gap-4">
                <button 
                    onClick={onUpgradeClick}
                    className="px-6 py-2 bg-primary-600 text-white font-semibold rounded-md hover:bg-primary-700 transition-colors"
                >
                    View Plans
                </button>
                {secondaryActionText && onSecondaryActionClick && (
                     <button 
                        onClick={onSecondaryActionClick}
                        className="px-6 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors"
                    >
                        {secondaryActionText}
                    </button>
                )}
            </div>
        </div>
    );
};