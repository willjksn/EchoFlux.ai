

import React, { useState } from 'react';
import { Client, TeamMember, Platform, SocialStats } from '../types';
import { BriefcaseIcon, LinkIcon, CheckCircleIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { defaultSettings } from '../constants';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';


interface AddClientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (newClient: Client) => void;
}

const platformIcons: Record<Platform, React.ReactNode> = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
};

const AddClientModal: React.FC<AddClientModalProps> = ({ isOpen, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [plan, setPlan] = useState<'Free' | 'Pro' | 'Elite'>('Pro');
    const [connectedAccounts, setConnectedAccounts] = useState<Record<Platform, boolean>>({
        Instagram: false, TikTok: false, X: false, Threads: false, YouTube: false, LinkedIn: false, Facebook: false, Pinterest: false, Discord: false, Telegram: false, Reddit: false
    });
    
    if (!isOpen) return null;

    const generateMockSocialStats = (): Record<Platform, SocialStats> => {
        const stats: any = {};
        const platforms: Platform[] = ['Instagram', 'TikTok', 'X', 'Threads', 'YouTube', 'LinkedIn', 'Facebook'];
        platforms.forEach(p => {
            stats[p] = {
                followers: Math.floor(Math.random() * 20000) + 500,
                following: Math.floor(Math.random() * 500) + 50,
            };
        });
        return stats;
    };

    const handleSave = () => {
        const storageLimits = { Free: 100, Pro: 1024, Elite: 10240, Agency: 51200, Growth: 25600, Starter: 512 };
        const newClient: Client = {
            id: `client-${Date.now()}`,
            name,
            avatar: `https://picsum.photos/seed/${name}/40/40`,
            plan,
            notifications: { newMessages: true, weeklySummary: false, trendAlerts: false },
            monthlyCaptionGenerationsUsed: 0,
            monthlyImageGenerationsUsed: 0,
            monthlyVideoGenerationsUsed: 0,
            mediaLibrary: [],
            storageUsed: 0,
            storageLimit: storageLimits[plan] || 100,
            settings: { ...defaultSettings, connectedAccounts },
            socialStats: generateMockSocialStats(),
        };
        onSave(newClient);
        // Reset form
        setName('');
        setEmail('');
        setPlan('Pro');
        setConnectedAccounts({ Instagram: false, TikTok: false, X: false, Threads: false, YouTube: false, LinkedIn: false, Facebook: false, Pinterest: false, Discord: false, Telegram: false, Reddit: false });
    };
    
    const toggleAccount = (platform: Platform) => {
        setConnectedAccounts(prev => ({...prev, [platform]: !prev[platform]}));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full m-4">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Add New Client</h3>
                    <div className="mt-4 space-y-4">
                        <div>
                            <label htmlFor="client-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Client Name</label>
                            <input type="text" id="client-name" value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"/>
                        </div>
                        <div>
                            <label htmlFor="client-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Client Email</label>
                            <input type="email" id="client-email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"/>
                        </div>
                        <div>
                            <label htmlFor="client-plan" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Assign Plan</label>
                            <select id="client-plan" value={plan} onChange={e => setPlan(e.target.value as any)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md dark:text-white dark:placeholder-gray-400">
                                <option>Pro</option>
                                <option>Elite</option>
                                <option>Free</option>
                            </select>
                        </div>
                        <div>
                             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Connect Social Accounts</label>
                             <div className="mt-2 grid grid-cols-2 gap-3">
                                {(Object.keys(platformIcons) as Platform[]).map(platform => (
                                    <button key={platform} onClick={() => toggleAccount(platform)} className={`flex items-center p-3 rounded-lg border-2 transition-colors text-gray-900 dark:text-white ${connectedAccounts[platform] ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                                        {platformIcons[platform]}
                                        <span className="ml-3 font-semibold">{platform}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end space-x-3">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500">Cancel</button>
                        <button onClick={handleSave} disabled={!name || !email} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50">Save Client</button>
                    </div>
                </div>
            </div>
        </div>
    );
};


interface ClientsProps {}

const SettingsSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{title}</h3>
        <div className="space-y-4">{children}</div>
    </div>
);

export const Clients: React.FC<ClientsProps> = () => {
    const { user, clients, setClients, teamMembers, showToast, setActivePage } = useAppContext();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleAddClient = (newClient: Client) => {
        setClients(prev => [...prev, newClient]);
        setIsModalOpen(false);
    };

    const handleRemove = (id: string) => {
        setClients(prev => prev.filter(client => client.id !== id));
    };

    const generateApprovalLink = (clientId: string) => {
        const link = `https://engagesuite.ai/review/${clientId}/${Date.now().toString(36)}`;
        navigator.clipboard.writeText(link);
        showToast('Approval link copied to clipboard!', 'success');
        
        setClients(prev => prev.map(c => c.id === clientId ? {...c, approvalLink: link} : c));
    };
    
    // STRICT CHECK: Must be Agency or Admin
    if ((!user || user.plan !== 'Agency') && user?.role !== 'Admin') {
        return (
             <div className="max-w-4xl mx-auto text-center bg-white dark:bg-gray-800 p-12 rounded-xl shadow-md mt-10">
                <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 mb-6">
                    <BriefcaseIcon className="w-10 h-10"/>
                </div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Upgrade to Agency Plan</h2>
                <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-lg mx-auto">
                    Client management is exclusive to our Agency plan. Manage multiple accounts, invite your team, and use white-label approval workflows.
                </p>
                <button 
                    onClick={() => setActivePage('pricing')}
                    className="mt-8 px-8 py-3 bg-primary-600 text-white font-bold rounded-full hover:bg-primary-700 shadow-lg transform transition hover:-translate-y-1"
                >
                    View Agency Plans
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <AddClientModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleAddClient}
            />
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Client Management</h2>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center justify-center px-4 py-2 text-base font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
                >
                    Add New Client
                </button>
            </div>
            
            <SettingsSection title="Managed Clients">
                {clients.length > 0 ? (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {clients.map(client => {
                            const assignedMembers = teamMembers.filter(member => member.assignedClientIds?.includes(client.id));
                            return (
                                <div key={client.id} className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-center space-x-4">
                                        <img src={client.avatar} alt={client.name} className="w-12 h-12 rounded-full"/>
                                        <div>
                                            <p className="font-bold text-gray-900 dark:text-white">{client.name}</p>
                                             <span className={`px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200`}>
                                                {client.plan} Plan
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-4">
                                        <div className="flex items-center">
                                            <span className="text-sm font-medium mr-2 text-gray-500 dark:text-gray-400">Assigned:</span>
                                            <div className="flex -space-x-2">
                                                {assignedMembers.length > 0 ? assignedMembers.map(member => (
                                                    <img key={member.id} src={member.avatar} alt={member.name} title={member.name} className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800"/>
                                                )) : <span className="text-sm text-gray-400">None</span>}
                                            </div>
                                        </div>
                                        <button onClick={() => generateApprovalLink(client.id)} className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300" title="Copy External Approval Link">
                                            <LinkIcon /> Share
                                        </button>
                                        <button onClick={() => handleRemove(client.id)} className="text-sm font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">Remove</button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                     <p className="text-gray-500 dark:text-gray-400 text-center py-8">You haven't added any clients yet. Click "Add New Client" to get started.</p>
                )}
            </SettingsSection>
        </div>
    );
};