/** Session flag: fan was signed out after paid membership lapsed with no store/post unlocks. */

export function lapsedMembershipSessionKey(creatorId: string): string {
  return `echoflux:lapsed-membership:${creatorId}`;
}

export function primeFanStorefrontLapsedMembershipIntent(creatorId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(lapsedMembershipSessionKey(creatorId), "1");
  } catch {
    /* ignore */
  }
}

export function peekFanStorefrontLapsedMembershipIntent(creatorId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(lapsedMembershipSessionKey(creatorId)) === "1";
  } catch {
    return false;
  }
}

export function clearFanStorefrontLapsedMembershipIntent(creatorId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(lapsedMembershipSessionKey(creatorId));
  } catch {
    /* ignore */
  }
}
