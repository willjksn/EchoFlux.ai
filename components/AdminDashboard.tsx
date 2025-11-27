
import React, { useState, useMemo, useEffect } from 'react';
import { User, Activity } from '../types';
import { UserManagementModal } from './UserManagementModal';
import { TeamIcon, DollarSignIcon, UserPlusIcon, ArrowUpCircleIcon, ImageIcon, VideoIcon, LockIcon } from './icons/UIIcons';
import { db } from '../firebaseConfig';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { useAppContext } from './AppContext';
import { defaultSettings } from '../constants';

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode }> = ({ title, value, icon }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md flex items-center space-x-4">
        <div className="p-3 bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 rounded-full">
            {icon}
        </div>
        <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
        </div>
    </div>
);

const getUsageString = (plan: User['plan'], usage: number | undefined, type: 'image' | 'video'): string => {
    const currentUsage = usage ?? 0;
    if (plan === 'Free') return `0/0`;
    if (plan === 'Pro') {
        const limit = type === 'image' ? 50 : 1;
        return `${currentUsage}/${limit}`;
    }
    if (plan === 'Elite') {
        const limit = type === 'image' ? 500 : 25;
        return `${currentUsage}/${limit}`;
    }
    if (plan === 'Agency') {
        const limit = type === 'image' ? 'Unlimited*' : 50;
        return `${currentUsage}/${limit}`;
    }
    return `${currentUsage}`;
};

const planColorMap: Record<User['plan'], string> = {
    Free: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    Pro: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
    Elite: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
    Agency: 'bg-primary-100 text-primary-800 dark:bg-primary-900/50 dark:text-primary-200',
    Growth: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
    Starter: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
};

const planPrices: Record<User['plan'], number> = { 
    'Free': 0, 
    'Pro': 49, 
    'Elite': 199, 
    'Agency': 599, 
    'Growth': 249, 
    'Starter': 99 
};

