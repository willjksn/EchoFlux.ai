/**
 * Offline smoke: CreatorPro/CreatorElite normalize to Pro/Elite entitlements.
 * Run: npx tsx scripts/smoke-plan-tier-parity.ts
 */
import assert from "node:assert/strict";
import { normalizePlanForLimits } from "../api/_planLimits.ts";
import {
  hasCreatorOSAccess,
  hasEliteAccess,
  hasFanHubStudioRouteAccess,
  hasPremiumStudioRouteAccess,
} from "../src/utils/planAccess.ts";

const proUser = { plan: "CreatorPro" as const, role: "User" as const };
const eliteUser = { plan: "CreatorElite" as const, role: "User" as const };
const publicPro = { plan: "Pro" as const, role: "User" as const };
const publicElite = { plan: "Elite" as const, role: "User" as const };

assert.equal(normalizePlanForLimits("CreatorPro"), "Pro");
assert.equal(normalizePlanForLimits("CreatorElite"), "Elite");
assert.equal(normalizePlanForLimits("OnlyFansStudio"), "Elite");

for (const u of [proUser, publicPro]) {
  assert.equal(hasFanHubStudioRouteAccess(u), true, "Fan Hub access");
  assert.equal(hasCreatorOSAccess(u), true, "Creator OS access");
  assert.equal(hasEliteAccess(u), false, "not Elite");
  assert.equal(hasPremiumStudioRouteAccess(u), false, "not Premium Studio");
}

for (const u of [eliteUser, publicElite]) {
  assert.equal(hasFanHubStudioRouteAccess(u), true);
  assert.equal(hasCreatorOSAccess(u), true);
  assert.equal(hasEliteAccess(u), true);
  assert.equal(hasPremiumStudioRouteAccess(u), true);
}

console.log("smoke-plan-tier-parity: OK");
