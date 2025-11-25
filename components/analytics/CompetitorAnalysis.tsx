
import React, { useState } from 'react';
import { UserIcon, TrendingIcon } from '../icons/UIIcons';

const MockCompetitors = [
    { name: 'Competitor A', engagement: '4.2%', followers: '12.5k', postsPerWeek: 12, status: 'up' },
    { name: 'Competitor B', engagement: '2.1%', followers: '45.2k', postsPerWeek: 5, status: 'down' },
    { name: 'Your Brand', engagement: '3.8%', followers: '8.9k', postsPerWeek: 9, status: 'up', isMe: true },
];

export const CompetitorAnalysis: React.FC = () => {
    const [competitors, setCompetitors] = useState(MockCompetitors);
    const [newCompetitor, setNewCompetitor] = useState('');

    const handleAdd = () => {
        if (newCompetitor) {
            setCompetitors([...competitors, { name: newCompetitor, engagement: '0%', followers: 'Unknown', postsPerWeek: 0, status: 'flat', isMe: false }]);
            setNewCompetitor('');
        }
    };

    return (
        <div className="space-y-6">
             <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Competitor Benchmark</h3>
                <div className="flex gap-2 mb-6">
                    <input 
                        type="text" 
                        value={newCompetitor} 
                        onChange={e => setNewCompetitor(e.target.value)} 
                        placeholder="Enter competitor handle (e.g. @competitor)" 
                        className="flex-grow p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                    />
                    <button onClick={handleAdd} className="px-4 py-2 bg-primary-600 text-white rounded-md">Add</button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-sm">
                            <tr>
                                <th className="p-3 rounded-tl-lg">Account</th>
                                <th className="p-3">Engagement Rate</th>
                                <th className="p-3">Followers</th>
                                <th className="p-3 rounded-tr-lg">Posts / Week</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-700 dark:text-gray-300">
                            {competitors.map((comp, i) => (
                                <tr key={i} className={`border-b border-gray-100 dark:border-gray-700 ${comp.isMe ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                                    <td className="p-3 font-medium flex items-center gap-2">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${comp.isMe ? 'bg-primary-100 text-primary-700' : 'bg-gray-200 text-gray-600'}`}>
                                            {comp.name.charAt(0)}
                                        </div>
                                        {comp.name} {comp.isMe && <span className="text-xs bg-primary-600 text-white px-2 rounded-full ml-2">You</span>}
                                    </td>
                                    <td className="p-3 font-bold">{comp.engagement}</td>
                                    <td className="p-3">{comp.followers}</td>
                                    <td className="p-3">{comp.postsPerWeek}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                    <h4 className="font-bold mb-2 dark:text-white">Top Performing Content Types</h4>
                    <div className="space-y-3">
                        <div>
                            <div className="flex justify-between text-sm mb-1 dark:text-gray-300"><span>Reels / Short Video</span><span>High Impact</span></div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full" style={{width: '85%'}}></div></div>
                        </div>
                        <div>
                             <div className="flex justify-between text-sm mb-1 dark:text-gray-300"><span>Carousels</span><span>Medium Impact</span></div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div className="bg-blue-500 h-2 rounded-full" style={{width: '60%'}}></div></div>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                    <h4 className="font-bold mb-2 dark:text-white">Posting Time Analysis</h4>
                     <p className="text-sm text-gray-500 mb-4">When are your competitors getting the most engagement?</p>
                     <div className="flex justify-between items-end h-24 gap-1">
                        {[30, 50, 80, 60, 90, 40, 20].map((h, i) => (
                            <div key={i} className="w-full bg-primary-200 dark:bg-primary-900 rounded-t-sm relative group">
                                <div className="absolute bottom-0 w-full bg-primary-500 rounded-t-sm transition-all hover:bg-primary-400" style={{height: `${h}%`}}></div>
                            </div>
                        ))}
                     </div>
                     <div className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                     </div>
                </div>
            </div>
        </div>
    );
};
