import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from './AppContext';
import { UserIcon, SearchIcon, XMarkIcon } from './icons/UIIcons';
import { db } from '../firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';

interface Fan {
    id: string;
    name: string;
    preferences?: {
        subscriptionTier?: 'Free' | 'Paid';
        isVIP?: boolean;
        spendingLevel?: number;
        totalSessions?: number;
        isBigSpender?: boolean;
        isLoyalFan?: boolean;
        lastSessionDate?: string;
    };
}

interface FanSelectorProps {
    selectedFanId: string | null;
    onSelectFan: (fanId: string | null, fanName: string | null) => void;
    allowNewFan?: boolean;
    compact?: boolean;
}

export const FanSelector: React.FC<FanSelectorProps> = ({
    selectedFanId,
    onSelectFan,
    allowNewFan = true,
    compact = false
}) => {
    const { user, showToast } = useAppContext();
    const [fans, setFans] = useState<Fan[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showFanGrid, setShowFanGrid] = useState(false);
    const [fanSearchQuery, setFanSearchQuery] = useState('');
    const [newFanName, setNewFanName] = useState('');
    const containerRef = useRef<HTMLDivElement | null>(null);

    const loadFans = async () => {
        if (!user?.id) return;
        setIsLoading(true);
        try {
            const fansSnap = await getDocs(collection(db, 'users', user.id, 'onlyfans_fan_preferences'));
            const fansList = fansSnap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name || doc.id,
                    preferences: {
                        subscriptionTier: data.subscriptionTier || (data.totalSessions >= 3 ? 'Paid' : 'Free'),
                        isVIP: data.isVIP || data.isBigSpender || (data.spendingLevel && data.spendingLevel >= 4) || false,
                        spendingLevel: data.spendingLevel || 0,
                        totalSessions: data.totalSessions || 0,
                        isBigSpender: data.isBigSpender || false,
                        isLoyalFan: data.isLoyalFan || false,
                        lastSessionDate: data.lastSessionDate
                    }
                };
            });
            setFans(fansList);
        } catch (error) {
            console.error('Error loading fans:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (showFanGrid) {
            loadFans();
        }
    }, [showFanGrid, user?.id]);

    useEffect(() => {
        if (!showFanGrid) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowFanGrid(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showFanGrid]);

    const filteredFans = fans.filter(fan =>
        fan.name.toLowerCase().includes(fanSearchQuery.toLowerCase()) ||
        fan.id.toLowerCase().includes(fanSearchQuery.toLowerCase())
    );

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const getTierColor = (tier?: string) => {
        switch (tier) {
            case 'VIP': return 'bg-yellow-500 dark:bg-yellow-600';
            case 'Regular': return 'bg-blue-500 dark:bg-blue-600';
            default: return 'bg-gray-400 dark:bg-gray-600';
        }
    };

    const selectedFan = fans.find(f => f.id === selectedFanId);

    const handleNewFan = async () => {
        if (!newFanName.trim()) {
            showToast?.('Please enter a fan name', 'error');
            return;
        }
        const fanId = newFanName.toLowerCase().replace(/\s+/g, '_');
        // Create a new fan document in Firestore
        if (user?.id) {
            try {
                const { doc, setDoc } = await import('firebase/firestore');
                const { db } = await import('../firebaseConfig');
                await setDoc(doc(db, 'users', user.id, 'onlyfans_fan_preferences', fanId), {
                    name: newFanName.trim(),
                    createdAt: new Date().toISOString(),
                });
            } catch (error) {
                console.error('Error creating new fan:', error);
            }
        }
        onSelectFan(fanId, newFanName.trim());
        setNewFanName('');
        setShowFanGrid(false);
    };

    if (compact) {
        // Load fans on mount for dropdown
        useEffect(() => {
            if (user?.id) {
                loadFans();
            }
        }, [user?.id]);

        return (
            <div className="relative" ref={containerRef}>
                <button
                    type="button"
                    onClick={() => {
                        setShowFanGrid(!showFanGrid);
                        if (!showFanGrid && fans.length === 0) {
                            loadFans();
                        }
                    }}
                    className="w-full px-4 py-3 text-sm border-2 border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white flex items-center justify-between hover:border-primary-500 dark:hover:border-primary-500 transition-colors"
                >
                    <span className="flex items-center gap-2">
                        <UserIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        <span className="font-medium">
                            {selectedFan ? selectedFan.name : 'Select Fan to Personalize Captions (Optional)'}
                        </span>
                    </span>
                    <div className="flex items-center gap-2">
                        {selectedFanId && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectFan(null, null);
                                }}
                                className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded"
                                title="Clear selection"
                            >
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        )}
                        <svg 
                            className={`w-4 h-4 text-gray-400 transition-transform ${showFanGrid ? 'rotate-180' : ''}`}
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </button>

                {showFanGrid && (
                    <div className="absolute z-50 mt-2 w-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-xl max-h-96 overflow-hidden">
                        <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                            <div className="relative">
                                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    value={fanSearchQuery}
                                    onChange={(e) => setFanSearchQuery(e.target.value)}
                                    placeholder="Search fans by name..."
                                    className="w-full pl-10 pr-3 py-2.5 text-sm border-2 border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-primary-500 dark:focus:border-primary-500 focus:outline-none"
                                    onClick={(e) => e.stopPropagation()}
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
                            {isLoading ? (
                                <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                                    <p className="mt-2">Loading fans...</p>
                                </div>
                            ) : filteredFans.length === 0 ? (
                                <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                                    {fanSearchQuery ? (
                                        <>
                                            <p>No fans found matching "{fanSearchQuery}"</p>
                                            {allowNewFan && (
                                                <p className="text-xs mt-1">You can add a new fan below</p>
                                            )}
                                        </>
                                    ) : (
                                        <p>No fans yet. Add one below to get started!</p>
                                    )}
                                </div>
                            ) : (
                                filteredFans.map((fan) => (
                                    <div
                                        key={fan.id}
                                        onClick={() => {
                                            onSelectFan(fan.id, fan.name);
                                            setShowFanGrid(false);
                                        }}
                                        className={`p-3 rounded-lg cursor-pointer transition-all ${
                                            selectedFanId === fan.id 
                                                ? 'bg-primary-100 dark:bg-primary-900/30 border-2 border-primary-500 dark:border-primary-500' 
                                                : 'hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
                                                fan.preferences?.subscriptionTier === 'Paid'
                                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                                    : 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                            }`}>
                                                {getInitials(fan.name)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                                        {fan.name}
                                                    </div>
                                                    {fan.preferences?.isVIP && (
                                                        <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                                                            VIP
                                                        </span>
                                                    )}
                                                </div>
                                                {fan.preferences?.subscriptionTier && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                        {fan.preferences.subscriptionTier}
                                                        {fan.preferences.spendingLevel > 0 && ` • Level ${fan.preferences.spendingLevel}`}
                                                    </div>
                                                )}
                                            </div>
                                            {selectedFanId === fan.id && (
                                                <div className="text-primary-600 dark:text-primary-400">
                                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        {allowNewFan && (
                            <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    Add New Fan:
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newFanName}
                                        onChange={(e) => setNewFanName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleNewFan();
                                            }
                                        }}
                                        placeholder="Enter fan name..."
                                        className="flex-1 px-3 py-2 text-sm border-2 border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-primary-500 dark:focus:border-primary-500 focus:outline-none"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleNewFan}
                                        className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 font-medium transition-colors"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // Full version
    return (
        <div className="space-y-2" ref={containerRef}>
            <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Fan (Optional)
                </label>
                <button
                    type="button"
                    onClick={() => setShowFanGrid(!showFanGrid)}
                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                >
                    <UserIcon className="w-4 h-4" />
                    {showFanGrid ? 'Hide Fans' : 'Browse Fans'}
                </button>
            </div>

            {selectedFan && (
                <div className="flex items-center gap-2 p-2 bg-primary-50 dark:bg-primary-900/20 rounded-md border border-primary-200 dark:border-primary-800">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 text-xs font-semibold">
                        {getInitials(selectedFan.name)}
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{selectedFan.name}</div>
                            {selectedFan.preferences?.isVIP && (
                                <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                                    VIP
                                </span>
                            )}
                        </div>
                        {selectedFan.preferences?.subscriptionTier && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{selectedFan.preferences.subscriptionTier}</div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => onSelectFan(null, null)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            )}

            {showFanGrid && (
                <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg p-4 border border-gray-200 dark:border-gray-700 space-y-3">
                    <div className="relative">
                        <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            value={fanSearchQuery}
                            onChange={(e) => setFanSearchQuery(e.target.value)}
                            placeholder="Search fans by name..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                    </div>

                    {isLoading ? (
                        <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">Loading fans...</div>
                    ) : filteredFans.length === 0 ? (
                        <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
                            {fanSearchQuery ? 'No fans match your search' : 'No fans yet'}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                            {filteredFans.map((fan) => (
                                <div
                                    key={fan.id}
                                    onClick={() => {
                                        onSelectFan(fan.id, fan.name);
                                        setShowFanGrid(false);
                                    }}
                                    className={`p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                                        selectedFanId === fan.id
                                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-700'
                                    }`}
                                >
                                    <div className="flex items-start gap-2">
                                        <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 text-xs font-semibold flex-shrink-0">
                                            {getInitials(fan.name)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                                    {fan.name}
                                                </div>
                                                {fan.preferences?.isVIP && (
                                                    <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                                                        VIP
                                                    </span>
                                                )}
                                            </div>
                                            {fan.preferences?.subscriptionTier && (
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                    {fan.preferences.subscriptionTier}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {allowNewFan && (
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Or Enter New Fan Name
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newFanName}
                                    onChange={(e) => setNewFanName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleNewFan();
                                        }
                                    }}
                                    placeholder="Enter fan name..."
                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                                <button
                                    type="button"
                                    onClick={handleNewFan}
                                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

