import { User, Notification, Plan } from '../../types';
import { normalizePlanForLimitsClient } from '../lib/creatorIdentity/planGate';
import { usageNotificationMonthKey } from './usageNotificationDismissals';
import { ackEchoFluxBillingReminder } from '../lib/ackEchoFluxBillingReminder';
import {
  buildCardReminderNotificationText,
  buildPeriodReminderNotificationText,
  evaluateCardBillingReminder,
  evaluatePeriodBillingReminder,
  notificationIdForBillingReminder,
  type EchoFluxBillingReminderState,
  type EchoFluxDefaultCardExp,
} from '../lib/echoFluxBillingReminders';

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
  OnlyFansStudio: { captions: 1500, strategies: 5, images: 500, videos: 25 },
  Starter: { captions: 200, strategies: 1, images: 10, videos: 0 },
  Growth: { captions: 1000, strategies: 3, images: 100, videos: 5 },
  CreatorPro: { captions: 500, strategies: 2, images: 50, videos: 1 },
  CreatorElite: { captions: 1500, strategies: 5, images: 500, videos: 25 },
};

function limitsForUserPlan(user: User) {
  const raw = user.plan || 'Free';
  const tier = normalizePlanForLimitsClient(raw) as Plan;
  return USAGE_LIMITS[tier] ?? USAGE_LIMITS.Free;
}

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
  const limits = limitsForUserPlan(user);
  const used = user.monthlyCaptionGenerationsUsed || 0;
  const remaining = limits.captions - used;
  const usagePercent = limits.captions > 0 ? used / limits.captions : 0;

  // Check if we've already notified about this specific threshold
  const warningKey = `caption-warning-${Math.floor(usagePercent * 10)}`;
  const limitId = `caption-limit-${usageNotificationMonthKey()}`;
  const hasExistingNotification = existingNotifications.some(
    (n) => n.id === warningKey || n.id === limitId || (n.text.includes('AI Caption') && !n.read)
  );

  if (hasExistingNotification && remaining > 0) {
    return { shouldNotify: false, notification: null };
  }

  // Create notification based on usage level
  if (remaining === 0) {
    return {
      shouldNotify: true,
      notification: {
        id: limitId,
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
  // If we have usageStats from API, use those (more accurate)
  if (usageStats?.strategy) {
    const { count, limit, remaining } = usageStats.strategy;
    const usagePercent = limit > 0 ? count / limit : 0;
    
    const warningKey = `strategy-warning-${Math.floor(usagePercent * 10)}`;
    const limitId = `strategy-limit-${usageNotificationMonthKey()}`;
    const hasExistingNotification = existingNotifications.some(
      (n) => n.id === warningKey || n.id === limitId || (n.text.includes('Plan My Week') && !n.read)
    );
    
    if (hasExistingNotification && remaining > 0) {
      return { shouldNotify: false, notification: null };
    }
    
    if (remaining === 0) {
      return {
        shouldNotify: true,
        notification: {
          id: `strategy-limit-${usageNotificationMonthKey()}`,
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
  const limits = limitsForUserPlan(user);
  const used = user.monthlyVideoGenerationsUsed || 0;
  const remaining = limits.videos - used;
  const usagePercent = limits.videos > 0 ? used / limits.videos : 0;

  if (limits.videos === 0) {
    return { shouldNotify: false, notification: null };
  }

  const warningKey = `video-warning-${Math.floor(usagePercent * 10)}`;
  const videoLimitId = `video-limit-${usageNotificationMonthKey()}`;
  const hasExistingNotification = existingNotifications.some(
    (n) => n.id === warningKey || n.id === videoLimitId || (n.text.includes('AI Video') && !n.read)
  );

  if (hasExistingNotification && remaining > 0) {
    return { shouldNotify: false, notification: null };
  }

  if (remaining === 0) {
    return {
      shouldNotify: true,
      notification: {
        id: videoLimitId,
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
  const limits = limitsForUserPlan(user);
  const used = user.monthlyImageGenerationsUsed || 0;
  const remaining = limits.images - used;
  const usagePercent = limits.images > 0 ? used / limits.images : 0;

  if (limits.images === 0) {
    return { shouldNotify: false, notification: null };
  }

  const warningKey = `image-warning-${Math.floor(usagePercent * 10)}`;
  const imageLimitId = `image-limit-${usageNotificationMonthKey()}`;
  const hasExistingNotification = existingNotifications.some(
    (n) => n.id === warningKey || n.id === imageLimitId || (n.text.includes('AI Image') && !n.read)
  );

  if (hasExistingNotification && remaining > 0) {
    return { shouldNotify: false, notification: null };
  }

  if (remaining === 0) {
    return {
      shouldNotify: true,
      notification: {
        id: imageLimitId,
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
 * Check storage usage and create notification if approaching limit
 */
export function checkStorageUsage(
  user: User,
  existingNotifications: Notification[]
): UsageCheckResult {
  const storageUsed = user.storageUsed || 0;
  const storageLimit = user.storageLimit || 100; // Default to 100 MB (Free plan)
  const usagePercent = storageLimit > 0 ? storageUsed / storageLimit : 0;

  if (usagePercent === 0) {
    return { shouldNotify: false, notification: null };
  }

  // Check if we've already notified about this specific threshold
  const warningKey = `storage-warning-${Math.floor(usagePercent * 10)}`;
  const storageLimitId = `storage-limit-${usageNotificationMonthKey()}`;
  const hasExistingNotification = existingNotifications.some(
    (n) => n.id === warningKey || n.id === storageLimitId || (n.text.includes('Storage') && !n.read)
  );

  if (hasExistingNotification && usagePercent < 1.0) {
    return { shouldNotify: false, notification: null };
  }

  // Format storage in appropriate units
  const formatStorage = (mb: number): string => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb.toFixed(0)} MB`;
  };

  // Create notification based on usage level
  if (usagePercent >= 1.0) {
    return {
      shouldNotify: true,
      notification: {
        id: storageLimitId,
        text: `⚠️ Storage limit reached! You've used ${formatStorage(storageUsed)} of ${formatStorage(storageLimit)}. Delete files or upgrade to continue uploading.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'usage-limit-storage',
      },
    };
  } else if (usagePercent >= CRITICAL_THRESHOLD) {
    const remaining = storageLimit - storageUsed;
    return {
      shouldNotify: true,
      notification: {
        id: warningKey,
        text: `⚠️ Storage limit almost reached! Only ${formatStorage(remaining)} remaining (${formatStorage(storageUsed)}/${formatStorage(storageLimit)} used). Consider upgrading or deleting files.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'usage-warning-storage',
      },
    };
  } else if (usagePercent >= WARNING_THRESHOLD) {
    const remaining = storageLimit - storageUsed;
    return {
      shouldNotify: true,
      notification: {
        id: warningKey,
        text: `💡 Storage usage: ${formatStorage(remaining)} remaining (${formatStorage(storageUsed)}/${formatStorage(storageLimit)} used). Consider upgrading for more storage.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'usage-warning-storage',
      },
    };
  }

  return { shouldNotify: false, notification: null };
}

/**
 * Check trial end date and create notification if trial is about to end
 */
export function checkTrialEndDate(
  user: User,
  existingNotifications: Notification[]
): UsageCheckResult {
  const trialEndDate = (user as any)?.trialEndDate as string | null | undefined;
  
  // Only check if user has a trial end date and is on a paid plan
  if (!trialEndDate || !user.plan || user.plan === 'Free') {
    return { shouldNotify: false, notification: null };
  }

  const trialEndMs = new Date(trialEndDate).getTime();
  const nowMs = Date.now();
  const daysUntilTrialEnd = Math.ceil((trialEndMs - nowMs) / (1000 * 60 * 60 * 24));

  // Check if trial has already ended
  if (daysUntilTrialEnd < 0) {
    return { shouldNotify: false, notification: null };
  }

  // Check if we've already notified about this specific day
  const notificationKey = `trial-end-${daysUntilTrialEnd}`;
  const hasExistingNotification = existingNotifications.some(
    n => n.id === notificationKey || (n.messageId === 'trial-ending' && !n.read)
  );

  if (hasExistingNotification) {
    return { shouldNotify: false, notification: null };
  }

  // Notify at different intervals: 3 days before, 1 day before, and on the day it ends
  if (daysUntilTrialEnd === 0) {
    return {
      shouldNotify: true,
      notification: {
        id: notificationKey,
        text: `⏰ Your 7-day trial ends today! Your subscription will start automatically. Cancel anytime in Settings.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'trial-ending',
      },
    };
  } else if (daysUntilTrialEnd === 1) {
    return {
      shouldNotify: true,
      notification: {
        id: notificationKey,
        text: `⏰ Your 7-day trial ends tomorrow! Your subscription will start automatically. Cancel anytime in Settings.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'trial-ending',
      },
    };
  } else if (daysUntilTrialEnd === 3) {
    return {
      shouldNotify: true,
      notification: {
        id: notificationKey,
        text: `⏰ Your 7-day trial ends in 3 days. Your subscription will start automatically. Cancel anytime in Settings.`,
        timestamp: 'Just now',
        read: false,
        messageId: 'trial-ending',
      },
    };
  }

  return { shouldNotify: false, notification: null };
}

/**
 * EchoFlux plan renewal / cancel-at-period-end and card expiration (7, 3, 1 days).
 * Server tracks sent days so fixing billing before the next threshold skips later reminders.
 */
export function checkEchoFluxBillingReminders(
  user: User,
  existingNotifications: Notification[],
  dismissedUsageIds?: Set<string>,
): Notification | null {
  const u = user as User & {
    subscriptionStatus?: string;
    cancelAtPeriodEnd?: boolean;
    subscriptionEndDate?: string | null;
    subscriptionCurrentPeriodEnd?: string | null;
    stripeSubscriptionId?: string | null;
    echoFluxBillingReminderState?: EchoFluxBillingReminderState;
    echoFluxDefaultCardExp?: EchoFluxDefaultCardExp;
  };

  const state = u.echoFluxBillingReminderState;
  const period = evaluatePeriodBillingReminder(u, state);
  if (period) {
    const id = notificationIdForBillingReminder("period", period.anchor, period.day);
    if (
      dismissedUsageIds?.has(id) ||
      existingNotifications.some((n) => n.id === id || (n.messageId === "echoflux-billing" && !n.read))
    ) {
      return null;
    }
    void ackEchoFluxBillingReminder({
      kind: "period",
      anchor: period.anchor,
      day: period.day,
    });
    return {
      id,
      text: buildPeriodReminderNotificationText(period.day, period.cancelAtPeriodEnd),
      timestamp: "Just now",
      read: false,
      messageId: "echoflux-billing",
    };
  }

  const card = evaluateCardBillingReminder(u.echoFluxDefaultCardExp, state, u);
  if (card) {
    const id = notificationIdForBillingReminder("card", card.anchor, card.day);
    if (
      dismissedUsageIds?.has(id) ||
      existingNotifications.some((n) => n.id === id || (n.messageId === "echoflux-billing" && !n.read))
    ) {
      return null;
    }
    void ackEchoFluxBillingReminder({
      kind: "card",
      anchor: card.anchor,
      day: card.day,
    });
    const cardMeta = u.echoFluxDefaultCardExp!;
    return {
      id,
      text: buildCardReminderNotificationText(card.day, cardMeta),
      timestamp: "Just now",
      read: false,
      messageId: "echoflux-billing",
    };
  }

  return null;
}

/**
 * Check all usage types and return notifications to add
 */
function pushUnlessDismissed(
  notifications: Notification[],
  n: Notification | null | undefined,
  dismissed: Set<string>
): void {
  if (!n || dismissed.has(n.id)) return;
  notifications.push(n);
}

export function checkAllUsageLimits(
  user: User,
  existingNotifications: Notification[],
  usageStats?: { strategy: { count: number; limit: number; remaining: number } } | null,
  dismissedUsageIds?: Set<string>
): Notification[] {
  const dismissed = dismissedUsageIds ?? new Set<string>();
  const notifications: Notification[] = [];

  // Check trial end date
  const trialCheck = checkTrialEndDate(user, existingNotifications);
  if (trialCheck.shouldNotify) {
    pushUnlessDismissed(notifications, trialCheck.notification, dismissed);
  }

  const billingReminder = checkEchoFluxBillingReminders(user, existingNotifications, dismissed);
  pushUnlessDismissed(notifications, billingReminder, dismissed);

  // Check storage usage
  const storageCheck = checkStorageUsage(user, existingNotifications);
  if (storageCheck.shouldNotify) {
    pushUnlessDismissed(notifications, storageCheck.notification, dismissed);
  }

  // Check caption usage
  const captionCheck = checkCaptionUsage(user, existingNotifications);
  if (captionCheck.shouldNotify) {
    pushUnlessDismissed(notifications, captionCheck.notification, dismissed);
  }

  // Check image usage
  const imageCheck = checkImageUsage(user, existingNotifications);
  if (imageCheck.shouldNotify) {
    pushUnlessDismissed(notifications, imageCheck.notification, dismissed);
  }

  // Check video usage
  const videoCheck = checkVideoUsage(user, existingNotifications);
  if (videoCheck.shouldNotify) {
    pushUnlessDismissed(notifications, videoCheck.notification, dismissed);
  }

  // Check strategy usage (requires usageStats from API)
  const strategyCheck = checkStrategyUsage(user, existingNotifications, usageStats);
  if (strategyCheck.shouldNotify) {
    pushUnlessDismissed(notifications, strategyCheck.notification, dismissed);
  }

  return notifications;
}

