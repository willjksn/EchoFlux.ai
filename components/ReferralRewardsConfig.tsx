import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { PlusIcon, TrashIcon, CheckCircleIcon } from './icons/UIIcons';
import { db } from '../firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface RewardConfig {
  milestone: number;
  type: 'free_month' | 'extra_generations' | 'storage_boost';
  amount: number;
  description: string;
}

const DEFAULT_REWARDS: RewardConfig[] = [
  { milestone: 1, type: 'extra_generations', amount: 50, description: '50 free AI generations' },
  { milestone: 3, type: 'extra_generations', amount: 100, description: '100 free AI generations' },
  { milestone: 5, type: 'free_month', amount: 1, description: '1 free month of Pro plan' },
  { milestone: 10, type: 'storage_boost', amount: 5, description: '5 GB extra storage' },
  { milestone: 20, type: 'free_month', amount: 3, description: '3 free months of Elite plan' },
];

export const ReferralRewardsConfig: React.FC = () => {
  const { user, showToast } = useAppContext();
  const [rewards, setRewards] = useState<RewardConfig[]>(DEFAULT_REWARDS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadRewards();
  }, []);

  const loadRewards = async () => {
    setIsLoading(true);
    try {
      const configDoc = await getDoc(doc(db, 'admin', 'referral_rewards_config'));
      if (configDoc.exists()) {
        const data = configDoc.data();
        setRewards(data.rewards || DEFAULT_REWARDS);
      }
    } catch (error) {
      console.error('Failed to load rewards config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveRewards = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'admin', 'referral_rewards_config'), {
        rewards,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.id,
      });
      showToast('Referral rewards configuration saved!', 'success');
    } catch (error) {
      console.error('Failed to save rewards config:', error);
      showToast('Failed to save configuration', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const addReward = () => {
    const newMilestone = rewards.length > 0 
      ? Math.max(...rewards.map(r => r.milestone)) + 5 
      : 5;
    setRewards([...rewards, {
      milestone: newMilestone,
      type: 'extra_generations',
      amount: 50,
      description: '',
    }]);
  };

  const removeReward = (index: number) => {
    setRewards(rewards.filter((_, i) => i !== index));
  };

  const updateReward = (index: number, field: keyof RewardConfig, value: any) => {
    const updated = [...rewards];
    updated[index] = { ...updated[index], [field]: value };
    setRewards(updated);
  };

  if (isLoading) {
    return <div className="p-6 text-center text-gray-500">Loading rewards configuration...</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Referral Rewards Configuration</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configure rewards that users earn when they refer others. Rewards are granted at specific referral milestones.
        </p>
      </div>

      <div className="space-y-4 mb-6">
        {rewards.map((reward, index) => (
          <div key={index} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Milestone (referrals)
                </label>
                <input
                  type="number"
                  value={reward.milestone}
                  onChange={(e) => updateReward(index, 'milestone', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reward Type
                </label>
                <select
                  value={reward.type}
                  onChange={(e) => updateReward(index, 'type', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                >
                  <option value="extra_generations">Extra AI Generations</option>
                  <option value="free_month">Free Month(s)</option>
                  <option value="storage_boost">Storage Boost (GB)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Amount
                </label>
                <input
                  type="number"
                  value={reward.amount}
                  onChange={(e) => updateReward(index, 'amount', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                  min="1"
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={reward.description}
                    onChange={(e) => updateReward(index, 'description', e.target.value)}
                    placeholder="e.g., 50 free AI generations"
                    className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <button
                  onClick={() => removeReward(index)}
                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                  title="Remove reward"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={addReward}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          Add Reward
        </button>
        <button
          onClick={saveRewards}
          disabled={isSaving}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
              Saving...
            </>
          ) : (
            <>
              <CheckCircleIcon className="w-5 h-5" />
              Save Configuration
            </>
          )}
        </button>
      </div>

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">Reward Types Explained:</h3>
        <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
          <li><strong>Extra AI Generations:</strong> Reduces the user's monthly usage count (gives them free generations)</li>
          <li><strong>Free Month(s):</strong> Extends subscription or upgrades Free users to Pro for the specified months</li>
          <li><strong>Storage Boost:</strong> Adds extra GB to the user's storage limit permanently</li>
        </ul>
      </div>
    </div>
  );
};
