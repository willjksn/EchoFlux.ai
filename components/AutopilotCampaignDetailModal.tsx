import React, { useState, useMemo } from 'react';
import { AutopilotCampaign, Post, Platform } from '../types';
import { XMarkIcon, CalendarIcon, CheckCircleIcon, SparklesIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { generateMockPerformance } from '../src/services/campaignPerformanceService';
import { useAppContext } from './AppContext';

interface AutopilotCampaignDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: AutopilotCampaign | null;
  posts: Post[];
  onNavigateToPost?: (postId: string) => void;
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

export const AutopilotCampaignDetailModal: React.FC<AutopilotCampaignDetailModalProps> = ({
  isOpen,
  onClose,
  campaign,
  posts,
  onNavigateToPost,
}) => {
  const { user } = useAppContext();
  const [activeTab, setActiveTab] = useState<'plan' | 'posts' | 'performance'>('plan');
  
  // Calculate performance metrics
  const performance = useMemo(() => {
    if (!campaign) return null;
    return generateMockPerformance(campaign, posts);
  }, [campaign, posts]);
  
  const isBusiness = user?.userType === 'Business';

  if (!isOpen || !campaign) return null;

  // Filter posts that belong to this campaign
  const campaignPosts = posts.filter(p => 
    p.id.includes(campaign.id) || 
    (p as any).campaignId === campaign.id ||
    p.content?.includes(campaign.goal?.substring(0, 20) || '')
  );

  const plan = campaign.plan;
  const hasPlan = plan && plan.weeks && plan.weeks.length > 0;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full my-8 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-primary-600 to-purple-600 p-6 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
          >
            <XMarkIcon />
          </button>
          <div className="pr-12">
            <h2 className="text-2xl font-bold mb-2">{campaign.goal}</h2>
            <div className="flex flex-wrap gap-4 text-sm text-white/90">
              <span>Niche: {campaign.niche}</span>
              <span>•</span>
              <span>Audience: {campaign.audience}</span>
              <span>•</span>
              <span>Status: {campaign.status}</span>
              {campaign.createdAt && (
                <>
                  <span>•</span>
                  <span>Created: {new Date(campaign.createdAt).toLocaleDateString()}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex gap-1 px-6">
            <button
              onClick={() => setActiveTab('plan')}
              className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === 'plan'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <CalendarIcon />
                Campaign Plan
              </div>
            </button>
            <button
              onClick={() => setActiveTab('posts')}
              className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 relative ${
                activeTab === 'posts'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircleIcon />
                Generated Posts
                {campaignPosts.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 text-xs bg-primary-500 text-white rounded-full">
                    {campaignPosts.length}
                  </span>
                )}
              </div>
            </button>
            {campaign.status === 'Complete' && performance && (
              <button
                onClick={() => setActiveTab('performance')}
                className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                  activeTab === 'performance'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <SparklesIcon />
                  Performance
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'plan' ? (
            <div className="space-y-6">
              {hasPlan ? (
                <>
                  {/* Overview */}
                  {plan.overview && (
                    <div className="bg-gradient-to-br from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20 p-5 rounded-xl border border-primary-200 dark:border-primary-800">
                      <h3 className="font-semibold text-primary-900 dark:text-primary-100 mb-2 flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5" />
                        Campaign Overview
                      </h3>
                      <p className="text-gray-700 dark:text-gray-300">{plan.overview}</p>
                    </div>
                  )}

                  {/* Weekly Plan */}
                  {plan.weeks.map((week: any, weekIndex: number) => {
                    const weekNum = week.week || week.weekNumber || weekIndex + 1;
                    const focus = week.focus || week.theme || 'Content Focus';
                    const days = week.days || week.content || [];

                    return (
                      <div
                        key={weekIndex}
                        className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
                      >
                        <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                              Week {weekNum}
                            </h3>
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {focus}
                            </span>
                          </div>
                        </div>

                        <div className="p-4 space-y-3">
                          {days.length > 0 ? (
                            days.map((day: any, dayIndex: number) => {
                              const dayName = day.day || `Day ${day.dayOffset || dayIndex + 1}`;
                              const platforms = day.platforms || (day.platform ? [day.platform] : ['Instagram']);
                              const postType = day.postType || day.format || 'Post';
                              const postIdea = day.postIdea || day.topic || 'Content idea';

                              return (
                                <div
                                  key={dayIndex}
                                  className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-3 mb-2">
                                        <span className="font-bold text-sm text-primary-600 dark:text-primary-400">
                                          {dayName}
                                        </span>
                                        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                                          {postType}
                                        </span>
                                        <div className="flex items-center gap-1">
                                          {platforms.map((platform: Platform) => (
                                            <span key={platform} className="text-gray-600 dark:text-gray-400">
                                              {platformIcons[platform]}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                      <p className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-1">
                                        {postIdea}
                                      </p>
                                      {day.angle && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400 italic mb-1">
                                          {day.angle}
                                        </p>
                                      )}
                                      {day.cta && (
                                        <p className="text-xs text-primary-600 dark:text-primary-400 font-medium">
                                          CTA: {day.cta}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                              No content planned for this week
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="text-center py-12">
                  <CalendarIcon className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    Campaign plan not available yet. It will appear once the plan is generated.
                  </p>
                </div>
              )}
            </div>
          ) : activeTab === 'performance' && performance ? (
            <div className="space-y-6">
              {/* Performance Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20 p-5 rounded-xl border border-primary-200 dark:border-primary-800">
                  <div className="text-sm text-primary-700 dark:text-primary-300 font-medium mb-1">Total Engagement</div>
                  <div className="text-3xl font-bold text-primary-900 dark:text-primary-100">
                    {performance.totalEngagement.toLocaleString()}
                  </div>
                  <div className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                    {performance.averageEngagementPerPost} avg per post
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 p-5 rounded-xl border border-blue-200 dark:border-blue-800">
                  <div className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">Total Views</div>
                  <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                    {performance.totalViews.toLocaleString()}
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {performance.averageViewsPerPost.toLocaleString()} avg per post
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-5 rounded-xl border border-green-200 dark:border-green-800">
                  <div className="text-sm text-green-700 dark:text-green-300 font-medium mb-1">Engagement Rate</div>
                  <div className="text-3xl font-bold text-green-900 dark:text-green-100">
                    {performance.engagementRate}%
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                    {performance.estimatedReach ? `of ${performance.estimatedReach.toLocaleString()} reach` : 'Calculating...'}
                  </div>
                </div>
              </div>

              {/* Detailed Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Likes</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white">
                    {performance.totalLikes.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Comments</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white">
                    {performance.totalComments.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Shares</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white">
                    {performance.totalShares.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Published</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white">
                    {performance.postsPublished}
                  </div>
                </div>
              </div>

              {/* Business Metrics */}
              {isBusiness && (performance.estimatedROI !== undefined || performance.newLeads !== undefined) && (
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 p-6 rounded-xl border border-purple-200 dark:border-purple-800">
                  <h4 className="font-bold text-purple-900 dark:text-purple-100 mb-4 flex items-center gap-2">
                    <SparklesIcon className="w-5 h-5" />
                    Business Impact
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {performance.estimatedROI !== undefined && (
                      <div>
                        <div className="text-sm text-purple-700 dark:text-purple-300 font-medium mb-1">Estimated ROI</div>
                        <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                          {performance.estimatedROI.toFixed(1)}%
                        </div>
                      </div>
                    )}
                    {performance.newLeads !== undefined && (
                      <div>
                        <div className="text-sm text-purple-700 dark:text-purple-300 font-medium mb-1">New Leads Generated</div>
                        <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                          {performance.newLeads}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Creator Metrics */}
              {!isBusiness && performance.newFollowers !== undefined && (
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 p-6 rounded-xl border border-blue-200 dark:border-blue-800">
                  <h4 className="font-bold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
                    <SparklesIcon className="w-5 h-5" />
                    Growth Metrics
                  </h4>
                  <div>
                    <div className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">New Followers</div>
                    <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                      +{performance.newFollowers}
                    </div>
                  </div>
                </div>
              )}

              {/* Post Status Breakdown */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <h4 className="font-bold text-gray-900 dark:text-white mb-4">Post Status Breakdown</h4>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Published</span>
                      <span className="font-bold text-gray-900 dark:text-white">{performance.postsPublished}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full" 
                        style={{ width: `${(performance.postsPublished / campaign.totalPosts) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Scheduled</span>
                      <span className="font-bold text-gray-900 dark:text-white">{performance.postsScheduled}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full" 
                        style={{ width: `${(performance.postsScheduled / campaign.totalPosts) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Draft</span>
                      <span className="font-bold text-gray-900 dark:text-white">{performance.postsDraft}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-gray-400 h-2 rounded-full" 
                        style={{ width: `${(performance.postsDraft / campaign.totalPosts) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {campaignPosts.length > 0 ? (
                campaignPosts.map((post) => (
                  <div
                    key={post.id}
                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:border-primary-300 dark:hover:border-primary-700 transition-all cursor-pointer"
                    onClick={() => {
                      if (onNavigateToPost) {
                        onNavigateToPost(post.id);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          {post.platforms.map((platform) => (
                            <span key={platform} className="text-gray-600 dark:text-gray-400">
                              {platformIcons[platform]}
                            </span>
                          ))}
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded ${
                              post.status === 'Approved'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : post.status === 'Scheduled'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                : post.status === 'In Review'
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {post.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                          {post.content}
                        </p>
                        {post.scheduledDate && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Scheduled: {new Date(post.scheduledDate).toLocaleString()}
                          </p>
                        )}
                      </div>
                      {post.mediaUrl && (
                        <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                          {post.mediaType === 'video' ? (
                            <video
                              src={post.mediaUrl}
                              className="w-full h-full object-cover"
                              muted
                            />
                          ) : (
                            <img
                              src={post.mediaUrl}
                              alt="Post media"
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <CheckCircleIcon className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 mb-2">
                    No posts generated yet
                  </p>
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    Posts will appear here once the campaign completes content generation
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">
                {campaign.generatedPosts || 0} / {campaign.totalPosts || 0} posts generated
              </span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

