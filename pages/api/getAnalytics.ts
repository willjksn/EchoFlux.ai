import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from './verifyAuth.js';
import { getAdminApp } from './_firebaseAdmin.js';

interface DateRange {
  startDate: Date;
  endDate: Date;
}

function getDateRange(range: '7d' | '30d' | '90d'): DateRange {
  const endDate = new Date();
  const startDate = new Date();
  
  switch (range) {
    case '7d':
      startDate.setDate(endDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(endDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(endDate.getDate() - 90);
      break;
  }
  
  return { startDate, endDate };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    let authUser;
    try {
      authUser = await verifyAuth(req);
    } catch (authError: any) {
      console.error('Auth verification error:', authError);
      return res.status(401).json({ error: 'Unauthorized', details: authError?.message });
    }

    if (!authUser || !authUser.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = authUser.uid;
    const { dateRange = '30d', platform = 'All' } = req.body || {};
    const { startDate, endDate } = getDateRange(dateRange);

    // Initialize Firebase Admin
    let adminApp;
    let db;
    try {
      adminApp = getAdminApp();
      db = adminApp.firestore();
    } catch (firebaseError: any) {
      console.error('Firebase Admin initialization error:', firebaseError);
      return res.status(500).json({
        error: 'Firebase initialization failed',
        details: firebaseError?.message || String(firebaseError)
      });
    }

    // Fetch posts in date range
    let allPosts: any[] = [];
    try {
      const postsRef = db.collection('users').doc(userId).collection('posts');
      
      // Fetch all posts and filter by date range (Firestore Admin SDK doesn't support range queries easily)
      const postsSnapshot = await postsRef.get();
      allPosts = postsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (postsError: any) {
      console.error('Error fetching posts:', postsError);
      // Continue with empty array if posts collection doesn't exist or has errors
      allPosts = [];
    }
    
    // Filter by date range (handle Firestore Timestamps)
    const posts = allPosts.filter((p: any) => {
      try {
        let postDate = p.createdAt || p.scheduledDate || p.timestamp;
        if (!postDate) return false;
        
        // Handle Firestore Timestamp objects
        if (postDate && typeof postDate === 'object' && postDate.toDate) {
          postDate = postDate.toDate();
        } else if (postDate && typeof postDate === 'object' && postDate.seconds) {
          postDate = new Date(postDate.seconds * 1000);
        }
        
        const date = new Date(postDate);
        if (isNaN(date.getTime())) return false; // Invalid date
        
        return date >= startDate && date <= endDate;
      } catch {
        return false; // Skip posts with invalid dates
      }
    });

    // Filter by platform if specified
    const filteredPosts = platform === 'All' 
      ? posts 
      : posts.filter((p: any) => p.platforms?.includes(platform));

    // Fetch messages in date range
    let allMessages: any[] = [];
    try {
      const messagesRef = db.collection('users').doc(userId).collection('messages');
      const messagesSnapshot = await messagesRef.get();
      allMessages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (messagesError: any) {
      console.error('Error fetching messages:', messagesError);
      // Continue with empty array if messages collection doesn't exist or has errors
      allMessages = [];
    }
    
    // Filter by date range (handle Firestore Timestamps)
    const messages = allMessages.filter((m: any) => {
      try {
        let msgDate = m.timestamp || m.createdAt;
        if (!msgDate) return false;
        
        // Handle Firestore Timestamp objects
        if (msgDate && typeof msgDate === 'object' && msgDate.toDate) {
          msgDate = msgDate.toDate();
        } else if (msgDate && typeof msgDate === 'object' && msgDate.seconds) {
          msgDate = new Date(msgDate.seconds * 1000);
        }
        
        const date = new Date(msgDate);
        if (isNaN(date.getTime())) return false; // Invalid date
        
        return date >= startDate && date <= endDate;
      } catch {
        return false; // Skip messages with invalid dates
      }
    });

    // Calculate response rate (daily)
    const responseRateByDay: { [key: string]: { responded: number; total: number } } = {};
    messages.forEach((msg: any) => {
      try {
        let msgDate = msg.timestamp || msg.createdAt;
        if (!msgDate) return;
        
        // Handle Firestore Timestamp objects
        if (msgDate && typeof msgDate === 'object' && msgDate.toDate) {
          msgDate = msgDate.toDate();
        } else if (msgDate && typeof msgDate === 'object' && msgDate.seconds) {
          msgDate = new Date(msgDate.seconds * 1000);
        }
        
        const date = new Date(msgDate);
        if (isNaN(date.getTime())) return; // Skip invalid dates
        
        const dateKey = date.toISOString().split('T')[0];
        if (!responseRateByDay[dateKey]) {
          responseRateByDay[dateKey] = { responded: 0, total: 0 };
        }
        responseRateByDay[dateKey].total++;
        if (msg.isArchived || msg.status === 'replied') {
          responseRateByDay[dateKey].responded++;
        }
      } catch {
        // Skip messages with date parsing errors
      }
    });

    const responseRate = Object.keys(responseRateByDay)
      .sort()
      .map(date => ({
        name: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: responseRateByDay[date].total > 0
          ? Math.round((responseRateByDay[date].responded / responseRateByDay[date].total) * 100)
          : 0
      }));

    // Calculate follower growth (weekly based on posts)
    const followerGrowthByWeek: { [key: string]: number } = {};
    filteredPosts.forEach((post: any) => {
      try {
        let postDate = post.createdAt || post.scheduledDate || post.timestamp;
        if (!postDate) return;
        
        // Handle Firestore Timestamp objects
        if (postDate && typeof postDate === 'object' && postDate.toDate) {
          postDate = postDate.toDate();
        } else if (postDate && typeof postDate === 'object' && postDate.seconds) {
          postDate = new Date(postDate.seconds * 1000);
        }
        
        const date = new Date(postDate);
        if (isNaN(date.getTime())) return; // Skip invalid dates
        
        const weekNumber = Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 0).getDay()) / 7);
        const weekKey = `${date.getFullYear()}-W${weekNumber}`;
        
        // Estimate followers gained from engagement (mock calculation for now)
        const engagement = (post.likes || 0) + (post.comments?.length || 0) * 2;
        const estimatedFollowers = Math.floor(engagement * 0.05); // Rough estimate
        
        followerGrowthByWeek[weekKey] = (followerGrowthByWeek[weekKey] || 0) + estimatedFollowers;
      } catch {
        // Skip posts with date parsing errors
      }
    });

    const followerGrowth = Object.keys(followerGrowthByWeek)
      .sort()
      .slice(-8) // Last 8 weeks
      .map(week => ({
        name: `Week ${week.split('-W')[1]}`,
        value: followerGrowthByWeek[week]
      }));

    // Calculate sentiment distribution
    const sentimentCounts: { [key: string]: number } = { Positive: 0, Neutral: 0, Negative: 0 };
    messages.forEach((msg: any) => {
      const sentiment = msg.sentiment || 'Neutral';
      sentimentCounts[sentiment] = (sentimentCounts[sentiment] || 0) + 1;
    });

    const sentiment = Object.keys(sentimentCounts).map(name => ({
      name,
      value: sentimentCounts[name]
    }));

    // Calculate total replies
    const totalReplies = messages.filter((m: any) => m.isArchived || m.status === 'replied').length;

    // Calculate new followers (estimate from engagement)
    const totalEngagement = filteredPosts.reduce((sum: number, p: any) => {
      return sum + (p.likes || 0) + (p.comments?.length || 0) * 2;
    }, 0);
    const newFollowers = Math.floor(totalEngagement * 0.05);

    // Calculate engagement increase (percentage)
    const currentPeriodEngagement = filteredPosts.reduce((sum: number, p: any) => {
      return sum + (p.likes || 0) + (p.comments?.length || 0) * 2;
    }, 0);

    // Compare with previous period (mock for now - in production, fetch previous period)
    const engagementIncrease = 15; // Mock - would calculate from previous period

    // Extract top topics from post content and messages
    const allContent = [
      ...filteredPosts.map((p: any) => p.content || ''),
      ...messages.map((m: any) => m.content || '')
    ].join(' ');

    // Simple topic extraction (in production, use NLP/AI)
    const topics = extractTopics(allContent);
    const topTopics = topics.slice(0, 5);

    // Generate suggested FAQs from message content
    const suggestedFaqs = messages
      .filter((m: any) => m.type === 'Question' || m.content?.includes('?'))
      .map((m: any) => m.content?.substring(0, 60) + '...')
      .slice(0, 3);

    // Generate engagement insights
    const engagementInsights = [];
    if (filteredPosts.length > 0) {
      const avgEngagement = currentPeriodEngagement / filteredPosts.length;
      if (avgEngagement > 100) {
        engagementInsights.push({
          icon: 'idea' as const,
          title: 'High Engagement Rate',
          description: `Your posts are performing well with an average of ${Math.round(avgEngagement)} engagements per post.`
        });
      }
    }

    const analyticsData = {
      responseRate: responseRate || [],
      followerGrowth: followerGrowth || [],
      sentiment: sentiment || [],
      totalReplies: totalReplies || 0,
      newFollowers: newFollowers || 0,
      engagementIncrease: engagementIncrease || 0,
      topTopics: topTopics || [],
      suggestedFaqs: suggestedFaqs || [],
      engagementInsights: engagementInsights || []
    };

    return res.status(200).json(analyticsData);
  } catch (error: any) {
    console.error('getAnalytics error:', error);
    console.error('Error stack:', error?.stack);
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    // Return detailed error information - always return valid JSON
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    const errorStack = error?.stack || 'No stack trace';
    
    // Return empty analytics data structure instead of error so page can still load
    const emptyAnalyticsData = {
      responseRate: [],
      followerGrowth: [],
      sentiment: [],
      totalReplies: 0,
      newFollowers: 0,
      engagementIncrease: 0,
      topTopics: [],
      suggestedFaqs: [],
      engagementInsights: []
    };
    
    // Log the error but return empty data so UI doesn't break
    console.warn('Returning empty analytics data due to error:', errorMessage);
    return res.status(200).json(emptyAnalyticsData);
  }
}

// Simple topic extraction (in production, use proper NLP)
function extractTopics(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const wordCounts: { [key: string]: number } = {};
  
  words.forEach(word => {
    if (!['this', 'that', 'with', 'from', 'your', 'have', 'been', 'will', 'what', 'when', 'where', 'they', 'their'].includes(word)) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  });

  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
}

