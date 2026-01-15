import React from 'react';
import { CheckCircleIcon } from './icons/UIIcons';

interface ToastProps {
    message: string;
    type: 'success' | 'error' | 'info';
}

const InfoIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);


export const Toast: React.FC<ToastProps> = ({ message, type }) => {
    const isSuccess = type === 'success';
    const isInfo = type === 'info';

    return (
        <div 
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[1001] flex items-center p-4 rounded-full shadow-lg animate-fade-in-down"
            style={{ 
                backgroundColor: isSuccess ? '#4CAF50' : isInfo ? '#2196F3' : '#F44336', 
                color: 'white' 
            }}
            role="alert"
            aria-live="assertive"
        >
            <div className="flex-shrink-0">
                {isSuccess ? <CheckCircleIcon className="w-6 h-6" /> : <InfoIcon />}
            </div>
            <div className="ml-3">
                <p className="font-semibold">{message}</p>
            </div>
            <style>{`
                @keyframes fade-in-down {
                    0% {
                        opacity: 0;
                        transform: translate(-50%, -20px);
                    }
                    100% {
                        opacity: 1;
                        transform: translate(-50%, 0);
                    }
                }
                .animate-fade-in-down {
                    animation: fade-in-down 0.5s ease-out forwards;
                }
            `}</style>
        </div>
    );
};