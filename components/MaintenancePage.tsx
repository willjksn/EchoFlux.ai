import React, { useEffect } from 'react';
import { LogoIcon } from './icons/UIIcons';

interface MaintenancePageProps {
    allowedEmail?: string | null;
    onBypass?: () => void;
}

export const MaintenancePage: React.FC<MaintenancePageProps> = ({ allowedEmail, onBypass }) => {
    useEffect(() => {
        // Log that maintenance page is rendering
        console.log('🔧 Maintenance Page is rendering');
        // Force body styles to ensure visibility
        document.body.style.margin = '0';
        document.body.style.padding = '0';
        document.body.style.overflow = 'hidden';
    }, []);

    return (
        <div 
            className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center px-4"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                minHeight: '100vh',
                width: '100vw',
                backgroundColor: '#111827',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                zIndex: 9999
            }}
        >
            <div className="max-w-2xl w-full text-center" style={{ maxWidth: '42rem', width: '100%', textAlign: 'center' }}>
                {/* Logo */}
                <div className="flex justify-center mb-8" style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
                    <div className="flex items-center" style={{ display: 'flex', alignItems: 'center' }}>
                        <LogoIcon />
                        <span className="ml-2 text-2xl font-bold text-white" style={{ marginLeft: '0.5rem', fontSize: '1.5rem', fontWeight: 'bold', color: '#ffffff' }}>EchoFlux.ai</span>
                    </div>
                </div>

                {/* Maintenance Message */}
                <div 
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 md:p-12"
                    style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '1rem',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        padding: '2rem'
                    }}
                >
                    {/* Maintenance Badge */}
                    <div className="mb-6" style={{ marginBottom: '1.5rem' }}>
                        <div 
                            className="inline-block px-4 py-2 mb-4 rounded-full bg-yellow-100 text-yellow-800 font-semibold text-sm"
                            style={{
                                display: 'inline-block',
                                padding: '0.5rem 1rem',
                                marginBottom: '1rem',
                                borderRadius: '9999px',
                                backgroundColor: '#FEF3C7',
                                color: '#92400E',
                                fontWeight: '600',
                                fontSize: '0.875rem'
                            }}
                        >
                            🔧 MAINTENANCE MODE
                        </div>
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900 mb-4">
                            <svg className="w-10 h-10 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                    </div>

                    <h1 
                        className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4"
                        style={{
                            fontSize: '2.25rem',
                            fontWeight: 'bold',
                            color: '#111827',
                            marginBottom: '1rem'
                        }}
                    >
                        We're Getting Ready!
                    </h1>
                    
                    <p 
                        className="text-lg text-gray-600 dark:text-gray-300 mb-6"
                        style={{
                            fontSize: '1.125rem',
                            color: '#4B5563',
                            marginBottom: '1.5rem'
                        }}
                    >
                        EchoFlux.ai is currently in development and testing mode. 
                        We're working hard to bring you an amazing experience.
                    </p>

                    <div 
                        className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6"
                        style={{
                            backgroundColor: '#EFF6FF',
                            borderColor: '#BFDBFE',
                        }}
                    >
                        <p 
                            className="text-sm"
                            style={{
                                color: '#1E40AF',
                                fontWeight: '500',
                            }}
                        >
                            <strong style={{ fontWeight: '700' }}>Coming Soon:</strong> We'll be launching soon with full payment processing 
                            and all features ready to go. Stay tuned!
                        </p>
                    </div>

                    {/* Developer Bypass */}
                    {allowedEmail && onBypass && (
                        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                                Developer Access
                            </p>
                            <button
                                onClick={onBypass}
                                className="px-4 py-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
                            >
                                Continue to Site (Bypass Maintenance)
                            </button>
                        </div>
                    )}

                    <div className="mt-8 text-sm text-gray-500 dark:text-gray-400">
                        <p>Questions? Contact us at <a href="mailto:contact@echoflux.ai" className="text-primary-600 dark:text-primary-400 hover:underline">contact@echoflux.ai</a></p>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 text-sm text-gray-400">
                    <p>&copy; {new Date().getFullYear()} EchoFlux.ai. All rights reserved.</p>
                </div>
            </div>
        </div>
    );
};

