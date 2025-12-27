import { getAdminDb } from './_firebaseAdmin.js';

export type PlanChangeSource =
  | 'stripe_webhook'
  | 'verify_checkout_session'
  | 'subscription_change_api'
  | 'admin_override'
  | 'unknown';

export async function recordPlanChangeEvent(params: {
  userId: string;
  fromPlan: string | null;
  toPlan: string;
  changedAtIso: string;
  source: PlanChangeSource;
  stripeSessionId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const db = getAdminDb();
  const docRef = db.collection('plan_change_events').doc();
  await docRef.set({
    userId: params.userId,
    fromPlan: params.fromPlan,
    toPlan: params.toPlan,
    changedAt: params.changedAtIso,
    source: params.source,
    stripeSessionId: params.stripeSessionId || null,
    stripeSubscriptionId: params.stripeSubscriptionId || null,
    createdAt: new Date().toISOString(),
  });
  return docRef.id;
}


