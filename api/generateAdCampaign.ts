// api/generateAdCampaign.ts
// AI-powered ad campaign generation for EchoFlux marketing (Admin-only)

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { getModelForTask } from "./_modelRouter.js";
import { enforceRateLimit } from "./_rateLimit.js";
import path from "path";
import { readdir, readFile, stat } from "fs/promises";

// Brand guardrails for EchoFlux
const BRAND_VOICE = `
EchoFlux Voice:
- Creator-first, supportive, calm confidence
- Short, clear lines
- Emphasize consistency and burnout prevention
`;

const APPROVED_CLAIMS = [
  "Plan → create → post workflow designed for creators",
  "Planning keeps you consistent",
  "Prevents burnout and decision fatigue",
  "Built for monetized creators and new creators starting out",
  "The creators who plan consistently earn 3x more",
];

const PLATFORM_CONSTRAINTS = {
  x: {
    characterLimit: 220,
    hashtags: "1-2 max",
    style: "Hook + benefit + CTA structure",
    cta: "Try free for 7 days",
  },
  instagram: {
    characterLimit: 2200,
    hashtags: "3-5 max",
    style: "Short or long captions with line breaks",
    cta: "Try free for 7 days",
  },
  tiktok: {
    characterLimit: 300,
    hashtags: "3-5 max",
    style: "Hook in first 2-3 seconds, 15-25s script",
    cta: "Try free for 7 days",
  },
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authUser = await verifyAuth(req);
  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Verify admin access
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(authUser.uid).get();
  
  if (!userDoc.exists) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const userData = userDoc.data();
  if (userData?.role !== "Admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  // Rate limiting: 10 requests per minute per admin
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "generateAdCampaign",
    limit: 10,
    windowMs: 60_000,
    identifier: authUser.uid,
  });
  if (!ok) return;

  const {
    objective = "awareness",
    targetAudience,
    keyMessage,
    selectedImageId,
    selectedScreenshotId, // Support both for backward compatibility
    generateStrategy = true,
    useAppContext = true,
  } = req.body || {};

  if (!targetAudience || typeof targetAudience !== "string") {
    res.status(400).json({ error: "targetAudience is required" });
    return;
  }

  const summarizeAppContext = async (): Promise<string> => {
    if (!useAppContext) return "";

    const rootDir = process.cwd();
    const allowDirs = ["components", "src", "api", "public"];
    const allowFiles = ["README.md", "package.json"];
    const ignoreDirs = new Set(["node_modules", "dist", "build", ".git", ".vercel", ".next", ".turbo"]);
    const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".md", ".json"]);
    const maxFiles = 60;
    const maxBytes = 120_000;

    const collected: string[] = [];
    let totalBytes = 0;

    const shouldIncludeFile = (filePath: string) => {
      const ext = path.extname(filePath);
      return allowedExtensions.has(ext);
    };

    const walkDir = async (dirPath: string, depth: number) => {
      if (collected.length >= maxFiles || totalBytes >= maxBytes || depth > 4) return;
      let entries;
      try {
        entries = await readdir(dirPath, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (collected.length >= maxFiles || totalBytes >= maxBytes) break;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          if (ignoreDirs.has(entry.name)) continue;
          await walkDir(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const rel = path.relative(rootDir, fullPath);
          if (!shouldIncludeFile(fullPath)) continue;
          try {
            const fileStats = await stat(fullPath);
            if (fileStats.size > 80_000) continue;
            const content = await readFile(fullPath, "utf8");
            const clipped = content.slice(0, 6000);
            const chunk = `\nFILE: ${rel}\n${clipped}\n`;
            const chunkBytes = Buffer.byteLength(chunk, "utf8");
            if (totalBytes + chunkBytes > maxBytes) continue;
            collected.push(chunk);
            totalBytes += chunkBytes;
          } catch {
            // ignore unreadable files
          }
        }
      }
    };

    for (const fileName of allowFiles) {
      if (collected.length >= maxFiles || totalBytes >= maxBytes) break;
      const fullPath = path.join(rootDir, fileName);
      try {
        const content = await readFile(fullPath, "utf8");
        const clipped = content.slice(0, 6000);
        const chunk = `\nFILE: ${fileName}\n${clipped}\n`;
        const chunkBytes = Buffer.byteLength(chunk, "utf8");
        if (totalBytes + chunkBytes <= maxBytes) {
          collected.push(chunk);
          totalBytes += chunkBytes;
        }
      } catch {
        // ignore missing
      }
    }

    for (const dirName of allowDirs) {
      await walkDir(path.join(rootDir, dirName), 0);
      if (collected.length >= maxFiles || totalBytes >= maxBytes) break;
    }

    if (collected.length === 0) return "";

    const summaryModel = await getModelForTask("analytics", authUser.uid);
    const summaryPrompt = `
You are analyzing the current app codebase to extract marketing-relevant context.
Summarize the product in 6-10 bullet points. Include: core features, benefits, target creators, workflow, and outcomes.
Avoid mentioning AI, artificial intelligence, machine learning, or automation.
Avoid internal implementation details, code terms, or file names.
Return only bullet points.

CODEBASE EXCERPTS:
${collected.join("\n")}
`;
    const summaryResult = await summaryModel.generateContent({
      contents: [{ role: "user", parts: [{ text: summaryPrompt }] }],
    });
    return summaryResult.response.text().trim();
  };

  let appContextSummary = "";
  try {
    appContextSummary = await summarizeAppContext();
  } catch (err) {
    console.warn("Failed to summarize app context:", err);
  }

  try {
    const model = await getModelForTask("strategy", authUser.uid);

    // Get image URL if provided (support both new and old parameter names)
    const imageId = selectedImageId || selectedScreenshotId;
    let screenshotUrl: string | undefined;
    if (imageId) {
      const imageDoc = await db
        .collection("ad_screenshots")
        .doc(imageId)
        .get();
      if (imageDoc.exists) {
        screenshotUrl = imageDoc.data()?.url;
      }
    }

    // Generate strategy brief if requested
    let strategyBrief: any = null;
    if (generateStrategy) {
      const strategyPrompt = `
You are creating a marketing strategy brief for EchoFlux.ai ad campaigns.

${BRAND_VOICE}

APPROVED CLAIMS (use only these):
${APPROVED_CLAIMS.map((claim) => `- ${claim}`).join("\n")}

Important:
- Do NOT mention AI, artificial intelligence, or “AI-led”
- Do NOT mention machine learning or automation

${appContextSummary ? `APP CONTEXT SUMMARY:\n${appContextSummary}\n` : ""}

Inputs:
- Objective: ${objective}
- Target Audience: ${targetAudience}
- Key Message: ${keyMessage || "Not specified"}

Create a concise strategy brief that includes:
1. Objective (from input)
2. Target Audience (from input)
3. Key Message (from input or derive from approved claims)
4. Tone (aligned with brand voice)
5. CTA: "Try free for 7 days"

Return ONLY valid JSON:
{
  "objective": "...",
  "targetAudience": "...",
  "keyMessage": "...",
  "tone": "...",
  "cta": "Try free for 7 days"
}
`;

      const strategyResult = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: strategyPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      try {
        const raw = strategyResult.response.text().trim();
        strategyBrief = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      } catch (parseError) {
        console.warn("Failed to parse strategy brief, continuing without it:", parseError);
      }
    }

    // Use strategy brief or fallback values
    const finalObjective = strategyBrief?.objective || objective;
    const finalTargetAudience = strategyBrief?.targetAudience || targetAudience;
    const finalKeyMessage = strategyBrief?.keyMessage || keyMessage || "Plan consistently, earn 3x more";
    const finalTone = strategyBrief?.tone || "Creator-first, supportive, confident";
    const finalCta = strategyBrief?.cta || "Try free for 7 days";

    // Generate ads for each platform
    const generatePlatformAds = async (
      platform: "x" | "instagram" | "tiktok",
      count: number
    ): Promise<any[]> => {
      const constraints = PLATFORM_CONSTRAINTS[platform];
      const platformName = platform === "x" ? "X (Twitter)" : platform === "instagram" ? "Instagram" : "TikTok";

      const adPrompt = `
You are an expert ad copywriter for EchoFlux.ai.

${BRAND_VOICE}

APPROVED CLAIMS (use only these):
${APPROVED_CLAIMS.map((claim) => `- ${claim}`).join("\n")}

Important:
- Do NOT mention AI, artificial intelligence, or “AI-led”
- Do NOT mention machine learning or automation

${appContextSummary ? `APP CONTEXT SUMMARY:\n${appContextSummary}\n` : ""}

STRATEGY BRIEF:
- Objective: ${finalObjective}
- Target Audience: ${finalTargetAudience}
- Key Message: ${finalKeyMessage}
- Tone: ${finalTone}
- CTA: ${finalCta}

PLATFORM: ${platformName}
CONSTRAINTS:
- Character limit: ${constraints.characterLimit} characters ideal
- Hashtags: ${constraints.hashtags}
- Style: ${constraints.style}
- CTA: ${constraints.cta}

${screenshotUrl ? `SCREENSHOT AVAILABLE: An app screenshot is available and can be referenced in the ad copy.` : ""}

Generate ${count} unique ad variants that:
1. Align with brand voice
2. Use only approved claims
3. Follow platform constraints exactly
4. Target: ${finalTargetAudience}
5. Objective: ${finalObjective}
6. Include CTA: ${finalCta}
7. Are ready to post directly

${platform === "tiktok" ? "For TikTok, include a 'hook' field with the first 2-3 seconds hook." : ""}

Return ONLY valid JSON:
{
  "variants": [
    {
      "copy": "...",
      "characterCount": 180,
      ${platform === "tiktok" ? '"hook": "...",' : ""}
      "hashtags": ["#creator"],
      "cta": "${finalCta}"
    }
  ]
}
`;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: adPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const raw = result.response.text().trim();
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      
      return parsed.variants || [];
    };

    // Generate all platform ads in parallel
    const [xAds, instagramAds, tiktokAds] = await Promise.all([
      generatePlatformAds("x", 5),
      generatePlatformAds("instagram", 4),
      generatePlatformAds("tiktok", 3),
    ]);

    return res.status(200).json({
      strategyBrief,
      ads: {
        x: xAds,
        instagram: instagramAds,
        tiktok: tiktokAds,
      },
      screenshotUrl,
    });
  } catch (err: any) {
    console.error("generateAdCampaign error:", err);
    return res.status(500).json({
      error: "Failed to generate ad campaign",
      details: err?.message || String(err),
    });
  }
}
