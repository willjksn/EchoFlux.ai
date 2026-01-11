import { auth, db } from "../../firebaseConfig";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export type UsageEventType =
  | "monetized_onboarding_viewed"
  | "monetized_mode_enabled"
  | "monetized_onboarding_completed"
  | "onlyfans_studio_opened"
  | "of_generate_captions"
  | "of_generate_weekly_plan"
  | "of_generate_monetization_plan"
  | "of_generate_teaser_pack"
  | "of_generate_subscriber_messages";

export async function logUsageEvent(
  userId: string,
  eventType: UsageEventType,
  props?: Record<string, any>
): Promise<void> {
  if (!userId) return;

  // Best-effort only — never block UX if auth isn't ready
  try {
    // Ensure user is signed in (helps avoid confusing permission issues)
    if (!auth.currentUser) return;

    await addDoc(collection(db, "users", userId, "usage_events"), {
      eventType,
      props: props || {},
      ts: serverTimestamp(),
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    // Swallow errors to keep core UX safe
    if (process.env.NODE_ENV === "development") {
      console.warn("logUsageEvent failed:", eventType, e);
    }
  }
}

export async function logUsageEventOncePerDay(
  userId: string,
  eventType: UsageEventType,
  props?: Record<string, any>,
  storageKeyPrefix: string = "usageEventOncePerDay"
): Promise<void> {
  try {
    const dayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `${storageKeyPrefix}:${userId}:${eventType}:${dayKey}`;
    if (typeof window !== "undefined" && window.localStorage) {
      if (localStorage.getItem(key) === "1") return;
      localStorage.setItem(key, "1");
    }
  } catch {
    // ignore localStorage issues
  }

  await logUsageEvent(userId, eventType, props);
}


