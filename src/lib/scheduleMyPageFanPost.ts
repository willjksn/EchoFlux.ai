import { addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { isScheduleTimeInFuture, localCalendarDateFromDate } from "./localDateTimeInput";

export type ScheduleMyPageFanPostInput = {
  creatorId: string;
  body: string;
  mediaUrls?: string[];
  mediaTypes?: ("image" | "video")[];
  audioUrls?: string[];
  scheduledAt: Date;
};

/** Write a scheduled My Page post to `creators/{creatorId}/fanPosts` for cron auto-publish. */
export async function scheduleMyPageFanPost(
  db: Firestore,
  input: ScheduleMyPageFanPostInput,
): Promise<{ fanPostId: string }> {
  const scheduledAt = input.scheduledAt;
  if (!(scheduledAt instanceof Date) || !Number.isFinite(scheduledAt.getTime())) {
    throw new Error("Invalid scheduledAt");
  }
  if (!isScheduleTimeInFuture(scheduledAt)) {
    throw new Error("Scheduled time must be at least one minute from now");
  }

  const mediaUrls = (input.mediaUrls ?? []).filter((u) => typeof u === "string" && u.trim());
  const mediaTypes =
    input.mediaTypes && input.mediaTypes.length > 0
      ? input.mediaTypes
      : mediaUrls.map(() => "image" as const);
  const audioUrls = (input.audioUrls ?? []).filter((u) => typeof u === "string" && u.trim());

  const calendarDate = localCalendarDateFromDate(scheduledAt);
  const calendarTime = scheduledAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const postData: Record<string, unknown> = {
    creatorId: input.creatorId,
    body: input.body.trim(),
    mediaUrls,
    mediaTypes,
    audioUrls,
    status: "scheduled",
    scheduledAt: Timestamp.fromDate(scheduledAt),
    calendarDate,
    calendarTime,
    hideLikeCounts: false,
    hideComments: false,
    hideLikes: false,
    showTipButton: true,
    likeCount: 0,
    likedBy: [],
    comments: [],
    source: "compose_schedule",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const postRef = await addDoc(collection(db, "creators", input.creatorId, "fanPosts"), postData);
  return { fanPostId: postRef.id };
}
