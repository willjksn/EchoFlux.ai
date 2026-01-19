import { Notification } from '../../types';

export interface AdminAlert {
  type: 'runaway' | 'cost' | 'error_rate' | 'payment_failed' | 'system_health' | 'api_quota' | 'storage_quota' | 'high_error_rate';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  userName?: string;
  metadata?: Record<string, any>;
}

/**
 * Convert admin alerts to notifications for admin users
 */
export function createAdminNotifications(alerts: AdminAlert[]): Notification[] {
  return alerts.map((alert, index) => {
    const icon = getAlertIcon(alert.type);
    const severityColor = getSeverityColor(alert.severity);
    
    return {
      id: `admin-alert-${alert.type}-${Date.now()}-${index}`,
      text: `${icon} ${alert.message}`,
      timestamp: 'Just now',
      read: false,
      messageId: `admin-${alert.type}`,
    };
  });
}

function getAlertIcon(type: AdminAlert['type']): string {
  switch (type) {
    case 'runaway':
      return '🚨';
    case 'cost':
      return '💰';
    case 'error_rate':
    case 'high_error_rate':
      return '⚠️';
    case 'payment_failed':
      return '💳';
    case 'system_health':
      return '🏥';
    case 'api_quota':
      return '📊';
    case 'storage_quota':
      return '💾';
    default:
      return '🔔';
  }
}

function getSeverityColor(severity: AdminAlert['severity']): string {
  switch (severity) {
    case 'critical':
      return 'text-red-600';
    case 'high':
      return 'text-orange-600';
    case 'medium':
      return 'text-yellow-600';
    case 'low':
      return 'text-blue-600';
    default:
      return 'text-gray-600';
  }
}

/**
 * Check model usage analytics and create admin alerts
 */
export function checkAdminAlerts(
  modelUsageStats: {
    totalCost: number;
    errorRate: number;
    runawayUsers: Array<{ userId: string; userName: string; requests24h: number; cost24h: number }>;
    totalRequests?: number;
    requestsByModel?: Record<string, number>;
  },
  additionalChecks?: {
    apiQuotaUsed?: number;
    apiQuotaLimit?: number;
    systemHealth?: 'healthy' | 'degraded' | 'down';
    storageQuotaUsed?: number;
    storageQuotaLimit?: number;
  }
): AdminAlert[] {
  const alerts: AdminAlert[] = [];

  // Cost threshold alert
  const costAlertThreshold = 10; // USD
  if (modelUsageStats.totalCost >= costAlertThreshold) {
    alerts.push({
      type: 'cost',
      message: `Total AI cost exceeded $${costAlertThreshold.toFixed(2)}. Current: $${modelUsageStats.totalCost.toFixed(2)}`,
      severity: modelUsageStats.totalCost >= 50 ? 'critical' : modelUsageStats.totalCost >= 25 ? 'high' : 'medium',
    });
  }

  // Error rate alert
  const errorAlertThreshold = 5; // %
  if (modelUsageStats.errorRate >= errorAlertThreshold) {
    alerts.push({
      type: modelUsageStats.errorRate >= 20 ? 'high_error_rate' : 'error_rate',
      message: `Error rate exceeded ${errorAlertThreshold}%. Current: ${modelUsageStats.errorRate.toFixed(1)}%`,
      severity: modelUsageStats.errorRate >= 20 ? 'critical' : modelUsageStats.errorRate >= 10 ? 'high' : 'medium',
    });
  }

  // Runaway usage alerts
  if (modelUsageStats.runawayUsers.length > 0) {
    modelUsageStats.runawayUsers.forEach(user => {
      alerts.push({
        type: 'runaway',
        message: `Runaway usage: ${user.userName} (${user.userId}) - ${user.requests24h} requests in 24h ($${user.cost24h.toFixed(2)})`,
        severity: user.requests24h >= 500 ? 'critical' : user.requests24h >= 300 ? 'high' : 'medium',
        userId: user.userId,
        userName: user.userName,
        metadata: { requests24h: user.requests24h, cost24h: user.cost24h },
      });
    });
  }

  // API quota alerts
  if (additionalChecks?.apiQuotaUsed && additionalChecks?.apiQuotaLimit) {
    const quotaPercent = (additionalChecks.apiQuotaUsed / additionalChecks.apiQuotaLimit) * 100;
    if (quotaPercent >= 90) {
      alerts.push({
        type: 'api_quota',
        message: `API quota nearly exhausted: ${quotaPercent.toFixed(1)}% used (${additionalChecks.apiQuotaUsed}/${additionalChecks.apiQuotaLimit})`,
        severity: quotaPercent >= 99 ? 'critical' : 'high',
        metadata: { quotaUsed: additionalChecks.apiQuotaUsed, quotaLimit: additionalChecks.apiQuotaLimit },
      });
    }
  }

  // System health alerts
  if (additionalChecks?.systemHealth) {
    if (additionalChecks.systemHealth === 'down') {
      alerts.push({
        type: 'system_health',
        message: 'System is down - immediate attention required',
        severity: 'critical',
      });
    } else if (additionalChecks.systemHealth === 'degraded') {
      alerts.push({
        type: 'system_health',
        message: 'System performance is degraded',
        severity: 'high',
      });
    }
  }

  // Storage quota alerts (Firebase Storage)
  if (additionalChecks?.storageQuotaUsed && additionalChecks?.storageQuotaLimit) {
    const storagePercent = (additionalChecks.storageQuotaUsed / additionalChecks.storageQuotaLimit) * 100;
    if (storagePercent >= 85) {
      alerts.push({
        type: 'storage_quota',
        message: `Storage quota warning: ${storagePercent.toFixed(1)}% used (${(additionalChecks.storageQuotaUsed / 1024 / 1024 / 1024).toFixed(2)} GB / ${(additionalChecks.storageQuotaLimit / 1024 / 1024 / 1024).toFixed(2)} GB)`,
        severity: storagePercent >= 95 ? 'critical' : storagePercent >= 90 ? 'high' : 'medium',
        metadata: { storageUsed: additionalChecks.storageQuotaUsed, storageLimit: additionalChecks.storageQuotaLimit },
      });
    }
  }

  return alerts;
}
