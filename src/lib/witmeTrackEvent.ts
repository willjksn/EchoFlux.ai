const WITME_VISITOR_KEY = "witmeVisitorId";

export const shouldUseWitmeApi = (): boolean => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("witmeApi") === "1") return true;
  const host = (window.location.hostname || "").toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  return !isLocalHost;
};

const getWitmeVisitorId = (): string => {
  if (typeof window === "undefined") return "";
  try {
    const current = window.localStorage.getItem(WITME_VISITOR_KEY);
    if (current) return current;
    const next = `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(WITME_VISITOR_KEY, next);
    return next;
  } catch {
    return "";
  }
};

export function trackWitmeEvent(eventName: string, meta?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (!shouldUseWitmeApi()) return;
  const payload = {
    eventName,
    path: window.location.pathname || "/",
    referrer: document.referrer || "",
    visitorId: getWitmeVisitorId(),
    meta: meta || {},
  };

  try {
    fetch("/api/witmeTrackEvent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
