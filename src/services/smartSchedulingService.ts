// src/services/smartSchedulingService.ts
// Service to intelligently schedule posts based on analytics data

import type { AnalyticsData, Platform } from '../../types';

export interface OptimalPostingTime {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  hour: number; // 0-23
  minute: number; // 0-59
}

export interface SmartScheduleOptions {
  platform?: Platform;
  avoidClumping?: boolean; // Don't schedule posts too close together
  minHoursBetween?: number; // Minimum hours between posts (default: 2)
  preferBusinessHours?: boolean; // Prefer 9 AM - 5 PM
}

/**
 * Analyze analytics data to find optimal posting times
 */
export function analyzeOptimalPostingTimes(
  analytics: AnalyticsData | null,
  options: SmartScheduleOptions = {}
): OptimalPostingTime[] {
  const {
    preferBusinessHours = true,
  } = options;

  const optimalTimes: OptimalPostingTime[] = [];

  // Extract best days from responseRate data
  const bestDays: number[] = [];
  if (analytics?.responseRate && analytics.responseRate.length > 0) {
    const sortedDays = [...analytics.responseRate]
      .sort((a, b) => b.value - a.value)
      .slice(0, 4); // Top 4 days

    const dayMap: Record<string, number> = {
      'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3,
      'Thu': 4, 'Fri': 5, 'Sat': 6
    };

    for (const day of sortedDays) {
      const dayNum = dayMap[day.name];
      if (dayNum !== undefined) {
        bestDays.push(dayNum);
      }
    }
  }

  // If no analytics data, use defaults (Mon-Fri, business hours)
  if (bestDays.length === 0) {
    bestDays.push(1, 2, 3, 4, 5); // Mon-Fri
  }

  // Extract optimal hours from engagementInsights
  const optimalHours: number[] = [];
  if (analytics?.engagementInsights) {
    for (const insight of analytics.engagementInsights) {
      // Look for "Post at [time]" patterns
      const timeMatch = insight.description.match(/(\d{1,2})\s*(AM|PM)/i);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        const period = timeMatch[2].toUpperCase();
        
        if (period === 'PM' && hour !== 12) {
          hour += 12;
        } else if (period === 'AM' && hour === 12) {
          hour = 0;
        }
        
        optimalHours.push(hour);
      }
    }
  }

  // Default optimal hours if none found
  if (optimalHours.length === 0) {
    if (preferBusinessHours) {
      // Business hours: 9 AM, 12 PM, 3 PM
      optimalHours.push(9, 12, 15);
    } else {
      // Peak engagement times: 8 AM, 12 PM, 6 PM, 9 PM
      optimalHours.push(8, 12, 18, 21);
    }
  }

  // Generate optimal posting times for each best day
  for (const day of bestDays) {
    for (const hour of optimalHours) {
      optimalTimes.push({
        dayOfWeek: day,
        hour: hour,
        minute: Math.floor(Math.random() * 30), // Randomize minutes to avoid exact duplicates
      });
    }
  }

  // Sort by day and hour
  optimalTimes.sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) {
      return a.dayOfWeek - b.dayOfWeek;
    }
    return a.hour - b.hour;
  });

  return optimalTimes;
}

/**
 * Calculate smart scheduled date based on week, day, and optimal posting times
 */
export function calculateSmartScheduledDate(
  week: number,
  dayIdentifier: string,
  analytics: AnalyticsData | null,
  platform?: Platform,
  options: SmartScheduleOptions = {}
): string {
  const {
    avoidClumping = true,
    minHoursBetween = 2,
  } = options;

  const now = new Date();
  
  // Map day names to numbers
  const dayMap: Record<string, number> = {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3,
    'Thu': 4, 'Fri': 5, 'Sat': 6
  };

  const targetDayName = dayIdentifier.substring(0, 3); // "Mon", "Tue", etc.
  const targetDayOfWeek = dayMap[targetDayName] ?? 1; // Default to Monday

  // Calculate base date (week number * 7 days from now)
  const weeksOffset = (week - 1) * 7;
  const baseDate = new Date(now);
  baseDate.setDate(baseDate.getDate() + weeksOffset);

  // Find the target day in that week
  const currentDay = baseDate.getDay();
  const daysToAdd = (targetDayOfWeek - currentDay + 7) % 7;
  if (daysToAdd === 0 && currentDay === targetDayOfWeek) {
    // Already on target day, move to next week's occurrence
    baseDate.setDate(baseDate.getDate() + 7);
  } else {
    baseDate.setDate(baseDate.getDate() + daysToAdd);
  }

  // Get optimal posting times for this platform/day
  const optimalTimes = analyzeOptimalPostingTimes(analytics, {
    ...options,
    platform,
  });

  // Find best time for this specific day
  const dayOptimalTimes = optimalTimes.filter(t => t.dayOfWeek === targetDayOfWeek);
  
  let scheduledDate: Date;
  
  if (dayOptimalTimes.length > 0) {
    // Use the first optimal time for this day
    const optimalTime = dayOptimalTimes[0];
    scheduledDate = new Date(baseDate);
    scheduledDate.setHours(optimalTime.hour, optimalTime.minute, 0, 0);
  } else {
    // Fallback: Use default business hours time
    scheduledDate = new Date(baseDate);
    scheduledDate.setHours(10, 0, 0, 0); // 10 AM default
  }

  // Ensure date is in the future
  if (scheduledDate < now) {
    scheduledDate.setDate(scheduledDate.getDate() + 7);
  }

  return scheduledDate.toISOString();
}

