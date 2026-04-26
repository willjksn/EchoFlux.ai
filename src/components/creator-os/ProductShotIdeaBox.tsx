import React, { useMemo, useState } from "react";
import { auth } from "../../../firebaseConfig";
import type { AmazonLink, CreatorOSSettings } from "../../types/creatorOS";

type Props = {
  settings: CreatorOSSettings;
  amazonLinks: AmazonLink[];
  onSaveAsIdea?: (idea: string) => void;
};

type GenerateTextResponse = {
  text?: string;
  caption?: string;
  error?: string;
  note?: string;
};

type ProductContextResponse = {
  success?: boolean;
  productContext?: string;
  note?: string;
  error?: string;
};

function audienceLabel(audience: CreatorOSSettings["primaryAudience"]): string {
  if (audience === "mostly_women") return "mostly women";
  if (audience === "mixed") return "a mixed audience";
  return "mostly men";
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

export const ProductShotIdeaBox: React.FC<Props> = ({ settings, amazonLinks, onSaveAsIdea }) => {
  const [product, setProduct] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [researching, setResearching] = useState(false);
  const [error, setError] = useState("");
  const [researchNote, setResearchNote] = useState("");

  const productSuggestions = useMemo(
    () => amazonLinks.slice(0, 10).map((link) => link.productName).filter(Boolean),
    [amazonLinks],
  );

  const matchedSavedLink = useMemo(() => {
    const cleanProduct = product.trim().toLowerCase();
    const cleanUrl = normalizeUrl(productUrl).toLowerCase();
    if (!cleanProduct && !cleanUrl) return null;
    return amazonLinks.find((link) => {
      const name = link.productName.toLowerCase();
      const url = normalizeUrl(link.amazonUrl).toLowerCase();
      return (
        (!!cleanProduct && (name.includes(cleanProduct) || cleanProduct.includes(name))) ||
        (!!cleanUrl && !!url && (url === cleanUrl || url.includes(cleanUrl) || cleanUrl.includes(url)))
      );
    }) || null;
  }, [amazonLinks, product, productUrl]);

  const generateIdea = async () => {
    const cleanProduct = product.trim();
    const cleanProductUrl = normalizeUrl(productUrl);
    if (!cleanProduct && !cleanProductUrl) {
      setError("Enter the product or paste a product link first.");
      return;
    }

    setLoading(true);
    setResearching(Boolean(cleanProductUrl));
    setError("");
    setResearchNote("");
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const savedProductContext = amazonLinks
        .filter((link) => {
          const name = link.productName.toLowerCase();
          const url = normalizeUrl(link.amazonUrl).toLowerCase();
          const productMatch = !!cleanProduct && (name.includes(cleanProduct.toLowerCase()) || cleanProduct.toLowerCase().includes(name));
          const urlMatch = !!cleanProductUrl && !!url && (url === cleanProductUrl.toLowerCase() || url.includes(cleanProductUrl.toLowerCase()) || cleanProductUrl.toLowerCase().includes(url));
          return productMatch || urlMatch;
        })
        .slice(0, 3)
        .map((link) => `${link.productName} (${link.category}) - ${link.bestContentSituation || link.audienceFit || "No notes yet"} - ${link.amazonUrl}`)
        .join("\n");
      const productNameForPrompt = cleanProduct || matchedSavedLink?.productName || hostLabel(cleanProductUrl) || "the linked product";
      let safeProductContext = "";
      if (cleanProductUrl) {
        try {
          const contextResponse = await fetch(new URL("/api/creator-os/product-context", window.location.origin).toString(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              product: productNameForPrompt,
              productUrl: cleanProductUrl,
            }),
          });
          const contextData = await contextResponse.json() as ProductContextResponse;
          if (contextResponse.ok && contextData.success && contextData.productContext) {
            safeProductContext = contextData.productContext;
            setResearchNote("Used safe public search snippets for product context. No Amazon page scraping.");
          } else {
            setResearchNote(contextData.note || contextData.error || "Using product name/link only. No page scraping was used.");
          }
        } catch {
          setResearchNote("Using product name/link only. Product research was unavailable and no page scraping was used.");
        } finally {
          setResearching(false);
        }
      }

      const response = await fetch(new URL("/api/generateText", window.location.origin).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt: `Create one natural, easy product shot idea for Creator OS.

Creator audience: ${audienceLabel(settings.primaryAudience)}
Creator tone: ${settings.brandTone || "casual, natural, not salesy"}
Product: ${productNameForPrompt}
Product link: ${cleanProductUrl || matchedSavedLink?.amazonUrl || "No product link provided."}
Link host: ${hostLabel(cleanProductUrl || matchedSavedLink?.amazonUrl || "") || "unknown"}
Extra context from creator: ${context.trim() || "No extra context."}
Saved product notes:
${savedProductContext || "No matching saved product notes."}
Safe public product context from search snippets:
${safeProductContext || "No extra public product context available."}

The creator needs help with the Story/Amazon step after the public post. The shot must feel natural to mostly male followers and should not look like a hard ad.

Return this exact structure:
Shot idea:
One quick realistic photo/video idea the creator can shoot today.

How to shoot it:
3 short steps. Include framing, where the product appears, and what the creator is doing naturally.

Story text:
3 short Instagram Story lines that create curiosity and make the product link feel casual.

Caption/overlay:
One short on-screen text line.

Why it works:
One sentence explaining why this feels natural for the audience.

Rules:
- Make it specific to the product.
- If a product link is provided, use only the URL, saved product notes, and safe public search snippet summary above. Do not claim you opened, scraped, or inspected the product page.
- Do not mention prices, ratings, shipping, availability, or product claims unless they are explicitly present in the safe public context.
- Keep it easy: phone camera, normal room/car/desk/bathroom/kitchen setup.
- No corporate ad language.
- No explicit sexual content.
- Do not tell her to hold the product like an influencer ad unless that is truly the natural move.
- Make it useful, relaxed, and believable.`,
          context: {
            goal: "product shot idea",
            tone: "casual",
            platforms: ["Instagram Story", "Instagram Reel", "TikTok"],
          },
          emojiEnabled: false,
        }),
      });

      const data = await response.json() as GenerateTextResponse;
      if (!response.ok || data.error) {
        throw new Error(data.note || data.error || "AI could not create a shot idea.");
      }

      setResult((data.text || data.caption || "").trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI could not create a shot idea.");
    } finally {
      setLoading(false);
      setResearching(false);
    }
  };

  const copyResult = async () => {
    if (!result) return;
    await navigator.clipboard?.writeText(result).catch(() => undefined);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-primary-100 bg-gradient-to-r from-primary-50 via-white to-amber-50 p-4 text-gray-900 dark:border-gray-700 dark:from-gray-900 dark:via-gray-900 dark:to-primary-950/20 dark:text-white">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 dark:text-primary-300">AI product shot helper</p>
        <h2 className="mt-1 text-xl font-bold">Need a Natural Product Shot?</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-600 dark:text-gray-300">
          Enter the product and Gemini will give you one quick, natural photo/video idea for the Story/Amazon step.
        </p>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
            Product
            <input
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              list="creator-os-product-shot-products"
              placeholder="e.g. men grooming kit, car organizer, desk light"
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-900 outline-none ring-primary-500/20 focus:ring-4 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
            />
          </label>
          <datalist id="creator-os-product-shot-products">
            {productSuggestions.map((name) => <option key={name} value={name} />)}
          </datalist>

          <label className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
            Product link <span className="font-normal text-gray-500">(optional)</span>
            <input
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="Paste Amazon, a.co, or product page URL"
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-900 outline-none ring-primary-500/20 focus:ring-4 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
            />
          </label>
          {matchedSavedLink ? (
            <p className="rounded-xl bg-emerald-50 p-2 text-xs font-medium text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-200">
              Using saved library context for {matchedSavedLink.productName}.
            </p>
          ) : null}
          {researchNote ? (
            <p className="rounded-xl bg-blue-50 p-2 text-xs font-medium text-blue-700 dark:bg-blue-900/25 dark:text-blue-200">
              {researchNote}
            </p>
          ) : null}

          <label className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
            Optional context
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              placeholder="e.g. I just posted a public selfie/car clip and need a casual Story link shot."
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-900 outline-none ring-primary-500/20 focus:ring-4 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
            />
          </label>

          {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">{error}</p> : null}

          <button
            type="button"
            onClick={generateIdea}
            disabled={loading}
            className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60"
          >
            {researching ? "Researching safely..." : loading ? "Creating shot idea..." : "AI Help Me Shoot This"}
          </button>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-200">
          {result ? (
            <>
              <pre className="whitespace-pre-wrap font-sans leading-relaxed">{result}</pre>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <button type="button" onClick={copyResult} className="rounded-lg bg-white px-3 py-2 text-primary-600 ring-1 ring-gray-200 hover:bg-primary-50 dark:bg-gray-800 dark:ring-gray-700">
                  Copy idea
                </button>
                {onSaveAsIdea ? (
                  <button type="button" onClick={() => onSaveAsIdea(result)} className="rounded-lg bg-white px-3 py-2 text-emerald-600 ring-1 ring-gray-200 hover:bg-emerald-50 dark:bg-gray-800 dark:ring-gray-700">
                    Save as content idea
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[180px] items-center justify-center rounded-xl border border-dashed border-primary-200 bg-primary-50/60 p-5 text-center text-primary-900 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-100">
              The idea will show here with the shot, Story text, overlay, and why it works.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
