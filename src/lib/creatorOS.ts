import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";
import type {
  AmazonLink,
  ContentIdea,
  ContentLane,
  CreatorOSPrimaryAudience,
  CreatorOSSettings,
  CreatorOSTrend,
  FunnelGoal,
  InnerCircleFunnel,
  PlatformTarget,
  TodaysMove,
  TodaysMoveChecklistItem,
  WeeklyPlan,
  WeeklyPlanDay,
  WeeklyPlanDayKey,
} from "../types/creatorOS";

export const CONTENT_LANE_LABELS: Record<ContentLane, string> = {
  smirk_curiosity: "Smirk / Curiosity",
  relatable_real_life: "Relatable / Real Life",
  car_driving: "Car / Driving",
  lifestyle: "Lifestyle",
  talking_personality: "Talking / Personality",
  amazon_soft_mention: "Amazon Soft Mention",
  inner_circle_tease: "Inner Circle Tease",
};

export const PLATFORM_LABELS: Record<PlatformTarget, string> = {
  instagram_reel: "Instagram Reel",
  instagram_story: "Instagram Story",
  tiktok: "TikTok",
  inner_circle: "Inner Circle",
  amazon_storefront: "Amazon Storefront",
};

export const FUNNEL_GOAL_LABELS: Record<FunnelGoal, string> = {
  grow_attention: "Grow attention",
  drive_story_clicks: "Drive story clicks",
  drive_inner_circle_subscribers: "Drive Inner Circle subscribers",
  retain_subscribers: "Retain subscribers",
  sell_treat: "Sell Treat",
  test_product_interest: "Test product interest",
};

export const CONTENT_IDEA_STATUS_LABELS: Record<ContentIdea["status"], string> = {
  ideas: "Ideas",
  to_film: "To Film",
  ready_to_post: "Ready to Post",
  posted: "Posted",
  monetized: "Monetized",
  review: "Review",
};

export const CONTENT_IDEA_STATUSES = Object.keys(CONTENT_IDEA_STATUS_LABELS) as ContentIdea["status"][];

export const AMAZON_CATEGORIES = [
  "Car / Driving",
  "Desk / Work",
  "Random but Useful",
  "Self-Upgrade",
  "Summer / Lifestyle",
  "Home / Everyday",
];

const defaultBrandTone = "quiet, observant, slightly sarcastic, calm, confident, not overly salesy";

export function defaultCreatorOSSettings(): CreatorOSSettings {
  return {
    primaryGoal: "story_clicks",
    primaryAudience: "mostly_men",
    preferredLanes: ["smirk_curiosity", "car_driving", "amazon_soft_mention", "inner_circle_tease"],
    availableTime: "15_minutes",
    monetizationPaths: ["amazon_links", "inner_circle_subscriptions", "treats"],
    weeklyPublicPostsTarget: 4,
    weeklyStoriesTarget: 6,
    weeklyInnerCircleDropsTarget: 3,
    weeklyAmazonLinksTarget: 3,
    brandTone: defaultBrandTone,
    filmingDays: ["monday", "thursday", "saturday"],
    mainMonetization: ["amazon_links", "inner_circle_subscriptions"],
  };
}

export const DEFAULT_INNER_CIRCLE_FUNNEL: InnerCircleFunnel = {
  welcomeScript: `Okay... so if you're here, you were curious. And instead of just watching, you clicked. I like that.

This isn't going to be louder than my IG. It's just closer.

Same me, just not filtered the same way.

I'll post here a few times a week - random moments, car talks, things I don't put anywhere else.

Nothing forced. Nothing fake.

Just me, without thinking too much about it.

Just don't make it weird... and we're good.`,
  first48HourPlan: [
    "Post 1: Real life / unfiltered",
    "Post 2: Slightly closer / intentional",
    "Post 3: Voice note or personality thought",
  ],
  weeklyRetentionPlan: ["1 real-life drop", "1 closer drop", "1 personality/voice/thought post"],
  treatUpsellIdeas: [
    "Voice note reply",
    "1:1 text chat",
    "Custom video message",
    "Personal shoutout",
    "Scheduled video call",
  ],
};

function creatorOSCollection(uid: string, name: string) {
  return collection(db, "users", uid, "creatorOS", name, "items");
}

