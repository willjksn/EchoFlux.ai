/**
 * Fan storefront checkout APIs usually return JSON; dev proxy errors may return plain text.
 */
export async function readFanCheckoutFetchResult(res: Response): Promise<{
  ok: boolean;
  url?: string;
  error?: string;
}> {
  const text = await res.text();
  try {
    const data = text ? (JSON.parse(text) as { url?: string; error?: string }) : {};
    return {
      ok: res.ok,
      url: typeof data.url === "string" ? data.url : undefined,
      error:
        typeof data.error === "string" && data.error.trim()
          ? data.error.trim()
          : !res.ok
            ? `Request failed (${res.status})`
            : undefined,
    };
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 200);
    return {
      ok: res.ok,
      error: snippet || `Request failed (${res.status})`,
    };
  }
}
