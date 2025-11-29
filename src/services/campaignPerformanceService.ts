// src/services/campaignPerformanceService.ts
// Service to calculate and track campaign performance metrics

import type { Post, AutopilotCampaign, CampaignPerformance } from '../../types';

/**
 * Calculate performance metrics for a campaign based on its posts
 */
export function calculateCampaignPerformance(
  campaign: AutopilotCampaign,
  posts: Post[]
): CampaignPerformance {
  // Filter posts that belong to this campaign
  const campaignPosts = posts.filter(p => 
    p.id.includes(campaign.id) || 
    (p as any).campaignId === campaign.id
  );

  // Initialize metrics
  let totalEngagement = 0;
  let totalViews = 0;
  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;
  let postsPublished = 0;
  let postsScheduled = 0;
  let postsDraft = 0;
  let estimatedReach = 0;

  // Calculate metrics from posts
  campaignPosts.forEach(post => {
    // Get engagement metrics from post (if available)
    const engagement = (post as any).engagement || 0;
    const views = (post as any).views || 0;
    const likes = (post as any).likes || 0;
    const comments = post.comments?.length || 0;
    const shares = (post as any).shares || 0;
    const reach = (post as any).reach || 0;

    totalEngagement += engagement || (likes + comments + shares);
    totalViews += views;
    totalLikes += likes;
    totalComments += comments;
    totalShares += shares;
    estimatedReach += reach;

    // Count posts by status
    if (post.status === 'Published' || post.status === 'Scheduled') {
      if (post.status === 'Published') {
        postsPublished++;
      } else {
        postsScheduled++;
      }
    } else {
      postsDraft++;
    }
  });

  // Calculate averages
  const totalPostsWithMetrics = campaignPosts.filter(p => 
    (p as any).engagement !== undefined || 
    (p as any).views !== undefined ||
    p.status === 'Published'
  ).length;

  const averageEngagementPerPost = totalPostsWithMetrics > 0 
    ? totalEngagement / totalPostsWithMetrics 
    : 0;

  const averageViewsPerPost = totalPostsWithMetrics > 0
    ? totalViews / totalPostsWithMetrics
    : 0;

  // Calculate engagement rate (engagement / reach * 100)
  const engagementRate = estimatedReach > 0
    ? (totalEngagement / estimatedReach) * 100
    : 0;

  // For business users: estimate ROI (simplified calculation)
  // This would typically come from actual conversion data
  const estimatedROI = campaign.performance?.estimatedROI || undefined;

  // For creator users: estimate new followers
  // This would typically come from analytics integration
  const newFollowers = campaign.performance?.newFollowers || undefined;

  // For business users: estimate new leads
  // This would typically come from CRM integration
  const newLeads = campaign.performance?.newLeads || undefined;

  return {
    totalEngagement,
    totalViews,
    totalLikes,
    totalComments,
    totalShares,
    averageEngagementPerPost: Math.round(averageEngagementPerPost * 10) / 10,
    averageViewsPerPost: Math.round(averageViewsPerPost * 10) / 10,
    engagementRate: Math.round(engagementRate * 10) / 10,
    postsPublished,
    postsScheduled,
    postsDraft,
    estimatedReach: estimatedReach > 0 ? estimatedReach : undefined,
    estimatedROI,
    newFollowers,
    newLeads,
  };
}

/**
 * Generate mock performance data for demonstration
 * In production, this would come from actual analytics APIs
 */
export function generateMockPerformance(
  campaign: AutopilotCampaign,
  posts: Post[]
): CampaignPerformance {
  const basePerformance = calculateCampaignPerformance(campaign, posts);
  
  // Add mock data if no real data exists
  if (basePerformance.totalEngagement === 0 && posts.length > 0) {
    const publishedCount = basePerformance.postsPublished || posts.length;
    
    // Generate realistic mock metrics
    const mockEngagement = publishedCount * (50 + Math.random() * 200);
    const mockViews = publishedCount * (500 + Math.random() * 1500);
    const mockLikes = Math.floor(mockEngagement * 0.6);
    const mockComments = Math.floor(mockEngagement * 0.2);
    const mockShares = Math.floor(mockEngagement * 0.2);
    const mockReach = mockViews * (1.2 + Math.random() * 0.5);

    return {
      ...basePerformance,
      totalEngagement: Math.floor(mockEngagement),
      totalViews: Math.floor(mockViews),
      totalLikes: mockLikes,
      totalComments: mockComments,
      totalShares: mockShares,
      averageEngagementPerPost: Math.round((mockEngagement / publishedCount) * 10) / 10,
      averageViewsPerPost: Math.round((mockViews / publishedCount) * 10) / 10,
      engagementRate: Math.round((mockEngagement / mockReach) * 100 * 10) / 10,
      estimatedReach: Math.floor(mockReach),
      // Business metrics
      estimatedROI: campaign.performance?.estimatedROI || (Math.random() * 300 + 50), // 50-350% ROI
      newLeads: campaign.performance?.newLeads || Math.floor(publishedCount * (2 + Math.random() * 8)),
      // Creator metrics
      newFollowers: campaign.performance?.newFollowers || Math.floor(publishedCount * (5 + Math.random() * 15)),
    };
  }

  return basePerformance;
}

