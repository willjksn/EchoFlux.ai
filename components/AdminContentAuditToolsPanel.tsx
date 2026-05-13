import React, { useCallback, useEffect, useState } from "react";
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
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAppContext } from "./AppContext";
import {
  ADMIN_CONTENT_AUDIT_EVENTS_COLLECTION,
  type AdminContentAuditAction,
} from "../src/lib/adminContentAudit";
import { isProtectedLockedMediaUrl } from "../src/lib/lockedPostMedia";

type InlineMediaType = "image" | "video" | "audio";

type AuditPreviewRow = {
  id: string;
  creatorId?: string;
  collection: "fanPost" | "composePost";
  status: string;
  preview: string;
  createdMs: number;
  /** True when the post may hide full URLs on the fanPosts doc until fanPostPrivateMedia is read. */
  lockedLike?: boolean;
  /** Public-doc media (teasers when locked); excludes protected:// placeholders. */
  inlineMediaUrls: string[];
  inlineMediaTypes: InlineMediaType[];
};

function str(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim();
}

function postPreview(data: Record<string, unknown>): string {
  const body =
    str(data.body) ||
    str(data.content) ||
    str(data.text) ||
    str(data.textContent) ||
    str(data.caption) ||
    str(data.overlayText);
  const oneLine = body.replace(/\s+/g, " ").trim();
  if (!oneLine) return "(no text body)";
  return oneLine.length > 220 ? `${oneLine.slice(0, 220)}…` : oneLine;
}

function normalizeStatus(raw: Record<string, unknown>): string {
  const s = str(raw.status).toLowerCase();
  if (s) return s;
  if (raw.publishedAt || raw.publishAt) return "published";
  return "unknown";
}

function readCreatedMs(raw: Record<string, unknown>): number {
  const c = raw.createdAt as { toMillis?: () => number } | undefined;
  if (c?.toMillis) return Number(c.toMillis()) || 0;
  const t = raw.createdAt;
  if (typeof t === "string") {
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof t === "number" && Number.isFinite(t)) return t;
  return 0;
}

function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u.trim());
}

function isLockedLikeFanPost(raw: Record<string, unknown>): boolean {
  const lc = raw.lockedContent as { enabled?: boolean } | undefined;
  if (lc && typeof lc === "object" && lc.enabled === true) return true;
  return str(raw.dropVisibility).toLowerCase() === "locked";
}

/** Media pairs from the snapshot we already queried (Composer uses single mediaUrl). */
function readInlineMediaPairs(
  raw: Record<string, unknown>,
  coll: AuditPreviewRow["collection"],
): { urls: string[]; types: InlineMediaType[] } {
  if (coll === "composePost") {
    const url = str(raw.mediaUrl);
    if (!url || isProtectedLockedMediaUrl(url) || !isHttpUrl(url))
      return { urls: [], types: [] };
    const mt = str(raw.mediaType).toLowerCase();
    const kind: InlineMediaType = mt === "video" ? "video" : mt === "audio" ? "audio" : "image";
    return { urls: [url], types: [kind] };
  }
  const rawUrls = Array.isArray(raw.mediaUrls)
    ? raw.mediaUrls.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  const rawTypes = Array.isArray(raw.mediaTypes)
    ? raw.mediaTypes.filter((x): x is string => typeof x === "string")
    : [];
  const urls: string[] = [];
  const types: InlineMediaType[] = [];
  rawUrls.forEach((u, i) => {
    if (isProtectedLockedMediaUrl(u)) return;
    if (!isHttpUrl(u)) return;
    urls.push(u);
    const rt = rawTypes[i]?.toLowerCase() ?? "";
    const kind: InlineMediaType = rt === "video" ? "video" : rt === "audio" ? "audio" : "image";
    types.push(kind);
  });
  const standaloneAudio = Array.isArray(raw.audioUrls)
    ? raw.audioUrls.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  standaloneAudio.forEach((u) => {
    if (isProtectedLockedMediaUrl(u)) return;
    if (!isHttpUrl(u)) return;
    urls.push(u);
    types.push("audio");
  });
  return { urls, types };
}

