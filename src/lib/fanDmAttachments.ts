import type { FanDmMessage } from "../../types";
import type { DmAttachmentKind } from "./dmMediaUpload";

export const DM_MAX_ATTACHMENTS_PER_MESSAGE = 10;

export type DmAttachmentItem = { url: string; type: DmAttachmentKind };

/** Some proxies / runtimes turn JSON arrays into `{ "0": {...}, "1": {...} }`. */
function attachmentArrayCandidates(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 0) return [];
    const allNumeric = keys.every((k) => /^\d+$/.test(k));
    if (allNumeric) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => o[k]);
    }
  }
  return [];
}

function parseAttachmentKindField(raw: unknown): DmAttachmentKind | null {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "image" || v === "video" || v === "audio") return v;
  return null;
}

function attachmentUrlFromItem(o: Record<string, unknown>): string {
  const u = o.url;
  const alt = o.attachmentUrl;
  if (typeof u === "string" && u.trim()) return u.trim();
  if (typeof alt === "string" && alt.trim()) return alt.trim();
  return "";
}

function attachmentItemFromUnknown(item: unknown): DmAttachmentItem | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const url = attachmentUrlFromItem(o);
  const t =
    parseAttachmentKindField(o.type) ?? parseAttachmentKindField(o.attachmentType);
  if (!url || !t) return null;
  return { url, type: t };
}

export function parseIncomingFanDmAttachments(body: Record<string, unknown>): DmAttachmentItem[] {
  const list: DmAttachmentItem[] = [];
  const candidates = attachmentArrayCandidates(body.attachments);
  for (const item of candidates) {
    const parsed = attachmentItemFromUnknown(item);
    if (!parsed) continue;
    list.push(parsed);
    if (list.length >= DM_MAX_ATTACHMENTS_PER_MESSAGE) break;
  }
  if (list.length === 0) {
    const attachmentUrl = typeof body.attachmentUrl === "string" ? body.attachmentUrl.trim() : "";
    const attachmentTypeRaw = body.attachmentType;
    const attachmentType =
      attachmentTypeRaw === "image" || attachmentTypeRaw === "video" || attachmentTypeRaw === "audio"
        ? attachmentTypeRaw
        : undefined;
    if (attachmentUrl && attachmentType) list.push({ url: attachmentUrl, type: attachmentType });
  }
  return list;
}

export function previewTextForFanDmAttachments(contentTrimmed: string, attachments: DmAttachmentItem[]): string {
  const c = contentTrimmed.slice(0, 100);
  if (c) return c;
  if (!attachments.length) return "";
  const imgs = attachments.filter((a) => a.type === "image").length;
  const vids = attachments.filter((a) => a.type === "video").length;
  const auds = attachments.filter((a) => a.type === "audio").length;
  const parts: string[] = [];
  if (imgs) parts.push(imgs === 1 ? "📷 Photo" : `📷 ${imgs} photos`);
  if (vids) parts.push(vids === 1 ? "🎬 Video" : `🎬 ${vids} videos`);
  if (auds) parts.push(auds === 1 ? "🎤 Voice message" : `🎤 ${auds} voice messages`);
  return parts.join(" · ") || "Attachment";
}

/** Normalize Firestore message doc fields for API / client (legacy single + new `attachments` array). */
export function firestoreDataToMessageAttachmentFields(data: Record<string, unknown>): {
  attachmentUrl?: string;
  attachmentType?: DmAttachmentKind;
  attachments?: DmAttachmentItem[];
} {
  const fromArray: DmAttachmentItem[] = [];
  const candidates = attachmentArrayCandidates(data.attachments);
  for (const item of candidates) {
    const parsed = attachmentItemFromUnknown(item);
    if (parsed) fromArray.push(parsed);
  }

  const legacyUrl = typeof data.attachmentUrl === "string" ? data.attachmentUrl.trim() : "";
  const legacyType =
    data.attachmentType === "image" || data.attachmentType === "video" || data.attachmentType === "audio"
      ? data.attachmentType
      : undefined;

  if (fromArray.length > 1) {
    return { attachments: fromArray };
  }
  if (fromArray.length === 1) {
    return {
      attachmentUrl: fromArray[0].url,
      attachmentType: fromArray[0].type,
      attachments: fromArray,
    };
  }
  if (legacyUrl && legacyType) {
    return { attachmentUrl: legacyUrl, attachmentType: legacyType };
  }
  if (legacyUrl) {
    return { attachmentUrl: legacyUrl, attachmentType: legacyType || "image" };
  }
  return {};
}

export function getMessageAttachments(m: FanDmMessage): DmAttachmentItem[] {
  if (Array.isArray(m.attachments) && m.attachments.length > 0) {
    const out: DmAttachmentItem[] = [];
    for (const a of m.attachments) {
      if (!a?.url?.trim()) continue;
      if (a.type === "image" || a.type === "video" || a.type === "audio") {
        out.push({ url: a.url.trim(), type: a.type });
      }
    }
    if (out.length) return out;
  }
  if (m.attachmentUrl?.trim()) {
    const t = m.attachmentType;
    if (t === "image" || t === "video" || t === "audio") {
      return [{ url: m.attachmentUrl.trim(), type: t }];
    }
    return [{ url: m.attachmentUrl.trim(), type: "image" }];
  }
  return [];
}

export function attachmentsSignature(m: FanDmMessage): string {
  return getMessageAttachments(m)
    .map((a) => `${a.type}:${a.url}`)
    .join("|");
}
