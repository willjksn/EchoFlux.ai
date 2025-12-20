import React, { useState } from 'react';
import { User } from '../types';
import { useAppContext } from './AppContext';
import { auth } from '../firebaseConfig';
// X icon for close button
const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className || "w-5 h-5"} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

interface GrantReferralRewardModalProps {
  user: User;
  onClose: () => void;
  onSuccess?: () => void;
}

export const GrantReferralRewardModal: React.FC<GrantReferralRewardModalProps> = ({
  user,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useAppContext();
  const [rewardType, setRewardType] = useState<'extra_generations' | 'free_month' | 'storage_boost'>('extra_generations');
  const [rewardAmount, setRewardAmount] = useState<number>(50);
  const [reason, setReason] = useState<string>('');
  const [isGranting, setIsGranting] = useState(false);

  const handleGrant = async () => {
    if (!rewardAmount || rewardAmount <= 0) {
      showToast('Please enter a valid reward amount', 'error');
      return;
    }

    setIsGranting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/adminGrantReferralReward', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          rewardType,
          rewardAmount,
          reason: reason.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showToast(data.message || 'Reward granted successfully!', 'success');
        onSuccess?.();
        onClose();
      } else {
        showToast(data.error || 'Failed to grant reward', 'error');
      }
    } catch (error) {
      console.error('Failed to grant reward:', error);
      showToast('Failed to grant reward', 'error');
    } finally {
      setIsGranting(false);
    }
  };

  const getDefaultAmount = (type: string) => {
    switch (type) {
      case 'extra_generations':
        return 50;
      case 'free_month':
        return 1;
      case 'storage_boost':
        return 5;
      default:
        return 50;
    }
  };

  const handleTypeChange = (newType: 'extra_generations' | 'free_month' | 'storage_boost') => {
    setRewardType(newType);
    setRewardAmount(getDefaultAmount(newType));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Grant Referral Reward
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            <XIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              User
            </label>
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Reward Type
            </label>
            <select
              value={rewardType}
              onChange={(e) => handleTypeChange(e.target.value as any)}
              className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
            >
              <option value="extra_generations">Extra AI Generations</option>
              <option value="free_month">Free Month(s)</option>
              <option value="storage_boost">Storage Boost (GB)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Amount
            </label>
            <input
              type="number"
              value={rewardAmount}
              onChange={(e) => setRewardAmount(parseFloat(e.target.value) || 0)}
              min="1"
              className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {rewardType === 'extra_generations' && 'Number of free AI caption generations'}
              {rewardType === 'free_month' && 'Number of free subscription months'}
              {rewardType === 'storage_boost' && 'Number of GB to add to storage limit'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Reason (Optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Special promotion, customer support, etc."
              rows={3}
              className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              disabled={isGranting}
              className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleGrant}
              disabled={isGranting || !rewardAmount || rewardAmount <= 0}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGranting ? 'Granting...' : 'Grant Reward'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