function creatorOSProfileDoc(uid: string, name: string) {
  return doc(db, "users", uid, "creatorOS", name, "profile", "current");
}

function weekStartId(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function todaysDateId(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function withId<T extends { id: string }>(id: string, data: Record<string, unknown>): T {
  return { id, ...data } as T;
}

export async function getCreatorOSSettings(uid: string): Promise<CreatorOSSettings | null> {
  const snap = await getDoc(creatorOSProfileDoc(uid, "settings"));
  return snap.exists() ? (snap.data() as CreatorOSSettings) : null;
}

export async function saveCreatorOSSettings(uid: string, settings: CreatorOSSettings): Promise<void> {
  const ref = creatorOSProfileDoc(uid, "settings");
  const existing = await getDoc(ref);
  await setDoc(
    ref,
    {
      ...settings,
      createdAt: existing.exists() ? existing.data().createdAt ?? serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function listContentIdeas(uid: string): Promise<ContentIdea[]> {
  const snap = await getDocs(query(creatorOSCollection(uid, "contentIdeas"), orderBy("updatedAt", "desc"), limit(100)));
  return snap.docs.map((d) => withId<ContentIdea>(d.id, d.data()));
}

export async function createContentIdea(uid: string, idea: Omit<ContentIdea, "id">): Promise<ContentIdea> {
  const ref = await addDoc(creatorOSCollection(uid, "contentIdeas"), {
    ...idea,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { ...idea, id: ref.id };
}

export async function updateContentIdea(uid: string, ideaId: string, updates: Partial<ContentIdea>): Promise<void> {
  await updateDoc(doc(creatorOSCollection(uid, "contentIdeas"), ideaId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteContentIdea(uid: string, ideaId: string): Promise<void> {
  await deleteDoc(doc(creatorOSCollection(uid, "contentIdeas"), ideaId));
}

export async function listAmazonLinks(uid: string): Promise<AmazonLink[]> {
  const snap = await getDocs(query(creatorOSCollection(uid, "amazonLinks"), orderBy("updatedAt", "desc"), limit(100)));
  return snap.docs.map((d) => withId<AmazonLink>(d.id, d.data()));
}

export async function createAmazonLink(uid: string, link: Omit<AmazonLink, "id">): Promise<AmazonLink> {
  const ref = await addDoc(creatorOSCollection(uid, "amazonLinks"), {
    ...link,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { ...link, id: ref.id };
}

export async function updateAmazonLink(uid: string, linkId: string, updates: Partial<AmazonLink>): Promise<void> {
  await updateDoc(doc(creatorOSCollection(uid, "amazonLinks"), linkId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAmazonLink(uid: string, linkId: string): Promise<void> {
  await deleteDoc(doc(creatorOSCollection(uid, "amazonLinks"), linkId));
}

export async function listCreatorOSTrends(uid: string): Promise<CreatorOSTrend[]> {
  const snap = await getDocs(query(creatorOSCollection(uid, "trends"), orderBy("updatedAt", "desc"), limit(50)));
  return snap.docs.map((d) => withId<CreatorOSTrend>(d.id, d.data()));
}

export async function saveCreatorOSTrend(uid: string, trend: CreatorOSTrend): Promise<void> {
  await setDoc(
    doc(creatorOSCollection(uid, "trends"), trend.id),
    { ...trend, createdAt: trend.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function updateCreatorOSTrend(uid: string, trendId: string, updates: Partial<CreatorOSTrend>): Promise<void> {
  await updateDoc(doc(creatorOSCollection(uid, "trends"), trendId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function ignoreCreatorOSTrend(uid: string, trendId: string): Promise<void> {
  await updateCreatorOSTrend(uid, trendId, { status: "ignored" });
}

export async function turnTrendIntoContentIdea(uid: string, trend: CreatorOSTrend): Promise<ContentIdea> {
  const idea = await createContentIdea(uid, {
    title: trend.title,
    lane: trend.category.toLowerCase().includes("car") ? "car_driving" : "amazon_soft_mention",
    publicHook: trend.contentAngle || "why is this actually useful...",
    caption: "ok I get it now",
    platforms: ["instagram_story", "tiktok"],
    funnelGoal: "test_product_interest",
    amazonCategory: trend.category,
    storyText: trend.storyText,
    innerCircleTieIn: trend.innerCircleTieIn,
    notes: `Trend source: ${trend.sourceUrl}`,
    dueDate: "",
    status: "ideas",
  });
  await updateCreatorOSTrend(uid, trend.id, { status: "saved_to_ideas" });
  return idea;
}

export async function saveTrendToAmazonLibrary(uid: string, trend: CreatorOSTrend): Promise<AmazonLink> {
  const link = await createAmazonLink(uid, {
    productName: trend.title,
    category: trend.category,
    amazonUrl: trend.sourceUrl,
    audienceFit: trend.audienceFit,
    bestContentSituation: trend.contentAngle,
    ownershipStatus: trend.ownershipRecommendation,
    performanceStatus: "testing",
    notes: trend.innerCircleTieIn,
  });
  await updateCreatorOSTrend(uid, trend.id, { status: "saved_to_amazon_library" });
  return link;
}

export async function getCurrentWeeklyPlan(uid: string): Promise<WeeklyPlan | null> {
  const id = weekStartId();
  const snap = await getDoc(doc(creatorOSCollection(uid, "weeklyPlans"), id));
  return snap.exists() ? withId<WeeklyPlan>(snap.id, snap.data()) : null;
}

export async function saveWeeklyPlan(uid: string, plan: WeeklyPlan): Promise<void> {
  await setDoc(
    doc(creatorOSCollection(uid, "weeklyPlans"), plan.id || weekStartId()),
    { ...plan, id: plan.id || weekStartId(), updatedAt: serverTimestamp(), createdAt: plan.createdAt ?? serverTimestamp() },
    { merge: true },
  );
}

export async function getInnerCircleFunnel(uid: string): Promise<InnerCircleFunnel> {
  const snap = await getDoc(creatorOSProfileDoc(uid, "innerCircleFunnel"));
  return snap.exists() ? ({ ...DEFAULT_INNER_CIRCLE_FUNNEL, ...snap.data() } as InnerCircleFunnel) : DEFAULT_INNER_CIRCLE_FUNNEL;
}

export async function saveInnerCircleFunnel(uid: string, funnel: InnerCircleFunnel): Promise<void> {
  await setDoc(creatorOSProfileDoc(uid, "innerCircleFunnel"), { ...funnel, updatedAt: serverTimestamp() }, { merge: true });
}

function day(publicPost: string, storyLink: string, innerCircleDrop: string): WeeklyPlanDay {
  return {
    publicPost,
    storyLink,
    innerCircleDrop,
    completed: { publicPost: false, storyLink: false, innerCircleDrop: false },
  };
}

export function generateDefaultWeeklyPlan(
  settings: CreatorOSSettings,
  trends: CreatorOSTrend[] = [],
  amazonLinks: AmazonLink[] = [],
): WeeklyPlan {
  const carLink = amazonLinks.find((l) => l.category.toLowerCase().includes("car"))?.productName || "car product link";
  const usefulTrend = trends.find((t) => t.status !== "ignored")?.title || "random useful product";
  const wantsInnerCircle = settings.monetizationPaths.includes("inner_circle_subscriptions");

  return {
    id: weekStartId(),
    weekStartDate: weekStartId(),
    days: {
      monday: day("Relatable work/computer clip", "Desk or everyday item link", wantsInnerCircle ? "light tease" : "none"),
      tuesday: day("Smirk/curiosity clip", usefulTrend, "teaser"),
      wednesday: day("none or repost", "behind the scenes", "real-life drop"),
      thursday: day("car/driving clip", carLink, "car talk tease"),
      friday: day("controlled curiosity clip", "random useful link", "closer post"),
      saturday: day("lifestyle/outside/pool/car clip", "soft Inner Circle CTA", "optional lifestyle drop"),
      sunday: day("low-energy/real clip", "linked a few things", "voice note/thoughts"),
    },
  };
}

function pickLane(settings: CreatorOSSettings, dayOfWeek: string): ContentLane {
  if (dayOfWeek.toLowerCase().includes("thu") && settings.preferredLanes.includes("car_driving")) return "car_driving";
  if (settings.primaryGoal === "test_amazon_products" && settings.preferredLanes.includes("amazon_soft_mention")) return "amazon_soft_mention";
  return settings.preferredLanes[0] || "smirk_curiosity";
}

function audiencePhrase(audience: CreatorOSPrimaryAudience): string {
  if (audience === "mostly_men") return "mostly male followers";
  if (audience === "mostly_women") return "mostly female followers";
  return "a mixed audience";
}

export function generateTodaysMove(
  settings: CreatorOSSettings,
  weeklyPlan: WeeklyPlan | null,
  amazonLinks: AmazonLink[] = [],
  trends: CreatorOSTrend[] = [],
  dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" }),
): TodaysMove {
  const lane = pickLane(settings, dayOfWeek);
  const planDayKey = dayOfWeek.toLowerCase() as WeeklyPlanDayKey;
  const planDay = weeklyPlan?.days?.[planDayKey];
  const link =
    amazonLinks.find((l) => l.performanceStatus !== "retired" && l.category === planDay?.storyLink) ||
    amazonLinks.find((l) => l.performanceStatus === "proven") ||
    amazonLinks.find((l) => l.performanceStatus !== "retired");
  const trend = trends.find((t) => t.status === "new" || t.status === "tested");
  const isCar = lane === "car_driving";
  const hook = isCar ? "I spend too much time in here" : trend?.contentAngle || "why is this actually useful...";
  const suggestedAmazonCategory = link?.category || (isCar ? "Car / Driving" : trend?.category || "Random but Useful");
  const checklist: TodaysMoveChecklistItem[] = [
    { id: "film", label: "Film clip", completed: false },
    { id: "tiktok", label: "Post to TikTok", completed: false },
    { id: "ig", label: "Post to IG Reel", completed: false },
    { id: "story", label: "Add IG Story link", completed: false },
    { id: "inner", label: "Drop Inner Circle post", completed: false },
  ];

  return {
    id: todaysDateId(),
    date: todaysDateId(),
    publicPost: planDay?.publicPost || (isCar ? "Post a car/driving clip on IG Reels and TikTok." : "Post one curiosity clip on IG Reels and TikTok."),
    hook,
    caption: isCar ? "it's fine" : "ok I get it now",
    platforms: ["instagram_reel", "tiktok"],
    storyLinkPlan: trend?.storyText?.length
      ? trend.storyText
      : ["why is this actually useful...", "I didn't think I needed it", "ok... I get it now"],
    suggestedAmazonCategory,
    suggestedAmazonLinkId: link?.id,
    innerCircleDrop: planDay?.innerCircleDrop || (isCar ? "Post a short car-talk clip." : "Post the closer version inside Inner Circle."),
    innerCircleCaption: isCar ? "car talks are better on here anyway" : "this is the calm version... obviously",
    checklist,
    whyThisWorks: `This matches ${audiencePhrase(settings.primaryAudience)}, keeps the public post simple, then uses Stories and Inner Circle as the money path.`,
    completed: false,
  };
}

export async function saveTodaysMove(uid: string, todaysMove: TodaysMove): Promise<void> {
  await setDoc(
    doc(creatorOSCollection(uid, "todaysMoves"), todaysMove.id),
    { ...todaysMove, updatedAt: serverTimestamp(), createdAt: todaysMove.createdAt ?? serverTimestamp() },
    { merge: true },
  );
}

export async function markTodaysMoveItemDone(uid: string, dateId: string, checklistItemId: string): Promise<void> {
  const ref = doc(creatorOSCollection(uid, "todaysMoves"), dateId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const move = snap.data() as TodaysMove;
  const checklist = move.checklist.map((item) =>
    item.id === checklistItemId ? { ...item, completed: !item.completed } : item,
  );
  await updateDoc(ref, {
    checklist,
    completed: checklist.every((item) => item.completed),
    updatedAt: serverTimestamp(),
  });
}

export async function findAmazonProductTrends(uid: string, settings: CreatorOSSettings, categories?: string[]): Promise<CreatorOSTrend[]> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Please sign in to find trends.");
  const res = await fetch("/api/creator-os/amazon-trends", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      uid,
      primaryAudience: settings.primaryAudience,
      preferredLanes: settings.preferredLanes,
      monetizationPaths: settings.monetizationPaths,
      categories,
      brandTone: settings.brandTone,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Trend search is unavailable right now.");
  return Array.isArray(data.trends) ? (data.trends as CreatorOSTrend[]) : [];
}

export function isFlexibleAmazonUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

