import { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from './verifyAuth.js';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './_firebaseAdmin.js';
import { hasPlatformAdminAccess } from './_platformAdminAccess.js';
import { checkAdminAlerts } from '../src/utils/adminNotifications.js';
import { sendEmail } from './_mailer.js';
import { pushForAdminAlert } from './_userWebPush.js';

/** Same-origin `/api` base for server-side fetch (never use client loopback Origin on Vercel). */
const CANONICAL_PUBLIC_ORIGIN = 'https://echoflux.ai';

function stripTrailingSlash(u: string): string {
  return u.replace(/\/$/, '');
}

function isLoopbackOrigin(raw: string): boolean {
  try {
    const u = new URL(raw);
    const h = u.hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0';
  } catch {
    return false;
  }
}

function resolveSelfApiOrigin(req: VercelRequest): string {
  const internal = process.env.INTERNAL_API_BASE_URL?.trim();
  if (internal && !isLoopbackOrigin(internal)) {
    return stripTrailingSlash(internal);
  }

  const appBase = process.env.APP_BASE_URL?.trim();
  if (appBase && !isLoopbackOrigin(appBase)) {
    return stripTrailingSlash(appBase);
  }

  if (process.env.VERCEL_URL) {
    return stripTrailingSlash(`https://${process.env.VERCEL_URL}`);
  }

  const nextPublic = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (nextPublic && !isLoopbackOrigin(nextPublic)) {
    return stripTrailingSlash(nextPublic);
  }

  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (origin && !isLoopbackOrigin(origin)) {
    return stripTrailingSlash(origin);
  }

  return CANONICAL_PUBLIC_ORIGIN;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication - only admins can trigger this
    const decodedToken = await verifyAuth(req);
    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getFirestore(getAdminApp());
    
    // Check if user is admin
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    
    if (!hasPlatformAdminAccess(userData as Record<string, unknown> | undefined)) {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    // Fetch model usage analytics
    let analytics: any = {
      totalCost: 0,
      errorRate: 0,
      runawayUsers: [],
      totalRequests: 0,
      requestsByModel: {},
    };

    try {
      // Get the auth token from the original request
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        throw new Error('No authorization header');
      }

      // Fetch analytics using the same auth token (avoid Origin=http://127.0.0.1 when admin UI is local).
      const baseUrl = resolveSelfApiOrigin(req);
      const analyticsResponse = await fetch(`${baseUrl}/api/getModelUsageAnalytics?days=7`, {
        headers: {
          Authorization: authHeader,
        },
      });

      if (analyticsResponse.ok) {
        const analyticsData = await analyticsResponse.json();
        if (analyticsData && typeof analyticsData === 'object') {
          analytics = {
            totalCost: analyticsData.totalCost || 0,
            errorRate: analyticsData.errorRate || 0,
            runawayUsers: Array.isArray(analyticsData.runawayUsers) ? analyticsData.runawayUsers : [],
            totalRequests: analyticsData.totalRequests || 0,
            requestsByModel: analyticsData.requestsByModel || {},
          };
        }
      } else {
        console.warn('Analytics fetch failed with status:', analyticsResponse.status);
      }
    } catch (analyticsError: any) {
      console.warn('Failed to fetch analytics, using defaults:', analyticsError);
      // Continue with default values - alerts can still be checked
    }

    // Check for admin alerts with additional system checks
    // Ensure all inputs are properly formatted
    const alerts = checkAdminAlerts(
      {
        totalCost: typeof analytics.totalCost === 'number' ? analytics.totalCost : 0,
        errorRate: typeof analytics.errorRate === 'number' ? analytics.errorRate : 0,
        runawayUsers: Array.isArray(analytics.runawayUsers) ? analytics.runawayUsers : [],
        totalRequests: typeof analytics.totalRequests === 'number' ? analytics.totalRequests : 0,
        requestsByModel: typeof analytics.requestsByModel === 'object' && analytics.requestsByModel !== null ? analytics.requestsByModel : {},
      },
      {
        // Add system health check (simplified - can be expanded)
        systemHealth: (analytics.errorRate || 0) > 20 ? 'down' : (analytics.errorRate || 0) > 10 ? 'degraded' : 'healthy',
        // API quota checks (if available from environment or analytics)
        apiQuotaUsed: process.env.API_QUOTA_USED ? parseInt(process.env.API_QUOTA_USED) : undefined,
        apiQuotaLimit: process.env.API_QUOTA_LIMIT ? parseInt(process.env.API_QUOTA_LIMIT) : undefined,
      }
    ) || []; // Ensure alerts is always an array

    // Create admin alerts in Firestore (only if they don't already exist)
    const adminAlertsRef = db.collection('admin_alerts');
    const createdAlerts = [];
    const criticalAlerts: typeof alerts = [];

    for (const alert of alerts) {
      // Check if similar alert already exists (within last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const existingAlerts = await adminAlertsRef
        .where('type', '==', alert.type)
        .where('read', '==', false)
        .where('createdAt', '>', oneHourAgo)
        .limit(1)
        .get();

      if (existingAlerts.empty) {
        await adminAlertsRef.add({
          ...alert,
          createdAt: new Date(),
          read: false,
        });
        createdAlerts.push(alert);
        void pushForAdminAlert({
          type: alert.type,
          title: alert.title,
          message: alert.message,
        }).catch((e) => console.warn('checkAdminAlerts push:', e));
        
        // Track critical alerts for email notification
        if (alert.severity === 'critical') {
          criticalAlerts.push(alert);
        }
      }
    }

    // Send email notifications for critical alerts
    if (criticalAlerts.length > 0) {
      try {
        const adminUsers = await db.collection('users')
          .where('role', '==', 'Admin')
          .limit(5)
          .get();
        
        for (const adminDoc of adminUsers.docs) {
          const adminData = adminDoc.data();
          const adminEmail = adminData.email;
          if (adminEmail) {
            const alertMessages = criticalAlerts.map(a => `• ${a.message}`).join('\n');
            await sendEmail({
              to: adminEmail,
              subject: `🚨 Critical Admin Alert: ${criticalAlerts.length} Issue(s) Require Attention`,
              text: `Critical alerts detected in EchoFlux.ai:

${alertMessages}

Please check the admin dashboard immediately for more details.`,
              html: `<h2>Critical Admin Alerts</h2>
<p>The following critical issues require immediate attention:</p>
<ul>
${criticalAlerts.map(a => `<li>${a.message}</li>`).join('\n')}
</ul>
<p>Please check the admin dashboard immediately for more details.</p>`,
            });
          }
        }
      } catch (emailError) {
        console.warn('Failed to send critical alert email notifications:', emailError);
        // Don't fail the request if email fails
      }
    }

    return res.status(200).json({
      success: true,
      alertsCreated: createdAlerts.length,
      criticalAlertsSent: criticalAlerts.length,
      alerts,
    });
  } catch (error: any) {
    console.error('Error checking admin alerts:', error);
    return res.status(500).json({
      error: 'Failed to check admin alerts',
      message: error.message,
    });
  }
}