/**
 * Schedule multiple posts intelligently, avoiding clumping
 */
export function scheduleMultiplePosts(
  count: number,
  startWeek: number,
  analytics: AnalyticsData | null,
  platform?: Platform,
  options: SmartScheduleOptions = {}
): string[] {
  const {
    avoidClumping = true,
    minHoursBetween = 2,
  } = options;

  const scheduledDates: string[] = [];
  const optimalTimes = analyzeOptimalPostingTimes(analytics, {
    ...options,
    platform,
  });

  if (optimalTimes.length === 0) {
    // Fallback: Even distribution across weeks
    for (let i = 0; i < count; i++) {
      const week = startWeek + Math.floor(i / 3); // 3 posts per week
      const day = i % 3; // Mon, Wed, Fri
      const dayNames = ['Mon', 'Wed', 'Fri'];
      scheduledDates.push(
        calculateSmartScheduledDate(week, dayNames[day], analytics, platform, options)
      );
    }
    return scheduledDates;
  }

  // Use optimal times, ensuring we don't clump posts too close
  let currentWeek = startWeek;
  let timeIndex = 0;
  const usedTimes: Date[] = [];

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let scheduledDate: Date;

    while (attempts < optimalTimes.length * 2) {
      const optimalTime = optimalTimes[timeIndex % optimalTimes.length];
      
      // Calculate date for current week
      const baseDate = new Date();
      const weeksOffset = (currentWeek - 1) * 7;
      baseDate.setDate(baseDate.getDate() + weeksOffset);
      
      // Find the target day
      const currentDay = baseDate.getDay();
      const daysToAdd = (optimalTime.dayOfWeek - currentDay + 7) % 7;
      if (daysToAdd === 0 && currentDay === optimalTime.dayOfWeek) {
        baseDate.setDate(baseDate.getDate() + 7);
      } else {
        baseDate.setDate(baseDate.getDate() + daysToAdd);
      }

      scheduledDate = new Date(baseDate);
      scheduledDate.setHours(optimalTime.hour, optimalTime.minute, 0, 0);

      // Check if this time conflicts with previously scheduled posts
      if (!avoidClumping || usedTimes.every(used => {
        const hoursDiff = Math.abs(scheduledDate.getTime() - used.getTime()) / (1000 * 60 * 60);
        return hoursDiff >= minHoursBetween;
      })) {
        break; // Found a good time
      }

      timeIndex++;
      attempts++;
    }

    // If we couldn't find a non-clumping time, just use the calculated time
    if (!scheduledDate) {
      const optimalTime = optimalTimes[timeIndex % optimalTimes.length];
      const baseDate = new Date();
      const weeksOffset = (currentWeek - 1) * 7;
      baseDate.setDate(baseDate.getDate() + weeksOffset);
      const currentDay = baseDate.getDay();
      const daysToAdd = (optimalTime.dayOfWeek - currentDay + 7) % 7;
      baseDate.setDate(baseDate.getDate() + daysToAdd);
      scheduledDate = new Date(baseDate);
      scheduledDate.setHours(optimalTime.hour, optimalTime.minute, 0, 0);
    }

    // Ensure date is in the future
    if (scheduledDate < new Date()) {
      scheduledDate.setDate(scheduledDate.getDate() + 7);
    }

    scheduledDates.push(scheduledDate.toISOString());
    usedTimes.push(scheduledDate);

    // Move to next optimal time
    timeIndex++;
    
    // If we've exhausted optimal times for this week, move to next week
    if (timeIndex >= optimalTimes.length) {
      currentWeek++;
      timeIndex = 0;
    }
  }

  return scheduledDates;
}

