import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";

export type AiJobStatus = "queued" | "processing" | "completed" | "failed";

export async function enqueueAiJob(params: {
  userId: string;
  jobType: string;
  payload: any;
}): Promise<string> {
  const db = getAdminDb();
  const now = Timestamp.now();
  const ref = await db.collection("ai_jobs").add({
    userId: params.userId,
    jobType: params.jobType,
    payload: params.payload,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateAiJob(jobId: string, data: Record<string, any>) {
  const db = getAdminDb();
  await db.collection("ai_jobs").doc(jobId).set(
    {
      ...data,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function processAiJob<T>(
  jobId: string,
  handler: () => Promise<T>
): Promise<void> {
  try {
    await updateAiJob(jobId, { status: "processing" });
    const result = await handler();
    await updateAiJob(jobId, { status: "completed", result });
  } catch (error: any) {
    await updateAiJob(jobId, {
      status: "failed",
      error: error?.message || String(error),
    });
  }
}
