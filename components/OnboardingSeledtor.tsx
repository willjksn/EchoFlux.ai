import React from 'react';
import { UserType } from '../types';
import { UserIcon, BriefcaseIcon } from './icons/UIIcons';

interface OnboardingSelectorProps {
    onSelect: (type: UserType) => void;
}

export const OnboardingSelector: React.FC<OnboardingSelectorProps> = ({ onSelect }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm" aria-modal="true">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full m-4 p-8 text-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">How will you be using EngageSuite.ai?</h2>
                <p className="mt-2 text-gray-500 dark:text-gray-400">Choose your workspace to get a tailored experience.</p>
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <button
                        onClick={() => onSelect('Creator')}
                        className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all text-left group"
                    >
                        <div className="p-3 bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded-full w-fit mb-3 group-hover:scale-110 transition-transform">
                            <UserIcon className="w-6 h-6" />
                        </div>
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">As a Creator</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">For personal brands, influencers, and artists focused on audience growth.</p>
                    </button>
                    <button
                        onClick={() => onSelect('Business')}
                        className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all text-left group"
                    >
                         <div className="p-3 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full w-fit mb-3 group-hover:scale-110 transition-transform">
                            <BriefcaseIcon className="w-6 h-6" />
                        </div>
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">For a Business</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">For companies, agencies, and entrepreneurs focused on leads & sales.</p>
                    </button>
                </div>
            </div>
        </div>
    );
};