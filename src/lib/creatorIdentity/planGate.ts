/**
 * Client-side mirror of `api/_planLimits.normalizePlanForLimits` + Elite gate for Creator Identity.
 *
 * Product note: Pro (and CreatorPro) creators still get storefront, Fan Hub, captions, etc. The **Creator Identity
 * Builder** and identity-aware defaults are **Elite-tier**: plan `Elite`, invite `CreatorElite`, legacy stored
 * `OnlyFansStudio` (product name is Premium Studio; old rows still normalize to Elite), plus `Agency`.
 */

export function normalizePlanForLimitsClient(plan: string): string {
  const normalized = String(plan || '').trim().toLowerCase();
  if (normalized === 'onlyfansstudio' || normalized === 'creatoronlyfansstudio' || normalized === 'creatorelite') return 'Elite';
  if (normalized === 'creatorpro') return 'Pro';
  return plan;
}

/** True when the account may use Creator Identity Builder and identity-powered defaults (Elite-equivalent + Agency). */
export function isCreatorIdentityPlanClient(plan: string | undefined | null): boolean {
  if (!plan) return false;
  if (plan === 'Agency') return true;
  return normalizePlanForLimitsClient(plan) === 'Elite';
}
