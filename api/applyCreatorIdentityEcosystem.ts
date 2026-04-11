import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { isCreatorIdentityPlan } from "./_creatorIdentityElite.js";
import { getCreatorIdentityCurrent } from "./_creatorIdentityFirestore.js";
import {
  mergeFanHubStorefrontFromIdentity,
  profileToPremiumStudioDefaults,
  profileToWitmeAutofillPayload,
} from "../src/lib/creatorIdentity/applyPayloads.js";
import type { CreatorIdentityProfile } from "../src/lib/creatorIdentity/types.js";

function isProfile(x: unknown): x is CreatorIdentityProfile {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.status === "draft") return false;
  return typeof o.generatedProfile === "object" && o.generatedProfile !== null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await verifyAuth(req);
  if (!user?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const db = getAdminDb();
  if (!db) {
    res.status(500).json({ error: "Database unavailable" });
    return;
  }

  const userDoc = await db.collection("users").doc(user.uid).get();
  const userData = userDoc.exists ? (userDoc.data() as Record<string, unknown>) : {};
  const plan = String(userData.plan || "");
  if (!isCreatorIdentityPlan(plan)) {
    res.status(403).json({ error: "Not available on your plan." });
    return;
  }

  const body = (req.body || {}) as {
    targets?: string[];
  };
  const targets = Array.isArray(body.targets) ? body.targets : [];
  if (!targets.length) {
    res.status(400).json({ error: "targets required" });
    return;
  }

  const raw = await getCreatorIdentityCurrent(db, user.uid);
  if (!isProfile(raw)) {
    res.status(400).json({ error: "Complete the Creator Identity Builder first." });
    return;
  }
  const profile = raw as unknown as CreatorIdentityProfile;
  if (profile.status === "draft") {
    res.status(400).json({ error: "Profile is still a draft." });
    return;
  }

  const now = new Date().toISOString();
  const eco = { ...profile.ecosystemSync };

  const fanHubApply = targets.includes("fanHubMyPage") || targets.includes("witme");
  if (fanHubApply) {
    const creatorRef = db.collection("creators").doc(user.uid);
    const creatorSnap = await creatorRef.get();
    const existing = (creatorSnap.exists ? (creatorSnap.data() as Record<string, unknown>) : {}) ?? {};
    const storefrontPatch = mergeFanHubStorefrontFromIdentity(existing, profile);
    await creatorRef.set(
      {
        ...storefrontPatch,
        updatedAt: now,
      },
      { merge: true }
    );
    eco.appliedToWitmePage = true;
  }

  const settingsPatch: Record<string, unknown> = {};
  if (targets.includes("echoProfile")) {
    const nicheHuman = profile.primaryNiche ? profile.primaryNiche.replace(/_/g, " ") : "";
    settingsPatch.nicheFromCreatorIdentity = nicheHuman;
    settingsPatch.creatorIdentityBrandSummary = profile.generatedProfile.brandSummary;
    eco.appliedToEchoFluxProfile = true;
  }
  if (targets.includes("strategyDefaults")) {
    settingsPatch.strategyDefaultAngleFromIdentity = profile.generatedProfile.suggestedContentPillars.join(" · ");
    eco.appliedToStrategyDefaults = true;
  }
  if (targets.includes("captionDefaults")) {
    settingsPatch.captionVoiceBaselineFromIdentity = [
      profile.generatedProfile.brandStatement,
      profile.audienceDrivers.map((d) => d.replace(/_/g, " ")).join(", "),
    ]
      .filter(Boolean)
      .join("\n");
    eco.appliedToCaptionDefaults = true;
  }
  if (targets.includes("premiumStudio")) {
    const ps = profileToPremiumStudioDefaults(profile);
    settingsPatch.premiumStudioIdentityDefaults = ps;
    eco.appliedToPremiumStudio = true;
  }

  eco.lastAppliedAt = now;
  const nextProfile = { ...profile, ecosystemSync: eco, timestamps: { ...profile.timestamps, updatedAt: now } };

  await db
    .collection("users")
    .doc(user.uid)
    .collection("creatorIdentity")
    .doc("current")
    .set(JSON.parse(JSON.stringify(nextProfile)), { merge: true });

  if (Object.keys(settingsPatch).length) {
    const prevSettings = (typeof userData.settings === "object" && userData.settings !== null ? userData.settings : {}) as Record<
      string,
      unknown
    >;
    await db.collection("users").doc(user.uid).set(
      {
        settings: { ...prevSettings, ...settingsPatch },
        updatedAt: now,
      },
      { merge: true }
    );
  }

  res.status(200).json({
    success: true,
    ecosystemSync: eco,
    witmePayload: fanHubApply ? profileToWitmeAutofillPayload(profile) : undefined,
  });
}
