import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";

const fallbackImage = "https://witme.io/witme-og.png";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeHandle(input: string): string {
  return decodeURIComponent(input).replace(/^@+/, "").trim().toLowerCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const rawHandle = typeof req.query.handle === "string" ? req.query.handle : "";
  const handle = normalizeHandle(rawHandle);
  if (!handle) {
    res.status(400).send("Missing handle");
    return;
  }

  let displayName = handle;
  let ogImage = fallbackImage;

  try {
    const db = getAdminDb();
    const handleDoc = await db.collection("creatorHandles").doc(handle).get();
    const creatorId = (handleDoc.data() as { creatorId?: string } | undefined)?.creatorId;

    if (creatorId) {
      const creatorDoc = await db.collection("creators").doc(creatorId).get();
      const creator = creatorDoc.data() as Record<string, unknown> | undefined;
      if (creator) {
        const nameCandidate =
          (typeof creator.displayName === "string" && creator.displayName.trim()) ||
          (typeof creator.handle === "string" && creator.handle.trim()) ||
          handle;
        displayName = nameCandidate.replace(/^@+/, "").trim();

        const imageCandidate =
          (typeof creator.heroImage === "string" && creator.heroImage.trim()) ||
          (typeof creator.heroImageUrl === "string" && creator.heroImageUrl.trim()) ||
          (typeof creator.avatar === "string" && creator.avatar.trim()) ||
          (typeof creator.avatarUrl === "string" && creator.avatarUrl.trim()) ||
          (typeof creator.logo === "string" && creator.logo.trim()) ||
          (typeof creator.logoUrl === "string" && creator.logoUrl.trim()) ||
          "";
        if (imageCandidate) ogImage = imageCandidate;
      }
    }
  } catch (error) {
    console.error("ogCreatorPreview", error);
  }

  const title = `${displayName} (@${handle}) | witme.io`;
  const description = `View @${handle}'s creator page on witme.io.`;
  const canonical = `https://witme.io/${encodeURIComponent(handle)}`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />

    <meta property="og:type" content="profile" />
    <meta property="og:site_name" content="witme.io" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta property="og:image:alt" content="${escapeHtml(displayName)} on witme.io" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
  </head>
  <body>
    <p>${escapeHtml(title)}</p>
  </body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
  res.status(200).send(html);
}
