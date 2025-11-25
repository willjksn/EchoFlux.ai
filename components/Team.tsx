import React, { useState, useEffect } from 'react';
import { TeamMember, Client, Role } from '../types';
import { useAppContext } from './AppContext';
import { TeamIcon, UserPlusIcon } from './icons/UIIcons';

interface TeamProps {}

const SettingsSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{title}</h3>
        <div className="space-y-4">{children}</div>
    </div>
);

const TeamMemberModal: React.FC<{
    member: TeamMember;
    onClose: () => void;
    onSave: (updatedMember: TeamMember) => void;
}> = ({ member, onClose, onSave }) => {
    const { clients } = useAppContext();
    const [role, setRole] = useState<Role>(member.role);
    const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set(member.assignedClientIds || []));

    const handleClientToggle = (clientId: string) => {
        const newSet = new Set(assignedIds);
        newSet.has(clientId) ? newSet.delete(clientId) : newSet.add(clientId);
        setAssignedIds(newSet);
    };

    const handleSave = () => {
        onSave({ ...member, role, assignedClientIds: Array.from(assignedIds) });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full m-4">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Edit {member.name}</h3>
                    <div className="mt-4 space-y-4">
                        <div>
                            <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                            <select id="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md">
                                <option>Admin</option>
                                <option>Member</option>
                            </select>
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Assign Clients</h4>
                            <div className="mt-2 space-y-2 max-h-48 overflow-y-auto pr-2">
                                {clients.map(client => (
                                    <label key={client.id} className="flex items-center p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                                        <input type="checkbox" checked={assignedIds.has(client.id)} onChange={() => handleClientToggle(client.id)} className="h-4 w-4 text-primary-600 border-gray-300 rounded"/>
                                        <img src={client.avatar} alt={client.name} className="w-6 h-6 rounded-full mx-2" />
                                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{client.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                     <div className="mt-6 flex justify-end space-x-3">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500">Cancel</button>
                        <button onClick={handleSave} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">Save Changes</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const TeamSkeleton: React.FC = () => (
    <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
            <div key={i} className="py-4 flex items-center justify-between animate-pulse">
                <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                    <div>
                        <div className="h-5 w-28 bg-gray-200 dark:bg-gray-700 rounded"></div>
                        <div className="h-4 w-36 bg-gray-200 dark:bg-gray-700 rounded mt-2"></div>
                    </div>
                </div>
                <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
            </div>
        ))}
    </div>
);


export const Team: React.FC<TeamProps> = () => {
    const { clients, teamMembers, setTeamMembers } = useAppContext();
    const [isLoading, setIsLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState('');
    const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

    useEffect(() => {
        // In a real app, you would fetch team members here.
        // For now, we just stop the loading state.
        setIsLoading(false);
    }, []);

    const handleInvite = () => {
        if (inviteEmail && !teamMembers.some(m => m.email === inviteEmail)) {
            const newMember: TeamMember = {
                id: (Math.random() * 1000).toString(),
                name: 'New Member (Invited)',
                email: inviteEmail,
                avatar: `https://picsum.photos/seed/${inviteEmail}/40/40`,
                role: 'Member',
                assignedClientIds: []
            };
            setTeamMembers(prev => [...prev, newMember]);
            setInviteEmail('');
        }
    };

    const handleRemove = (id: string) => {
        setTeamMembers(prev => prev.filter(member => member.id !== id));
    };

    const handleSaveMember = (updatedMember: TeamMember) => {
        setTeamMembers(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
        setEditingMember(null);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
             {editingMember && (
                <TeamMemberModal 
                    member={editingMember}
                    onClose={() => setEditingMember(null)}
                    onSave={handleSaveMember}
                />
            )}
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Team Management</h2>
            
            <SettingsSection title="Invite New Member">
                <div className="flex flex-col sm:flex-row gap-4">
                     <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="Enter member's email address"
                        className="flex-grow p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <button
                        onClick={handleInvite}
                        disabled={!inviteEmail}
                        className="flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:bg-primary-300 dark:disabled:bg-primary-800 disabled:cursor-not-allowed"
                    >
                        Send Invite
                    </button>
                </div>
            </SettingsSection>

            <SettingsSection title="Team Members">
                {isLoading ? (
                    <TeamSkeleton />
                ) : teamMembers.length > 0 ? (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {teamMembers.map(member => {
                            const assignedClients = clients.filter(client => member.assignedClientIds?.includes(client.id));
                            return (
                                <div key={member.id} className="py-4 flex items-center justify-between">
                                    <div className="flex items-center space-x-4">
                                        <img src={member.avatar} alt={member.name} className="w-12 h-12 rounded-full"/>
                                        <div>
                                            <p className="font-bold text-gray-900 dark:text-white">{member.name}</p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">{member.email}</p>
                                             <div className="flex items-center mt-2">
                                                <span className="text-xs font-semibold mr-2 text-gray-500 dark:text-gray-400">Clients:</span>
                                                <div className="flex -space-x-2">
                                                    {assignedClients.map(client => (
                                                        <img key={client.id} src={client.avatar} alt={client.name} title={client.name} className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-800"/>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-4">
                                        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${member.role === 'Admin' ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/50 dark:text-primary-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}>
                                            {member.role}
                                        </span>
                                        <button onClick={() => setEditingMember(member)} className="text-sm font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300">Edit</button>
                                        <button onClick={() => handleRemove(member.id)} className="text-sm font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">Remove</button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                     <div className="text-center py-8">
                        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400">
                           <TeamIcon />
                        </div>
                        <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">Build your team</h3>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Invite colleagues to collaborate and manage clients together.</p>
                        <button
                            onClick={() => {
                                const inviteInput = document.querySelector('input[type="email"]') as HTMLInputElement;
                                inviteInput?.focus();
                            }}
                            className="mt-6 flex items-center justify-center w-full sm:w-auto mx-auto px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
                        >
                            <UserPlusIcon />
                            <span className="ml-2">Invite New Member</span>
                        </button>
                    </div>
                )}
            </SettingsSection>
        </div>
    );
};