// components/AdGenerator.tsx
// AI-powered ad generation for text and video ads

import React from 'react';
import { SparklesIcon } from './icons/UIIcons';

export const AdGenerator: React.FC = () => {
  // Coming Soon - temporarily disabled
    return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-12 text-center">
        <SparklesIcon className="w-16 h-16 text-primary-600 dark:text-primary-400 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Ad Ideas
          </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-2">
          Coming Soon
        </p>
        <p className="text-gray-500 dark:text-gray-500">
          We're working on an AI-powered ad generator that will help you create compelling text and video ads for all your social media platforms.
        </p>
      </div>
    </div>
  );
};