export const AdminDashboard: React.FC = () => {
    const { user: currentUser } = useAppContext();
    const [users, setUsers] = useState<User[]>([]);
    const [activityFeed, setActivityFeed] = useState<Activity[]>([]);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [accessError, setAccessError] = useState<string | null>(null);

    useEffect(() => {
        setIsLoading(true);
        setAccessError(null);
        
        let unsubscribe = () => {};

        try {
            // Use v9 modular SDK syntax
            const usersCollectionRef = collection(db, 'users');
            const q = query(usersCollectionRef, orderBy('signupDate', 'desc'));
            
            unsubscribe = onSnapshot(q, (snapshot) => {
                const usersList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as User[];
                setUsers(usersList);

                if (usersList.length > 0) {
                    const activity: Activity[] = usersList.slice(0, 5).map(user => ({
                        id: user.id,
                        type: 'New User',
                        user: { name: user.name, avatar: user.avatar },
                        details: 'joined EngageSuite.ai',
                        timestamp: new Date(user.signupDate).toLocaleString(),
                    }));
                    setActivityFeed(activity);
                }
                setIsLoading(false);
            }, (error) => {
                console.warn("Error fetching real admin data, falling back to mock data:", error);
                
                // Fallback Mock Data Generation
                const mockUsers: User[] = Array.from({ length: 15 }).map((_, i) => ({
                    id: `mock-user-${i}`,
                    name: i === 0 ? (currentUser?.name || 'Admin User') : `User ${i + 1}`,
                    email: i === 0 ? (currentUser?.email || 'admin@example.com') : `user${i + 1}@example.com`,
                    avatar: `https://picsum.photos/seed/${i + 123}/100/100`,
                    bio: 'Demo user',
                    plan: i === 0 ? 'Agency' : (['Free', 'Pro', 'Elite', 'Agency', 'Growth', 'Starter'][Math.floor(Math.random() * 6)] as any),
                    role: i === 0 ? 'Admin' : 'User',
                    signupDate: new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)).toISOString(),
                    hasCompletedOnboarding: true,
                    notifications: { newMessages: true, weeklySummary: false, trendAlerts: false },
                    monthlyCaptionGenerationsUsed: Math.floor(Math.random() * 100),
                    monthlyImageGenerationsUsed: Math.floor(Math.random() * 50),
                    monthlyVideoGenerationsUsed: Math.floor(Math.random() * 10),
                    storageUsed: Math.floor(Math.random() * 500),
                    storageLimit: 1000,
                    mediaLibrary: [],
                    settings: defaultSettings,
                }));

                setUsers(mockUsers);

                const mockActivity: Activity[] = mockUsers.slice(0, 6).map(u => ({
                    id: `act-${u.id}`,
                    type: Math.random() > 0.5 ? 'New User' : 'Plan Upgrade',
                    user: { name: u.name, avatar: u.avatar },
                    details: Math.random() > 0.5 ? 'joined EngageSuite.ai' : `upgraded to ${u.plan}`,
                    timestamp: 'Just now'
                }));
                setActivityFeed(mockActivity);
                
                setAccessError("Demo Mode: Using sample data (Firestore permissions restricted).");
                setIsLoading(false);
            });

        } catch (error) {
            console.error("Error setting up snapshot listener:", error);
            setAccessError("Failed to connect to database.");
            setIsLoading(false);
        }

        return () => unsubscribe();
    }, [currentUser]);
    
    const filteredUsers = useMemo(() => {
        return users.filter(user => 
            user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [users, searchTerm]);
    
    const handleSaveUser = (updatedUser: User) => {
        setUsers(prevUsers => prevUsers.map(u => u.id === updatedUser.id ? updatedUser : u));
        setEditingUser(null);
    };

    const { 
        totalUsers, 
        simulatedMRR, 
        newUsersCount, 
        totalImageGenerations, 
        totalVideoGenerations,
        planDistribution,
        topUsers
    } = useMemo(() => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const distribution: Record<User['plan'], number> = { Free: 0, Pro: 0, Elite: 0, Agency: 0, Growth: 0, Starter: 0 };
        
        users.forEach(user => {
            if (user.plan in distribution) {
                distribution[user.plan]++;
            }
        });

        const sortedUsers = [...users].sort((a, b) => {
            const usageA = Number(a.monthlyImageGenerationsUsed ?? 0) + Number(a.monthlyVideoGenerationsUsed ?? 0);
            const usageB = Number(b.monthlyImageGenerationsUsed ?? 0) + Number(b.monthlyVideoGenerationsUsed ?? 0);
            return usageB - usageA;
        });

        return {
            totalUsers: users.length,
            simulatedMRR: users.reduce((acc, user) => acc + (planPrices[user.plan] || 0), 0),
            newUsersCount: users.filter(user => new Date(user.signupDate).getTime() > thirtyDaysAgo.getTime()).length,
            totalImageGenerations: users.reduce((acc, user) => acc + Number(user.monthlyImageGenerationsUsed ?? 0), 0),
            totalVideoGenerations: users.reduce((acc, user) => acc + Number(user.monthlyVideoGenerationsUsed ?? 0), 0),
            planDistribution: distribution,
            topUsers: sortedUsers.slice(0, 3)
        };
    }, [users]);
    

    const activityIcons: Record<Activity['type'], React.ReactNode> = {
        'New User': <UserPlusIcon />,
        'Plan Upgrade': <ArrowUpCircleIcon />,
    };

    return (
        <div className="space-y-8">
             {accessError && (
                <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg flex items-center gap-3 text-yellow-800 dark:text-yellow-200">
                    <LockIcon className="w-5 h-5" />
                    <span>{accessError}</span>
                </div>
            )}
            {editingUser && (
                <UserManagementModal 
                    user={editingUser}
                    onClose={() => setEditingUser(null)}
                    onSave={handleSaveUser}
                />
            )}
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <StatCard title="Total Users" value={totalUsers} icon={<TeamIcon />}/>
                <StatCard title="Simulated MRR" value={`$${simulatedMRR.toLocaleString()}`} icon={<DollarSignIcon />}/>
                <StatCard title="New Users (30d)" value={newUsersCount} icon={<UserPlusIcon />}/>
                <StatCard title="Image Generations" value={totalImageGenerations.toLocaleString()} icon={<ImageIcon />}/>
                <StatCard title="Video Generations" value={totalVideoGenerations.toLocaleString()} icon={<VideoIcon />}/>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 grid grid-cols-1 gap-6">
                     <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Plan Distribution</h3>
                         <div className="space-y-3">
                            {Object.entries(planDistribution).map(([plan, count]) => {
                                const percentage = totalUsers > 0 ? (Number(count) / totalUsers * 100).toFixed(1) : "0";
                                return (
                                    <div key={plan}>
                                        <div className="flex justify-between text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                                            <span>{plan} Plan</span>
                                            <span>{count} Users ({percentage}%)</span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                            <div className="bg-primary-600 h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                     <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Top Users by AI Generations</h3>
                        <ul className="space-y-4">
                            {topUsers.map(user => (
                                <li key={user.id} className="flex items-center space-x-3">
                                    <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full" />
                                    <div className="flex-1">
                                        <p className="font-semibold text-gray-900 dark:text-white">{user.name}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                    </div>
                                    <span className="font-bold text-lg text-primary-600 dark:text-primary-400">
                                        {(Number(user.monthlyImageGenerationsUsed ?? 0) + Number(user.monthlyVideoGenerationsUsed ?? 0)).toLocaleString()}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
                    <ul className="space-y-4">
                        {activityFeed.length > 0 ? activityFeed.map(activity => (
                             <li key={activity.id} className="flex items-start space-x-3">
                                <div className="p-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full mt-1">
                                    {activityIcons[activity.type]}
                                </div>
                                <div>
                                    <p className="text-sm text-gray-800 dark:text-gray-200">
                                        <span className="font-semibold">{activity.user.name}</span> {activity.details}
                                    </p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500">{activity.timestamp}</p>
                                </div>
                            </li>
                        )) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No recent activity.</p>
                        )}
                    </ul>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">User Management</h3>
                    <input 
                        type="text"
                        placeholder="Search by name or email..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full sm:w-64 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:placeholder-gray-400"
                    />
                </div>
                <div className="overflow-x-auto">
                     {isLoading ? (
                        <div className="text-center py-16">
                            <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <p className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-300">Loading users...</p>
                        </div>
                    ) : (
                    <table className="w-full text-left min-w-[900px]">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">User</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Plan</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Signup Date</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Storage</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Image Usage</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Video Usage</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map(user => (
                                <tr key={user.id} className="border-b border-gray-200 dark:border-gray-700">
                                    <td className="p-3">
                                        <div className="flex items-center space-x-3">
                                            <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full"/>
                                            <div>
                                                <p className="font-bold text-gray-900 dark:text-white">{user.name}</p>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-3">
                                        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${planColorMap[user.plan]}`}>
                                            {user.plan}
                                        </span>
                                    </td>
                                    <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                                        {new Date(user.signupDate).toLocaleDateString()}
                                    </td>
                                    <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                                        {`${(user.storageUsed ?? 0).toFixed(1)}MB / ${(user.storageLimit ?? 0)}MB`}
                                    </td>
                                    <td className="p-3 font-mono text-gray-600 dark:text-gray-300">{getUsageString(user.plan, user.monthlyImageGenerationsUsed, 'image')}</td>
                                    <td className="p-3 font-mono text-gray-600 dark:text-gray-300">{getUsageString(user.plan, user.monthlyVideoGenerationsUsed, 'video')}</td>
                                    <td className="p-3">
                                        <button onClick={() => setEditingUser(user)} className="px-3 py-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md">
                                            Manage
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    )}
                </div>
            </div>
        </div>
    );
};