async function fetchFanPostPrivateMediaPairs(
  creatorId: string,
  postId: string,
): Promise<{ urls: string[]; types: InlineMediaType[] } | null> {
  const snap = await getDoc(doc(db, "creators", creatorId, "fanPostPrivateMedia", postId));
  if (!snap.exists()) return null;
  const raw = snap.data() as Record<string, unknown>;
  const rawUrls = Array.isArray(raw.mediaUrls)
    ? raw.mediaUrls.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  const rawTypes = Array.isArray(raw.mediaTypes)
    ? raw.mediaTypes.filter((x): x is string => typeof x === "string")
    : [];
  const urls: string[] = [];
  const types: InlineMediaType[] = [];
  rawUrls.forEach((u, i) => {
    if (isProtectedLockedMediaUrl(u)) return;
    if (!isHttpUrl(u)) return;
    urls.push(u);
    const rt = rawTypes[i]?.toLowerCase() ?? "";
    const kind: InlineMediaType = rt === "video" ? "video" : rt === "audio" ? "audio" : "image";
    types.push(kind);
  });
  const standaloneAudio = Array.isArray(raw.audioUrls)
    ? raw.audioUrls.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  standaloneAudio.forEach((u) => {
    if (isProtectedLockedMediaUrl(u)) return;
    if (!isHttpUrl(u)) return;
    urls.push(u);
    types.push("audio");
  });
  if (!urls.length) return null;
  return { urls, types };
}

/** Parallel batched reads of fanPostPrivateMedia for locked Fan Hub rows (moderator preview). */
async function batchFetchLockedFanPostPrivateMedia(rows: AuditPreviewRow[]): Promise<
  Partial<Record<string, { urls: string[]; types: InlineMediaType[] }>>
> {
  const out: Partial<Record<string, { urls: string[]; types: InlineMediaType[] }>> = {};
  const targets = rows.filter(
    (r): r is AuditPreviewRow =>
      r.collection === "fanPost" && r.lockedLike === true && Boolean(r.creatorId?.trim()),
  );
  const batchSize = 15;
  for (let i = 0; i < targets.length; i += batchSize) {
    const chunk = targets.slice(i, i + batchSize);
    const settled = await Promise.all(
      chunk.map(async (r) => {
        const key = `fanPost:${r.id}`;
        try {
          const pairs = await fetchFanPostPrivateMediaPairs(r.creatorId!, r.id);
          return { key, pairs };
        } catch {
          return { key, pairs: null as { urls: string[]; types: InlineMediaType[] } | null };
        }
      }),
    );
    for (const { key, pairs } of settled) {
      if (pairs) out[key] = pairs;
    }
  }
  return out;
}

type ModeratorPreviewRowUiProps = {
  row: AuditPreviewRow;
  rowStableKey: string;
  privateMediaPairs: Partial<Record<string, { urls: string[]; types: InlineMediaType[] }>>;
  resolveLockedBusyKey: string | null;
  onResolveLockedMedia: (creatorId: string, postId: string) => Promise<void>;
};

