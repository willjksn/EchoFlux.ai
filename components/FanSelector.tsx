import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { UserIcon, SearchIcon, XMarkIcon } from './icons/UIIcons';
import { db } from '../firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';

interface Fan {
    id: string;
    name: string;
    preferences?: {
        subscriptionTier?: 'VIP' | 'Regular' | 'New';
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
                        subscriptionTier: data.subscriptionTier || (data.totalSessions >= 10 ? 'VIP' : data.totalSessions >= 3 ? 'Regular' : 'New'),
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

    const handleNewFan = () => {
        if (!newFanName.trim()) {
            showToast?.('Please enter a fan name', 'error');
            return;
        }
        const fanId = newFanName.toLowerCase().replace(/\s+/g, '_');
        onSelectFan(fanId, newFanName.trim());
        setNewFanName('');
        setShowFanGrid(false);
    };

    if (compact) {
        return (
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setShowFanGrid(!showFanGrid)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white flex items-center justify-between"
                >
                    <span className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4" />
                        {selectedFan ? selectedFan.name : 'Select Fan (Optional)'}
                    </span>
                    {selectedFanId && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectFan(null, null);
                            }}
                            className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            <XMarkIcon className="w-4 h-4" />
                        </button>
                    )}
                </button>

                {showFanGrid && (
                    <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto">
                        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                            <div className="relative">
                                <SearchIcon className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={fanSearchQuery}
                                    onChange={(e) => setFanSearchQuery(e.target.value)}
                                    placeholder="Search fans..."
                                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </div>
                        <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
                            {isLoading ? (
                                <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">Loading...</div>
                            ) : filteredFans.length === 0 ? (
                                <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
                                    {fanSearchQuery ? 'No fans found' : 'No fans yet'}
                                </div>
                            ) : (
                                filteredFans.map((fan) => (
                                    <div
                                        key={fan.id}
                                        onClick={() => {
                                            onSelectFan(fan.id, fan.name);
                                            setShowFanGrid(false);
                                        }}
                                        className={`p-2 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                                            selectedFanId === fan.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 text-xs font-semibold">
                                                {getInitials(fan.name)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                    {fan.name}
                                                </div>
                                                {fan.preferences?.subscriptionTier && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        {fan.preferences.subscriptionTier}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        {allowNewFan && (
                            <div className="p-3 border-t border-gray-200 dark:border-gray-700">
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
                                        placeholder="Enter new fan name..."
                                        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleNewFan}
                                        className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Click outside to close */}
                {showFanGrid && (
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowFanGrid(false)}
                    />
                )}
            </div>
        );
    }

    // Full version
    return (
        <div className="space-y-2">
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
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{selectedFan.name}</div>
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
                                            <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                                {fan.name}
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

