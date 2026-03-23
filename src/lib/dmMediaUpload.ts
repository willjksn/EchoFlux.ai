import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebaseConfig";

export type DmAttachmentKind = "image" | "video" | "audio";

export function inferDmAttachmentKind(file: File): DmAttachmentKind {
  const t = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  /** Safari / some browsers use video/mp4 container for mic-only MediaRecorder. */
  if (name.startsWith("voice-") && t.startsWith("video/")) return "audio";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (/\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name)) return "image";
  if (/\.(mp4|webm|mov|m4v)$/i.test(name)) return "video";
  if (/\.(webm|ogg|mp3|m4a|wav|aac)$/i.test(name)) return "audio";
  return "image";
}

/**
 * Fan Hub DM attachments — path under `users/{uid}/**` (Storage rules: owner write).
 */
export async function uploadFanDmAttachment(
  uid: string,
  file: File
): Promise<{ url: string; attachmentType: DmAttachmentKind }> {
  const attachmentType = inferDmAttachmentKind(file);
  const ext =
    file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") ||
    (attachmentType === "audio" ? "webm" : attachmentType === "video" ? "mp4" : "jpg");
  const path = `users/${uid}/fanhub_dm/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type || undefined });
  const url = await getDownloadURL(r);
  return { url, attachmentType };
}
