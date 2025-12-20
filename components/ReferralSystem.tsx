import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { CheckCircleIcon, RocketIcon, UserIcon } from './icons/UIIcons';

// Temporary icons until added to UIIcons
const CopyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className || "w-5 h-5"} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const GiftIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className || "w-6 h-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
  </svg>
);
import { auth } from '../firebaseConfig';

export const ReferralSystem: React.FC = () => {
  const { user, showToast, setUser } = useAppContext();
  const [referralCode, setReferralCode] = useState<string>('');
  const [referralStats, setReferralStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [availableRewards, setAvailableRewards] = useState<ReferralReward[]>([]);
  const [nextMilestone, setNextMilestone] = useState<any>(null);
  const [isLoadingRewards, setIsLoadingRewards] = useState(false);

  useEffect(() => {
    if (user?.referralCode) {
      setReferralCode(user.referralCode);
    }
    if (user?.referralStats) {
      setReferralStats(user.referralStats);
    } else if (user?.id) {
      loadReferralStats();
      loadReferralRewards();
    }
  }, [user]);

  const loadReferralRewards = async () => {
    if (!user?.id) return;
    
    setIsLoadingRewards(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/getReferralRewards', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAvailableRewards(data.availableRewards || []);
          setNextMilestone(data.nextMilestone);
        }
      }
    } catch (error) {
      console.error('Failed to load referral rewards:', error);
    } finally {
      setIsLoadingRewards(false);
    }
  };

  const handleClaimReward = async (reward: ReferralReward) => {
    if (!reward.isEarned || reward.isClaimed) return;

    setIsLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/claimReferralReward', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          rewardType: reward.type,
          rewardAmount: reward.amount,
          milestone: reward.milestone,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showToast(data.message || 'Reward claimed successfully!', 'success');
        loadReferralRewards();
        loadReferralStats();
      } else {
        showToast(data.error || 'Failed to claim reward', 'error');
      }
    } catch (error) {
      console.error('Failed to claim reward:', error);
      showToast('Failed to claim reward', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const loadReferralStats = async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/getReferralStats', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setReferralStats(data.stats);
          setReferralCode(data.stats.referralCode);
          if (setUser) {
            setUser({
              ...user,
              referralCode: data.stats.referralCode,
              referralStats: data.stats,
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to load referral stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!referralCode) return;
    
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      showToast('Referral code copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      showToast('Failed to copy code', 'error');
    }
  };

  const handleShareLink = async () => {
    if (!referralCode) return;
    
    const shareUrl = `${window.location.origin}?ref=${referralCode}`;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Referral link copied to clipboard!', 'success');
    } catch (error) {
      showToast('Failed to copy link', 'error');
    }
  };

  const handleApplyReferral = async () => {
    if (!inputCode.trim()) {
      showToast('Please enter a referral code', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/createReferral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ referralCode: inputCode.toUpperCase() }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showToast(data.message || 'Referral code applied successfully!', 'success');
        setInputCode('');
        loadReferralStats();
      } else {
        showToast(data.error || 'Failed to apply referral code', 'error');
      }
    } catch (error) {
      console.error('Failed to apply referral:', error);
      showToast('Failed to apply referral code', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const referralLink = referralCode ? `${window.location.origin}?ref=${referralCode}` : '';

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
          <GiftIcon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Referral Program</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Invite friends and earn rewards</p>
        </div>
      </div>

      {/* Your Referral Code */}
      {referralCode && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Your Referral Code
          </label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <code className="text-lg font-bold text-primary-600 dark:text-primary-400 flex-1">
                {referralCode}
              </code>
              <button
                onClick={handleCopyCode}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                title="Copy code"
              >
                {copied ? (
                  <CheckCircleIcon className="w-5 h-5 text-green-500" />
                ) : (
                  <CopyIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                )}
              </button>
            </div>
            <button
              onClick={handleShareLink}
              className="px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
            >
              Copy Link
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Share this code or link with friends. When they sign up, you both get rewards!
          </p>
        </div>
      )}

      {/* Referral Stats */}
      {referralStats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <UserIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Referrals</span>
            </div>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {referralStats.totalReferrals || 0}
            </p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <RocketIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">Active</span>
            </div>
            <p className="text-2xl font-bold text-green-900 dark:text-green-100">
              {referralStats.activeReferrals || 0}
            </p>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-2">
              <GiftIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Rewards</span>
            </div>
            <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {referralStats.rewardsEarned || 0}
            </p>
          </div>
        </div>
      )}

      {/* Apply Referral Code */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Have a referral code? Enter it here
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            placeholder="Enter referral code"
            className="flex-1 px-4 py-3 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            disabled={isLoading}
          />
          <button
            onClick={handleApplyReferral}
            disabled={isLoading || !inputCode.trim()}
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>

      {/* Available Rewards */}
      {availableRewards.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Your Rewards</h3>
          <div className="space-y-3">
            {availableRewards.map((reward, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg border-2 ${
                  reward.isEarned && !reward.isClaimed
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-700'
                    : reward.isClaimed
                    ? 'border-gray-300 bg-gray-50 dark:bg-gray-700/50 dark:border-gray-600 opacity-60'
                    : 'border-gray-200 bg-gray-50 dark:bg-gray-700/30 dark:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {reward.milestone} Referral{reward.milestone > 1 ? 's' : ''}
                      </span>
                      {reward.isEarned && !reward.isClaimed && (
                        <span className="px-2 py-0.5 text-xs font-bold text-green-700 dark:text-green-300 bg-green-200 dark:bg-green-800 rounded-full">
                          Available
                        </span>
                      )}
                      {reward.isClaimed && (
                        <span className="px-2 py-0.5 text-xs font-bold text-gray-600 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 rounded-full">
                          Claimed
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{reward.description}</p>
                  </div>
                  {reward.isEarned && !reward.isClaimed && (
                    <button
                      onClick={() => handleClaimReward(reward)}
                      disabled={isLoading}
                      className="ml-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      Claim
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {nextMilestone && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                🎯 Next Reward: {nextMilestone.referralsNeeded} more referral{nextMilestone.referralsNeeded > 1 ? 's' : ''} to unlock {nextMilestone.reward.description}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Rewards Info */}
      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">How it works:</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <li>• Share your referral code or link with friends</li>
          <li>• When they sign up using your code, you both get rewards</li>
          <li>• Earn rewards at milestones: 1, 3, 5, 10, and 20 referrals</li>
          <li>• Rewards include free months, extra AI generations, and storage boosts</li>
          <li>• Claim your rewards when you reach each milestone</li>
        </ul>
      </div>
    </div>
  );
};
