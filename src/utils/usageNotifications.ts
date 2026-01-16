import { User, Notification, Plan } from '../../types';

// Define usage limits for each plan
const USAGE_LIMITS: Record<Plan, {
  captions: number;
  strategies: number;
  images: number;
  videos: number;
}> = {
  Free: { captions: 10, strategies: 1, images: 0, videos: 0 },
  Pro: { captions: 500, strategies: 2, images: 50, videos: 1 },
  Elite: { captions: 1500, strategies: 5, images: 500, videos: 25 },
  Agency: { captions: 10000, strategies: 20, images: 1000, videos: 50 },
  Caption: { captions: 100, strategies: 0, images: 0, videos: 0 },
  OnlyFansStudio: { captions: 500, strategies: 2, images: 100, videos: 5 },
  Starter: { captions: 200, strategies: 1, images: 10, videos: 0 },
  Growth: { captions: 1000, strategies: 3, images: 100, videos: 5 },
};

// Thresholds for notifications (percentage used)
const WARNING_THRESHOLD = 0.8; // 80% used
const CRITICAL_THRESHOLD = 0.95; // 95% used

export interface UsageCheckResult {
  shouldNotify: boolean;
  notification: Notification | null;
}

/**
 * Check usage for captions and create notification if needed
 */
export function checkCaptionUsage(
  user: User,
  existingNotifications: Notification[]
): UsageCheckResult {
  const plan = user.plan || 'Free';
  const limits = USAGE_LIMITS[plan] || USAGE_LIMITS.Free;
  const used = user.monthlyCaptionGenerationsUsed || 0;
  const remaining = limits.captions - used;
  const usagePercent = limits.captions > 0 ? used / limits.captions : 0;

  // Check if we've already notified about this specific threshold
  const warningKey = `caption-warning-${Math.floor(usagePercent * 10)}`;
  const hasExistingNotification = existingNotifications.some(
    n => n.id === warningKey || n.text.includes('AI Caption') && !n.read
  );

  if (hasExistingNotification && remaining > 0) {
    return { shouldNotify: false, notification: null };
  }

  // Create notification based on usage level
  if (remaining === 0) {
    return {
      shouldNotify: true,
      notification: {
        id: `caption-limit-${Date.now()}`,
        text: `⚠️ AI Caption limit reached! You've used all ${limits.captions} captions this month. Upgrade to continue.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'usage-limit-caption',
      },
    };
  } else if (usagePercent >= CRITICAL_THRESHOLD) {
    return {
      shouldNotify: true,
      notification: {
        id: warningKey,
        text: `⚠️ AI Caption limit almost reached! Only ${remaining} captions remaining (${used}/${limits.captions} used). Upgrade for more.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'usage-warning-caption',
      },
    };
  } else if (usagePercent >= WARNING_THRESHOLD) {
    return {
      shouldNotify: true,
      notification: {
        id: warningKey,
        text: `💡 AI Caption usage: ${remaining} remaining (${used}/${limits.captions} used). Consider upgrading for more.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'usage-warning-caption',
      },
    };
  }

  return { shouldNotify: false, notification: null };
}

/**
 * Check usage for strategies and create notification if needed
 * Note: Strategy usage is typically checked via API, but we can check from user data
 * For now, we'll need the usageStats to be passed, but this can work with a simplified check
 */
export function checkStrategyUsage(
  user: User,
  existingNotifications: Notification[],
  usageStats?: { strategy: { count: number; limit: number; remaining: number } } | null
): UsageCheckResult {
  const plan = user.plan || 'Free';
  const limits = USAGE_LIMITS[plan] || USAGE_LIMITS.Free;
  
  // If we have usageStats from API, use those (more accurate)
  if (usageStats?.strategy) {
    const { count, limit, remaining } = usageStats.strategy;
    const usagePercent = limit > 0 ? count / limit : 0;
    
    const warningKey = `strategy-warning-${Math.floor(usagePercent * 10)}`;
    const hasExistingNotification = existingNotifications.some(
      n => n.id === warningKey || (n.text.includes('Plan My Week') && !n.read)
    );
    
    if (hasExistingNotification && remaining > 0) {
      return { shouldNotify: false, notification: null };
    }
    
    if (remaining === 0) {
      return {
        shouldNotify: true,
        notification: {
          id: `strategy-limit-${Date.now()}`,
          text: `⚠️ Plan My Week limit reached! You've used all ${limit} plans this month. Upgrade to continue.`,
          timestamp: 'Just now',
          read: false,
          messageId: 'usage-limit-strategy',
        },
      };
    } else if (usagePercent >= CRITICAL_THRESHOLD) {
      return {
        shouldNotify: true,
        notification: {
          id: warningKey,
          text: `⚠️ Plan My Week limit almost reached! Only ${remaining} plans remaining (${count}/${limit} used). Upgrade for more.`,
          timestamp: 'Just now',
          read: false,
          messageId: 'usage-warning-strategy',
        },
      };
    } else if (usagePercent >= WARNING_THRESHOLD) {
      return {
        shouldNotify: true,
        notification: {
          id: warningKey,
          text: `💡 Plan My Week usage: ${remaining} remaining (${count}/${limit} used). Consider upgrading for more.`,
          timestamp: 'Just now',
          read: false,
          messageId: 'usage-warning-strategy',
        },
      };
    }
  }
  
  // Fallback: No usageStats available, can't check
  return { shouldNotify: false, notification: null };
}

