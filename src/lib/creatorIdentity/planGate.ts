/** Client-side mirror of `api/_planLimits.normalizePlanForLimits` + Elite gate for Creator Identity. */

export function normalizePlanForLimitsClient(plan: string): string {
  if (plan === 'OnlyFansStudio' || plan === 'CreatorElite') return 'Elite';
  if (plan === 'CreatorPro') return 'Pro';
  return plan;
}

export function isCreatorIdentityPlanClient(plan: string | undefined | null): boolean {
  if (!plan) return false;
  if (plan === 'Agency') return true;
  return normalizePlanForLimitsClient(plan) === 'Elite';
}
