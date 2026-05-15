import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebaseConfig";

/** Screenshots for support / contact forms (Storage: `users/{uid}/support_ticket/...`). */
export const FAN_SUPPORT_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
export const FAN_SUPPORT_SCREENSHOT_MAX_FILES = 4;

export async function uploadFanSupportScreenshot(uid: string, file: File): Promise<string> {
  const t = (file.type || "").toLowerCase();
  if (!t.startsWith("image/")) {
    throw new Error("Only image files are allowed for screenshots.");
  }
  if (file.size > FAN_SUPPORT_SCREENSHOT_MAX_BYTES) {
    throw new Error("Each image must be 5 MB or smaller.");
  }
  const ext =
    file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") ||
    (t.includes("png") ? "png" : t.includes("webp") ? "webp" : t.includes("gif") ? "gif" : "jpg");
  const path = `users/${uid}/support_ticket/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type || "image/jpeg" });
  return getDownloadURL(r);
}