/**
 * Check usage for videos and create notification if needed
 */
export function checkVideoUsage(
  user: User,
  existingNotifications: Notification[]
): UsageCheckResult {
  const plan = user.plan || 'Free';
  const limits = USAGE_LIMITS[plan] || USAGE_LIMITS.Free;
  const used = user.monthlyVideoGenerationsUsed || 0;
  const remaining = limits.videos - used;
  const usagePercent = limits.videos > 0 ? used / limits.videos : 0;

  if (limits.videos === 0) {
    return { shouldNotify: false, notification: null };
  }

  const warningKey = `video-warning-${Math.floor(usagePercent * 10)}`;
  const hasExistingNotification = existingNotifications.some(
    n => n.id === warningKey || (n.text.includes('AI Video') && !n.read)
  );

  if (hasExistingNotification && remaining > 0) {
    return { shouldNotify: false, notification: null };
  }

  if (remaining === 0) {
    return {
      shouldNotify: true,
      notification: {
        id: `video-limit-${Date.now()}`,
        text: `⚠️ AI Video generation limit reached! You've used all ${limits.videos} videos this month. Upgrade to continue.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'usage-limit-video',
      },
    };
  } else if (usagePercent >= CRITICAL_THRESHOLD) {
    return {
      shouldNotify: true,
      notification: {
        id: warningKey,
        text: `⚠️ AI Video limit almost reached! Only ${remaining} videos remaining (${used}/${limits.videos} used). Upgrade for more.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'usage-warning-video',
      },
    };
  } else if (usagePercent >= WARNING_THRESHOLD) {
    return {
      shouldNotify: true,
      notification: {
        id: warningKey,
        text: `💡 AI Video usage: ${remaining} remaining (${used}/${limits.videos} used). Consider upgrading for more.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'usage-warning-video',
      },
    };
  }

  return { shouldNotify: false, notification: null };
}

/**
 * Check usage for images and create notification if needed
 */
export function checkImageUsage(
  user: User,
  existingNotifications: Notification[]
): UsageCheckResult {
  const plan = user.plan || 'Free';
  const limits = USAGE_LIMITS[plan] || USAGE_LIMITS.Free;
  const used = user.monthlyImageGenerationsUsed || 0;
  const remaining = limits.images - used;
  const usagePercent = limits.images > 0 ? used / limits.images : 0;

  if (limits.images === 0) {
    return { shouldNotify: false, notification: null };
  }

  const warningKey = `image-warning-${Math.floor(usagePercent * 10)}`;
  const hasExistingNotification = existingNotifications.some(
    n => n.id === warningKey || (n.text.includes('AI Image') && !n.read)
  );

  if (hasExistingNotification && remaining > 0) {
    return { shouldNotify: false, notification: null };
  }

  if (remaining === 0) {
    return {
      shouldNotify: true,
      notification: {
        id: `image-limit-${Date.now()}`,
        text: `⚠️ AI Image generation limit reached! You've used all ${limits.images} images this month. Upgrade to continue.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'usage-limit-image',
      },
    };
  } else if (usagePercent >= CRITICAL_THRESHOLD) {
    return {
      shouldNotify: true,
      notification: {
        id: warningKey,
        text: `⚠️ AI Image limit almost reached! Only ${remaining} images remaining (${used}/${limits.images} used). Upgrade for more.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'usage-warning-image',
      },
    };
  } else if (usagePercent >= WARNING_THRESHOLD) {
    return {
      shouldNotify: true,
      notification: {
        id: warningKey,
        text: `💡 AI Image usage: ${remaining} remaining (${used}/${limits.images} used). Consider upgrading for more.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'usage-warning-image',
      },
    };
  }

  return { shouldNotify: false, notification: null };
}

/**
 * Check all usage types and return notifications to add
 */
export function checkAllUsageLimits(
  user: User,
  existingNotifications: Notification[],
  usageStats?: { strategy: { count: number; limit: number; remaining: number } } | null
): Notification[] {
  const notifications: Notification[] = [];

  // Check caption usage
  const captionCheck = checkCaptionUsage(user, existingNotifications);
  if (captionCheck.shouldNotify && captionCheck.notification) {
    notifications.push(captionCheck.notification);
  }

  // Check image usage
  const imageCheck = checkImageUsage(user, existingNotifications);
  if (imageCheck.shouldNotify && imageCheck.notification) {
    notifications.push(imageCheck.notification);
  }

  // Check video usage
  const videoCheck = checkVideoUsage(user, existingNotifications);
  if (videoCheck.shouldNotify && videoCheck.notification) {
    notifications.push(videoCheck.notification);
  }

  // Check strategy usage (requires usageStats from API)
  const strategyCheck = checkStrategyUsage(user, existingNotifications, usageStats);
  if (strategyCheck.shouldNotify && strategyCheck.notification) {
    notifications.push(strategyCheck.notification);
  }

  return notifications;
}

