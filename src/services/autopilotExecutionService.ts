// src/services/autopilotExecutionService.ts
// Service to execute Autopilot campaigns by generating content from plans

import { generateCaptions, generateImage, generateVideo } from './geminiService';
import { calculateSmartScheduledDate } from './smartSchedulingService';
import type { AutopilotCampaign, ApprovalItem, CalendarEvent, Platform, AnalyticsData } from '../../types';

export interface GeneratedPost {
  id: string;
  caption: string;
  hashtags: string[];
  platforms: Platform[];
  postType: string;
  scheduledDate?: string;
  imageUrl?: string;
  videoUrl?: string;
  campaignId: string;
  week: number;
  day: string;
}

/**
 * Execute an Autopilot campaign by generating content from the plan
 */
export async function executeAutopilotCampaign(
  campaign: AutopilotCampaign,
  userSettings: any,
  onProgress?: (current: number, total: number) => void | Promise<void>,
  analytics?: AnalyticsData | null
): Promise<{ posts: GeneratedPost[]; approvalItems: ApprovalItem[]; calendarEvents: CalendarEvent[] }> {
  if (!campaign.plan || !campaign.plan.weeks) {
    throw new Error('Campaign plan is missing or invalid');
  }

  const posts: GeneratedPost[] = [];
  const approvalItems: ApprovalItem[] = [];
  const calendarEvents: CalendarEvent[] = [];

  const plan = campaign.plan;
  const isBusiness = (userSettings as any)?.userType === 'Business';
  
  // Calculate total expected posts for progress tracking
  let totalExpectedPosts = 0;
  for (const week of plan.weeks) {
    const days = week.days || week.content || [];
    for (const dayPlan of days) {
      const platforms = dayPlan.platforms || (dayPlan.platform ? [dayPlan.platform] : ['Instagram']);
      totalExpectedPosts += platforms.length;
    }
  }

  let currentPostIndex = 0;

  // Iterate through each week in the plan
  for (const week of plan.weeks) {
    // Handle both week.days and week.content structures
    const days = week.days || week.content || [];
    if (!Array.isArray(days) || days.length === 0) continue;

    // Iterate through each day in the week
    for (const dayPlan of days) {
      // Handle both array and single platform
      const platforms = dayPlan.platforms || (dayPlan.platform ? [dayPlan.platform] : []);
      if (!Array.isArray(platforms) || platforms.length === 0) continue;

      try {
        // Determine if this post needs image or video
        const postType = dayPlan.postType || dayPlan.format || 'Feed Post';
        const needsImage = postType.toLowerCase().includes('image') || 
                          postType.toLowerCase().includes('photo') || 
                          postType.toLowerCase().includes('carousel') ||
                          postType.toLowerCase().includes('post');
        const needsVideo = postType.toLowerCase().includes('video') || 
                          postType.toLowerCase().includes('reel') || 
                          postType.toLowerCase().includes('short') ||
                          postType.toLowerCase().includes('story');

        // Generate caption based on the day's plan
        const captionResult = await generatePostCaption(
          dayPlan,
          campaign,
          userSettings
        );

        // Generate image if needed
        let imageUrl: string | undefined;
        if (needsImage && !needsVideo) {
          try {
            // Create image prompt from post idea
            const imagePrompt = dayPlan.postIdea || dayPlan.topic || captionResult.caption.substring(0, 100);
            const imageResult = await generateImage(imagePrompt, userSettings?.userBaseImage || undefined);
            
            // Handle different response formats
            if (typeof imageResult === 'string') {
              imageUrl = imageResult;
            } else if (imageResult && typeof imageResult === 'object') {
              imageUrl = (imageResult as any).imageUrl || (imageResult as any).url || (imageResult as any).data;
            }
            
            // If image generation returns a prompt instead of an image, skip for now
            // (This happens when the API is not fully connected)
            if (imageUrl && imageUrl.includes('note:')) {
              imageUrl = undefined;
            }
          } catch (imgError) {
            console.warn('Image generation failed, continuing without image:', imgError);
            // Continue without image - post will still have caption
          }
        }

        // Generate video if needed
        let videoUrl: string | undefined;
        if (needsVideo) {
          try {
            // Create video prompt from post idea
            const videoPrompt = dayPlan.postIdea || dayPlan.topic || captionResult.caption.substring(0, 100);
            const videoResult = await generateVideo(
              videoPrompt,
              userSettings?.userBaseImage || undefined,
              '9:16' // Default to vertical for social media
            );
            
            // Handle different response formats
            if (videoResult && typeof videoResult === 'object') {
              videoUrl = (videoResult as any).videoUrl || (videoResult as any).url || (videoResult as any).data;
              
              // Check if it's a job/operation ID that needs polling
              if ((videoResult as any).operationId || (videoResult as any).jobId) {
                // For now, we'll skip video generation if it requires async polling
                // This can be enhanced later with a polling mechanism
                console.log('Video generation requires async polling, skipping for now');
                videoUrl = undefined;
              }
            } else if (typeof videoResult === 'string') {
              videoUrl = videoResult;
            }
          } catch (vidError) {
            console.warn('Video generation failed, continuing without video:', vidError);
            // Continue without video - post will still have caption
          }
        }

        // Create a post ID
        const postId = `${campaign.id}-${week.week || week.weekNumber}-${dayPlan.day}-${Date.now()}`;

        // Determine platforms (already extracted above, convert to Platform type)
        const validPlatforms = platforms.filter((p: string) => 
          ['Instagram', 'TikTok', 'X', 'YouTube', 'Threads', 'LinkedIn', 'Facebook'].includes(p)
        ) as Platform[];

        // Determine day identifier (handle both day and dayOffset)
        const dayIdentifier = dayPlan.day || (dayPlan.dayOffset !== undefined ? getDayFromOffset(dayPlan.dayOffset) : 'Mon');

        // Create generated post
        const generatedPost: GeneratedPost = {
          id: postId,
          caption: captionResult.caption,
          hashtags: captionResult.hashtags || [],
          platforms: validPlatforms.length > 0 ? validPlatforms : ['Instagram'], // Default to Instagram
          postType: dayPlan.postType || dayPlan.format || 'Feed Post',
          week: week.week || week.weekNumber || 1,
          day: dayIdentifier,
          campaignId: campaign.id,
          imageUrl: imageUrl,
          videoUrl: videoUrl,
        };

        posts.push(generatedPost);

        // Calculate scheduled date using smart scheduling if analytics available, otherwise use basic scheduling
        const weekNumber = week.week || week.weekNumber || 1;
        const platform = validPlatforms[0]; // Use first platform for scheduling optimization
        
        const scheduledDate = analytics 
          ? calculateSmartScheduledDate(weekNumber, dayIdentifier, analytics, platform, {
              avoidClumping: true,
              minHoursBetween: 2,
              preferBusinessHours: userSettings?.userType === 'Business',
            })
          : calculateScheduledDate(weekNumber, dayIdentifier);

        // Create approval item for each platform
        for (const platform of generatedPost.platforms) {
          const approvalItem: ApprovalItem = {
            id: `${postId}-${platform}`,
            workflowId: campaign.id,
            generatedAt: new Date().toISOString(),
            type: getApprovalItemType(dayPlan.postType),
            content: {
              text: generatedPost.caption,
              hashtags: generatedPost.hashtags,
              imageUrl: generatedPost.imageUrl,
              videoUrl: generatedPost.videoUrl,
            },
          };

          // Store platform in approvalItem for post creation
          (approvalItem as any).platforms = [platform];
          (approvalItem as any).scheduledDate = scheduledDate;

          approvalItems.push(approvalItem);

          // Create calendar event
          const calendarEvent: CalendarEvent = {
            id: `${postId}-${platform}-calendar`,
            title: generatedPost.caption.substring(0, 50) + (generatedPost.caption.length > 50 ? '...' : ''),
            date: scheduledDate,
            type: dayPlan.postType?.includes('Reel') || dayPlan.postType?.includes('Video') || dayPlan.postType?.includes('Short') 
              ? 'Reel' 
              : dayPlan.postType?.includes('Story')
              ? 'Story'
              : 'Post',
            platform: platform,
            status: 'Draft',
          };

          calendarEvents.push(calendarEvent);
          
          // Update progress after each approval item
          currentPostIndex++;
          if (onProgress) {
            await onProgress(currentPostIndex, totalExpectedPosts);
          }
        }

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`Failed to generate post for ${dayPlan.day}:`, error);
        // Continue with other posts even if one fails
      }
    }
  }

  return { posts, approvalItems, calendarEvents };
}

