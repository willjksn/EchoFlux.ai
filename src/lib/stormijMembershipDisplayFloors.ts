/**
 * Manual display floors for Stormij → EchoFlux fans whose subscription ledger did not
 * migrate into `orders` / `totalMembershipCents`. Scoped to `creators/{id}.handle === stormijxo`
 * so other creators are unaffected. Values are merged with `Math.max(computed, floor)`.
 */
const STORMIJXO_HANDLE = "stormijxo";

const MEMBERSHIP_FLOOR_CENTS_BY_EMAIL: Readonly<Record<string, number>> = {
  "ddclare@gmail.com": 1200,
  "stonemanbill@yahoo.com": 1900,
  "cml7694@icloud.com": 1900,
};

export function stormijMembershipDisplayFloorCents(
  creatorHandle: string | undefined,
  fanEmail: string | null | undefined,
): number {
  const h = (creatorHandle ?? "").trim().toLowerCase();
  if (h !== STORMIJXO_HANDLE) return 0;
  const e = (fanEmail ?? "").trim().toLowerCase();
  if (!e) return 0;
  return MEMBERSHIP_FLOOR_CENTS_BY_EMAIL[e] ?? 0;
}