const ModeratorPreviewRowUi: React.FC<ModeratorPreviewRowUiProps> = ({
  row,
  rowStableKey,
  privateMediaPairs,
  resolveLockedBusyKey,
  onResolveLockedMedia,
}) => {
  const priv = row.collection === "fanPost" ? privateMediaPairs[rowStableKey] : undefined;
  const urls = priv?.urls?.length ? priv.urls : row.inlineMediaUrls;
  const types = priv?.urls?.length ? priv.types : row.inlineMediaTypes;

  const showResolveLocked =
    row.collection === "fanPost" &&
    !!row.creatorId &&
    row.lockedLike === true &&
    !priv?.urls?.length;

  return (
    <li className="px-4 py-3 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
          {row.collection}:{row.id.slice(0, 12)}…
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/35 dark:text-amber-100">
          {row.status}
          {row.lockedLike ? " · locked-slot" : ""}
        </span>
      </div>
      <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">{row.preview}</p>
      {urls.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {urls.slice(0, 6).map((u, i) =>
            types[i] === "video" ? (
              <video
                key={`${rowStableKey}-m-${i}`}
                src={u}
                controls
                playsInline
                className="max-h-52 max-w-[min(100%,18rem)] rounded-md border border-gray-200 dark:border-gray-700 bg-black"
              />
            ) : types[i] === "audio" ? (
              <audio
                key={`${rowStableKey}-m-${i}`}
                src={u}
                controls
                preload="metadata"
                className="w-full max-w-[min(100%,24rem)] h-10"
              />
            ) : (
              <a key={`${rowStableKey}-m-${i}`} href={u} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <img
                  src={u}
                  alt=""
                  className="max-h-52 max-w-[min(100%,18rem)] rounded-md border border-gray-200 dark:border-gray-700 object-cover"
                />
              </a>
            ),
          )}
        </div>
      ) : showResolveLocked ? (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/25 px-3 py-2 space-y-1.5">
          <p className="text-xs text-amber-950 dark:text-amber-50/95 leading-relaxed">
            Locked / paid-slot: the public <span className="font-mono text-[11px]">fanPosts</span> doc hides full media from
            fans. This tool already tried <span className="font-mono text-[11px]">fanPostPrivateMedia</span> — there is
            still no usable moderator URL (missing row, empty after stripping placeholders, or rules denied the read).
          </p>
          <button
            type="button"
            onClick={() => void onResolveLockedMedia(row.creatorId!, row.id)}
            disabled={resolveLockedBusyKey === rowStableKey}
            className="text-xs font-medium text-primary-700 dark:text-primary-300 hover:underline disabled:opacity-50"
          >
            {resolveLockedBusyKey === rowStableKey ? "Retrying…" : "Retry moderator read"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No image, video, or audio URL on this snapshot.
        </p>
      )}
      {showResolveLocked && urls.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => void onResolveLockedMedia(row.creatorId!, row.id)}
            disabled={resolveLockedBusyKey === rowStableKey}
            className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50"
          >
            {resolveLockedBusyKey === rowStableKey ? "Retrying…" : "Retry private media (refresh)"}
          </button>
        </div>
      ) : null}
    </li>
  );
};

async function resolveCreatorLookup(raw: string): Promise<{ id: string; handle?: string } | { error: string }> {
  const t = raw.trim();
  if (!t) return { error: "Enter a Firebase UID or public My Page handle." };
  const looksLikeUid =
    /^[a-zA-Z0-9]{14,}$/.test(t) && !t.includes("@") && !t.includes("/") && !/\s/.test(t);
  if (looksLikeUid) {
    const creatorSnap = await getDoc(doc(db, "creators", t));
    if (creatorSnap.exists()) return { id: t, handle: str(creatorSnap.data()?.handle as string) || undefined };
  }
  const handleKey = t.replace(/^@/, "").trim().toLowerCase();
  if (!handleKey) return { error: "Handle is invalid." };
  const hSnap = await getDoc(doc(db, "creatorHandles", handleKey));
  if (!hSnap.exists()) {
    if (looksLikeUid) return { error: "No creators/{uid} doc for that id." };
    return { error: "Unknown handle — paste UID or verify creatorHandles mirror." };
  }
  const d = hSnap.data() as { creatorUserId?: string; creatorId?: string; uid?: string };
  const id = str(d.creatorUserId || d.creatorId || d.uid);
  if (!id) return { error: "Handle mapping has no creator id." };
  return { id: id, handle: handleKey };
}

type AuditEventDoc = {
  id: string;
  actorUid: string;
  actorEmail?: string;
  action: string;
  creatorId: string;
  creatorHandleHint?: string;
  source?: string;
  createdLabel: string;
};

export type AdminAuditLogSource = "admin_tools_content_audit" | "admin_users_row_content_audit";

