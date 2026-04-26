import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "../_firebaseAdmin.js";
import { normalizePlanForLimits } from "../_planLimits.js";
import { enforceRateLimit } from "../_rateLimit.js";
import { searchWeb } from "../_webSearch.js";
import { verifyAuth } from "../verifyAuth.js";

function asString(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(www\.|amazon\.|amzn\.|a\.co)/i.test(value)) return `https://${value}`;
  return value;
}

function hostLabel(raw: string): string {
  try {
    return new URL(normalizeUrl(raw)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cleanProductTerms(raw: string): string {
  return raw
    .replace(/\b(ref|sr|qid|crid|keywords|dp|gp|product|www|amazon|com)\b/gi, " ")
    .replace(/%[0-9a-f]{2}/gi, " ")
    .replace(/[-_+/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function extractLikelyProductTerms(product: string, url: string): string {
  const fromProduct = product.trim();
  if (fromProduct && fromProduct.toLowerCase() !== "amazon.com") return cleanProductTerms(fromProduct);

  try {
    const parsed = new URL(normalizeUrl(url));
    const q = parsed.searchParams.get("k") || parsed.searchParams.get("keywords");
    if (q?.trim()) return cleanProductTerms(decodeURIComponent(q));

    const parts = parsed.pathname.split("/").filter(Boolean);
    const dpIndex = parts.findIndex((part) => part.toLowerCase() === "dp");
    const titlePart = dpIndex > 0 ? parts[dpIndex - 1] : parts.find((part) => /[a-z]/i.test(part) && part.length > 4);
    if (titlePart) return cleanProductTerms(decodeURIComponent(titlePart));
  } catch {
    // Fall through to host label.
  }

  return hostLabel(url) || "product";
}

function safeSnippet(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 280);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const product = asString(body.product).slice(0, 160);
  const productUrl = normalizeUrl(asString(body.productUrl).slice(0, 500));
  if (!product && !productUrl) {
    return res.status(400).json({ error: "product or productUrl is required" });
  }

  const db = getAdminDb();
  const userSnap = await db.collection("users").doc(decoded.uid).get();
  const userData = userSnap.data() || {};
  const userPlan = typeof userData.plan === "string" ? userData.plan : "Free";
  const userRole = typeof userData.role === "string" ? userData.role : "";
  const normalizedPlan = normalizePlanForLimits(userPlan);
  const hasAccess = userRole === "Admin" || normalizedPlan === "Pro" || normalizedPlan === "Elite" || userPlan === "Agency";

  if (!hasAccess) {
    return res.status(403).json({ error: "Creator OS product research is available on Pro and Elite." });
  }

  const allowed = await enforceRateLimit({
    req,
    res,
    keyPrefix: "creator-os-product-context",
    limit: 12,
    windowMs: 60 * 60 * 1000,
    identifier: decoded.uid,
  });
  if (!allowed) return;

  const terms = extractLikelyProductTerms(product, productUrl);
  const host = hostLabel(productUrl);
  const query = `"${terms}" product details use case${host ? ` ${host}` : ""}`;

  const result = await searchWeb(query, decoded.uid, userPlan, userRole, {
    allowQuotaUserTrendSearch: true,
    maxResults: 4,
    searchDepth: "basic",
  });

  if (!result.success || result.results.length === 0) {
    return res.status(200).json({
      success: false,
      note: result.note || "Could not find safe public product context. The shot helper can still use the product name and link.",
      productContext: "",
      sources: [],
    });
  }

  const sources = result.results.slice(0, 4).map((item) => ({
    title: safeSnippet(item.title),
    host: hostLabel(item.link),
    url: item.link,
    snippet: safeSnippet(item.snippet),
  }));

  const productContext = sources
    .map((source, index) => `${index + 1}. ${source.title}${source.host ? ` (${source.host})` : ""}: ${source.snippet}`)
    .join("\n");

  return res.status(200).json({
    success: true,
    detectedProductName: terms,
    productContext,
    sources,
    note: "Product context uses public search snippets only. It does not scrape Amazon pages or expose private data.",
  });
}