/**
 * Generate a caption for a post based on the day plan
 */
async function generatePostCaption(
  dayPlan: any,
  campaign: AutopilotCampaign,
  userSettings: any
): Promise<{ caption: string; hashtags: string[] }> {
  // Use the aiCaptionPrompt from the plan if available
  const promptText = dayPlan.aiCaptionPrompt || dayPlan.postIdea || '';
  const goal = campaign.goal || '';
  const tone = userSettings?.aiPersonality?.tone || 'friendly';
  
  // Generate caption using the caption generation API
  const captions = await generateCaptions({
    goal: goal,
    tone: tone,
    promptText: promptText,
    mediaUrl: null,
    mediaData: null,
  });

  // Extract first caption result
  let captionResult = { caption: '', hashtags: [] };
  
  if (Array.isArray(captions) && captions.length > 0) {
    const first = captions[0];
    captionResult = {
      caption: first.caption || '',
      hashtags: first.hashtags || [],
    };
  } else if (captions && typeof captions === 'object') {
    captionResult = {
      caption: (captions as any).caption || promptText,
      hashtags: (captions as any).hashtags || [],
    };
  } else {
    // Fallback
    captionResult = {
      caption: promptText || `Content about ${dayPlan.postIdea || 'your campaign'}`,
      hashtags: [],
    };
  }

  return captionResult;
}

/**
 * Convert post type to approval item type
 */
function getApprovalItemType(postType: string): 'Caption' | 'Image' | 'Video' {
  const lower = postType.toLowerCase();
  if (lower.includes('video') || lower.includes('reel') || lower.includes('short')) {
    return 'Video';
  }
  if (lower.includes('image') || lower.includes('photo') || lower.includes('carousel')) {
    return 'Image';
  }
  return 'Caption';
}

/**
 * Convert day offset (0-6) to day name
 */
function getDayFromOffset(dayOffset: number): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[dayOffset % 7] || 'Mon';
}

/**
 * Calculate scheduled date based on week and day
 */
function calculateScheduledDate(week: number, day: string): string {
  const now = new Date();
  
  // Calculate date: start from today, move forward by (week - 1) weeks, then find the day
  const daysOfWeek: Record<string, number> = {
    'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 
    'Fri': 5, 'Sat': 6, 'Sun': 0
  };

  const targetDay = daysOfWeek[day] ?? 1;
  const weeksOffset = (week - 1) * 7;
  
  // Start from next week if week 1, or calculate weeks forward
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() + weeksOffset);
  
  // Find the next occurrence of the target day
  const currentDay = startDate.getDay();
  const daysToAdd = (targetDay - currentDay + 7) % 7 || 7;
  startDate.setDate(startDate.getDate() + daysToAdd);
  
  // Set to a reasonable time (e.g., 9 AM)
  startDate.setHours(9, 0, 0, 0);
  
  return startDate.toISOString();
}