export const AdminContentAuditToolsPanel: React.FC<{
  /** When set (e.g. “Audit feed” on a user row), load this creator once then notify parent to clear jump state. */
  openingJump?: { creatorId: string; source: AdminAuditLogSource } | null;
  onOpeningJumpConsumed?: () => void;
  canFetchUserComposePosts: boolean;
  /** Source stamped on manual lookups from the UID/handle box. */
  manualLogSource?: AdminAuditLogSource;
}> = ({
  openingJump,
  onOpeningJumpConsumed,
  canFetchUserComposePosts,
  manualLogSource = "admin_tools_content_audit",
}) => {
  const { user: viewer, showToast } = useAppContext();
  const [lookupInput, setLookupInput] = useState("");
  const [creatorIdResolved, setCreatorIdResolved] = useState("");
  const [handleResolved, setHandleResolved] = useState<string | undefined>();
  const [rows, setRows] = useState<AuditPreviewRow[]>([]);
  const [events, setEvents] = useState<AuditEventDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [privateMediaPairs, setPrivateMediaPairs] = useState<
    Partial<Record<string, { urls: string[]; types: InlineMediaType[] }>>
  >({});
  const [resolveLockedBusyKey, setResolveLockedBusyKey] = useState<string | null>(null);
  const [auditLogBusy, setAuditLogBusy] = useState(false);
  const [includeFanHubFeed, setIncludeFanHubFeed] = useState(true);
  const [includeComposeMirror, setIncludeComposeMirror] = useState(true);
  const [previewScopeLabel, setPreviewScopeLabel] = useState("");

  const viewerUid = viewer?.id ?? "";
  const actorEmail = viewer?.email ?? "";
  const isPlatformAdmin = viewer?.role === "Admin";

  const refreshAuditTable = useCallback(async () => {
    setAuditLogBusy(true);
    try {
      const qRef = query(
        collection(db, ADMIN_CONTENT_AUDIT_EVENTS_COLLECTION),
        orderBy("createdAt", "desc"),
        limit(40),
      );
      const snap = await getDocs(qRef);
      const list: AuditEventDoc[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        const ts = raw.createdAt as { toDate?: () => Date } | undefined;
        let label = "—";
        try {
          if (ts?.toDate) label = ts.toDate().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
        } catch {
          /* ignore */
        }
        return {
          id: d.id,
          actorUid: str(raw.actorUid),
          actorEmail: str(raw.actorEmail) || undefined,
          action: str(raw.action),
          creatorId: str(raw.creatorId),
          creatorHandleHint: str(raw.creatorHandleHint) || undefined,
          source: str(raw.source) || undefined,
          createdLabel: label,
        };
      });
      setEvents(list);
    } catch {
      setEvents([]);
    } finally {
      setAuditLogBusy(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuditTable();
  }, [refreshAuditTable]);

  const appendAuditEvent = useCallback(
    async (
      creatorId: string,
      handleHint: string | undefined,
      action: AdminContentAuditAction,
      sourceTag: AdminAuditLogSource,
    ): Promise<void> => {
      if (!viewerUid) return;
      await addDoc(collection(db, ADMIN_CONTENT_AUDIT_EVENTS_COLLECTION), {
        actorUid: viewerUid,
        actorEmail: actorEmail.trim() ? actorEmail : null,
        action,
        creatorId,
        creatorHandleHint: handleHint ?? null,
        source: sourceTag,
        createdAt: serverTimestamp(),
      });
      await refreshAuditTable();
    },
    [actorEmail, refreshAuditTable, viewerUid],
  );

  const resolveLockedMediaForRow = useCallback(
    async (creatorId: string, postId: string) => {
      const stableKey = `fanPost:${postId}`;
      setResolveLockedBusyKey(stableKey);
      try {
        const pairs = await fetchFanPostPrivateMediaPairs(creatorId, postId);
        if (!pairs) {
          showToast("No fanPostPrivateMedia document for this post yet.", "info");
          return;
        }
        setPrivateMediaPairs((prev) => ({ ...prev, [stableKey]: pairs }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Could not load locked media";
        showToast(msg, "error");
      } finally {
        setResolveLockedBusyKey(null);
      }
    },
    [showToast],
  );

  const deleteAuditRow = useCallback(
    async (ev: AuditEventDoc) => {
      if (!viewerUid) return;
      if (!isPlatformAdmin && ev.actorUid !== viewerUid) return;
      if (
        typeof window !== "undefined" &&
        !window.confirm("Remove this row from admin_content_audit_events?")
      ) {
        return;
      }
      setAuditLogBusy(true);
      try {
        await deleteDoc(doc(db, ADMIN_CONTENT_AUDIT_EVENTS_COLLECTION, ev.id));
        showToast("Audit entry removed.", "success");
        await refreshAuditTable();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Delete failed";
        showToast(msg, "error");
      } finally {
        setAuditLogBusy(false);
      }
    },
    [isPlatformAdmin, refreshAuditTable, showToast, viewerUid],
  );

  const loadPostsForResolvedCreator = useCallback(
    async (
      resolvedId: string,
      handleHint: string | undefined,
      sourceTag: AdminAuditLogSource,
      scopeOpts?: { skipAuditTrail?: boolean; includeFanHub?: boolean; includeCompose?: boolean },
    ): Promise<void> => {
      if (!resolvedId.trim()) return;

      const includeFanHub = scopeOpts?.includeFanHub ?? true;
      const includeCompose =
        canFetchUserComposePosts && (scopeOpts?.includeCompose ?? true);

      if (!includeFanHub && !includeCompose) {
        showToast("Choose Fan Hub feed and/or Compose mirror to load.", "error");
        return;
      }

      setBusy(true);
      setRows([]);
      setPrivateMediaPairs({});
      try {
        const merged: AuditPreviewRow[] = [];

        if (includeFanHub) {
          const fanSnap = await getDocs(
            query(collection(db, "creators", resolvedId, "fanPosts"), orderBy("createdAt", "desc"), limit(50)),
          );
          fanSnap.forEach((snap) => {
            const raw = snap.data() as Record<string, unknown>;
            const inline = readInlineMediaPairs(raw, "fanPost");
            merged.push({
              id: snap.id,
              creatorId: resolvedId,
              collection: "fanPost",
              status: normalizeStatus(raw),
              preview: postPreview(raw),
              createdMs: readCreatedMs(raw),
              lockedLike: isLockedLikeFanPost(raw),
              inlineMediaUrls: inline.urls,
              inlineMediaTypes: inline.types,
            });
          });
        }

        if (includeCompose) {
          const userPostsSnap = await getDocs(
            query(collection(db, "users", resolvedId, "posts"), orderBy("createdAt", "desc"), limit(40)),
          ).catch(() => null);
          userPostsSnap?.forEach?.((snap) => {
            const raw = snap.data() as Record<string, unknown>;
            const inline = readInlineMediaPairs(raw, "composePost");
            merged.push({
              id: snap.id,
              collection: "composePost",
              status: normalizeStatus(raw),
              preview: postPreview(raw),
              createdMs: readCreatedMs(raw),
              lockedLike: false,
              inlineMediaUrls: inline.urls,
              inlineMediaTypes: inline.types,
            });
          });
        }

        merged.sort((a, b) => b.createdMs - a.createdMs);
        const displayMerged = merged.slice(0, 60);

        let privateMap: Partial<Record<string, { urls: string[]; types: InlineMediaType[] }>> = {};
        if (includeFanHub && displayMerged.some((r) => r.collection === "fanPost" && r.lockedLike)) {
          privateMap = await batchFetchLockedFanPostPrivateMedia(displayMerged);
        }
        setPrivateMediaPairs(privateMap);
        setRows(displayMerged);
        setCreatorIdResolved(resolvedId);
        setHandleResolved(handleHint);

        setPreviewScopeLabel(
          [
            includeFanHub ? "Fan Hub" : null,
            includeCompose ? "Compose" : null,
          ]
            .filter(Boolean)
            .join(" + "),
        );

        if (!scopeOpts?.skipAuditTrail) {
          await appendAuditEvent(resolvedId, handleHint, "view_creator_fan_hub_feed", sourceTag);
        }

        showToast(
          merged.length === 0 ? "No posts returned for this creator." : `Loaded ${merged.length} audit row(s).`,
          merged.length === 0 ? "info" : "success",
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unable to load feed";
        showToast(msg, "error");
        setCreatorIdResolved("");
        setRows([]);
        setPrivateMediaPairs({});
        setPreviewScopeLabel("");
      } finally {
        setBusy(false);
      }
    },
    [appendAuditEvent, canFetchUserComposePosts, showToast],
  );

  const loadCreatorFromAuditEvent = useCallback(
    async (ev: AuditEventDoc) => {
      const cid = ev.creatorId.trim();
      if (cid.length < 10) {
        showToast("This audit row has no valid creator id.", "error");
        return;
      }
      const hint = ev.creatorHandleHint?.replace(/^@/, "").trim() || undefined;
      setLookupInput(hint ? `@${hint}` : cid);
      const sourceTag: AdminAuditLogSource =
        ev.source === "admin_tools_content_audit" || ev.source === "admin_users_row_content_audit"
          ? ev.source
          : manualLogSource;
      await loadPostsForResolvedCreator(cid, hint, sourceTag, {
        skipAuditTrail: true,
        includeFanHub: includeFanHubFeed,
        includeCompose: includeComposeMirror,
      });
    },
    [includeComposeMirror, includeFanHubFeed, loadPostsForResolvedCreator, manualLogSource, showToast],
  );

  useEffect(() => {
    const cid = typeof openingJump?.creatorId === "string" ? openingJump.creatorId.trim() : "";
    if (!cid || !openingJump) return;
    setLookupInput(cid);
    let cancelled = false;
    void (async () => {
      await loadPostsForResolvedCreator(cid, undefined, openingJump.source, {
        includeFanHub: true,
        includeCompose: canFetchUserComposePosts,
      });
      if (!cancelled) onOpeningJumpConsumed?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [
    canFetchUserComposePosts,
    loadPostsForResolvedCreator,
    onOpeningJumpConsumed,
    openingJump?.creatorId,
    openingJump?.source,
  ]);

  const onLookupSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const resolved = await resolveCreatorLookup(lookupInput.trim());
    if ("error" in resolved) {
      showToast(resolved.error, "error");
      return;
    }
    await loadPostsForResolvedCreator(resolved.id, resolved.handle, manualLogSource, {
      includeFanHub: includeFanHubFeed,
      includeCompose: includeComposeMirror,
    });
  };

  const headerLine =
    creatorIdResolved && (handleResolved || creatorIdResolved)
      ? [handleResolved ? `@${handleResolved}` : "", creatorIdResolved].filter(Boolean).join(" · ")
      : "";

  return (
    <div className="space-y-8">
      <div className="max-w-4xl space-y-2">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Content audit</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          Fan Hub moderator preview (logged): caption text plus image, video, or audio when URLs are on the snapshot
          (including <span className="font-mono">audioUrls</span> on Fan Hub posts). Collection{" "}
          <span className="font-mono text-xs">{ADMIN_CONTENT_AUDIT_EVENTS_COLLECTION}</span>
          {canFetchUserComposePosts ? " • includes Compose rows under users/&lt;creatorUid&gt;/posts for platform admins." : "."}
          {" "}DM access is intentionally excluded.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-500">
          Locked / PPV posts: moderator preview automatically reads{' '}
          <span className="font-mono">fanPostPrivateMedia</span> for those rows when your Firestore rules allow. Use Retry on
          a row only if a doc was written after load or a read failed. Fan DMs stay out of scope until built separately.
        </p>
      </div>

      <form
        onSubmit={(ev) => void onLookupSubmit(ev)}
        className="max-w-3xl space-y-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-950/40 p-4"
      >
        <div className="flex flex-col sm:flex-row gap-2 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Creator UID or public handle
            </label>
            <input
              value={lookupInput}
              onChange={(ev) => setLookupInput(ev.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
              placeholder="UID or handle"
            />
          </div>
          <button
            type="submit"
            disabled={busy || (!includeFanHubFeed && !(canFetchUserComposePosts && includeComposeMirror))}
            className="rounded-lg px-4 py-2 text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy ? "Loading…" : "Load"}
          </button>
        </div>
        <div className="flex flex-col gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Sources</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={includeFanHubFeed}
              title="creators/{creatorUid}/fanPosts"
              onClick={() => {
                if (includeFanHubFeed) {
                  if (!canFetchUserComposePosts || !includeComposeMirror) {
                    showToast("Turn on Compose first, or keep Fan Hub on (need at least one source).", "info");
                    return;
                  }
                }
                setIncludeFanHubFeed((v) => !v);
              }}
              className={`text-left rounded-lg border px-3 py-2 transition-colors min-w-[9.5rem] ${
                includeFanHubFeed
                  ? "border-primary-600 bg-primary-600 text-white shadow-sm"
                  : "border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              <span className="block text-xs font-semibold">Fan Hub feed</span>
              <span className={`block mt-0.5 text-[10px] font-mono ${includeFanHubFeed ? "text-white/85" : "text-gray-500 dark:text-gray-400"}`}>
                creators/…/fanPosts
              </span>
            </button>
            {canFetchUserComposePosts ? (
              <button
                type="button"
                aria-pressed={includeComposeMirror}
                title="users/{creatorUid}/posts"
                onClick={() => {
                  if (includeComposeMirror && !includeFanHubFeed) {
                    showToast("Turn on Fan Hub first, or keep Compose on (need at least one source).", "info");
                    return;
                  }
                  setIncludeComposeMirror((v) => !v);
                }}
                className={`text-left rounded-lg border px-3 py-2 transition-colors min-w-[9.5rem] ${
                  includeComposeMirror
                    ? "border-primary-600 bg-primary-600 text-white shadow-sm"
                    : "border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                <span className="block text-xs font-semibold">Compose mirror</span>
                <span
                  className={`block mt-0.5 text-[10px] font-mono ${includeComposeMirror ? "text-white/85" : "text-gray-500 dark:text-gray-400"}`}
                >
                  users/…/posts
                </span>
              </button>
            ) : null}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-500 leading-relaxed">
            Image, video, and <span className="font-semibold text-gray-600 dark:text-gray-400">audio</span> tied to Fan Hub
            posts show when <strong className="font-medium">Fan Hub feed</strong> is on ({`audioUrls`} on those docs). Compose
            adds caption/mirror rows only.             DM voice, outbound campaign inboxes, and other private messaging surfaces stay out of this panel until EchoFlux
            ships a separate moderator tool with explicit access rules and retention policy (private by default).
          </p>
        </div>
      </form>

      {headerLine ? <p className="text-xs font-mono text-gray-600 dark:text-gray-400">{headerLine}</p> : null}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900/40">
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/70 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide flex flex-wrap items-center justify-between gap-2">
          <span>
            Moderator preview ({rows.length})
            {previewScopeLabel ? (
              <span className="ml-2 font-normal normal-case text-gray-500 dark:text-gray-400">
                · {previewScopeLabel}
              </span>
            ) : null}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-500">No rows — run Load above.</div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[min(520px,60vh)] overflow-y-auto">
            {rows.map((r) => {
              const rowStableKey = `${r.collection}:${r.id}`;
              return (
                <ModeratorPreviewRowUi
                  key={rowStableKey}
                  row={r}
                  rowStableKey={rowStableKey}
                  privateMediaPairs={privateMediaPairs}
                  resolveLockedBusyKey={resolveLockedBusyKey}
                  onResolveLockedMedia={resolveLockedMediaForRow}
                />
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Recent audit entries</h4>
          <button
            type="button"
            disabled={auditLogBusy}
            onClick={() => void refreshAuditTable()}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            {auditLogBusy ? "Refreshing…" : "Refresh audit log"}
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto bg-white dark:bg-gray-900/40">
          <table className="min-w-[940px] w-full text-left text-xs">
            <thead className="bg-gray-50 dark:bg-gray-950/80 border-b border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400">
              <tr>
                <th className="p-3">When</th>
                <th className="p-3">Actor</th>
                <th className="p-3">Action</th>
                <th className="p-3">Creator</th>
                <th className="p-3">Handle</th>
                <th className="p-3">Source</th>
                <th className="p-3 min-w-[9.5rem]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-gray-500">
                    No audit rows yet (deploy rules + indexes if the console warns).
                  </td>
                </tr>
              ) : (
                events.map((ev) => {
                  const showDeleteRow = Boolean(viewerUid) && (isPlatformAdmin || ev.actorUid === viewerUid);
                  return (
                    <tr
                      key={ev.id}
                      className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50/70 dark:hover:bg-gray-950/40"
                    >
                      <td className="p-3 font-mono text-[11px] whitespace-nowrap">{ev.createdLabel}</td>
                      <td className="p-3">
                        <div className="font-mono">{ev.actorUid.slice(0, 10)}…</div>
                        {ev.actorEmail ? <div className="text-gray-500 truncate max-w-[10rem]">{ev.actorEmail}</div> : null}
                      </td>
                      <td className="p-3">{ev.action}</td>
                      <td className="p-3 font-mono truncate max-w-[11rem]" title={ev.creatorId}>
                        {ev.creatorId.slice(0, 16)}…
                      </td>
                      <td className="p-3">{ev.creatorHandleHint || "—"}</td>
                      <td className="p-3 text-gray-600 dark:text-gray-400">{ev.source || "—"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <button
                            type="button"
                            disabled={busy || auditLogBusy || ev.creatorId.trim().length < 10}
                            title="Reopen this creator's preview (does not append a duplicate audit trail row)."
                            onClick={() => void loadCreatorFromAuditEvent(ev)}
                            className="text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:no-underline"
                          >
                            Load
                          </button>
                          {showDeleteRow ? (
                            <button
                              type="button"
                              disabled={auditLogBusy}
                              onClick={() => void deleteAuditRow(ev)}
                              className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
