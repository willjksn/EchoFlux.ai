"use client";

import React, { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { resolveApiUrl, DEV_API_404_USER_HINT } from "../src/lib/resolveApiUrl";

interface LiveStreamWatchRoomProps {
  creatorId: string;
  streamId: string;
  /** Shown in header */
  title?: string;
  onClose: () => void;
}

type LiveViewerRow = {
  fanId: string;
  displayName: string;
  joinedAt: string;
};

/**
 * Daily Prebuilt iframe for fan live streams (presenter or viewer token from `/api/liveStreamDaily`).
 * Viewers are hidden in Daily's UI; the host sees a Firestore-backed member roster here.
 */
export const LiveStreamWatchRoom: React.FC<LiveStreamWatchRoomProps> = ({
  creatorId,
  streamId,
  title,
  onClose,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [viewers, setViewers] = useState<LiveViewerRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const authToken = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
        if (!authToken) {
          setError("Sign in to join the stream.");
          setLoading(false);
          return;
        }
        const res = await fetch(resolveApiUrl("/api/liveStreamDaily"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ action: "token", creatorId, streamId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          token?: string;
          roomUrl?: string;
          role?: string;
        };
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error(`Could not reach live stream API (404). ${DEV_API_404_USER_HINT}`);
          }
          throw new Error(data.error || "Could not join the stream");
        }
        if (!data.token || !data.roomUrl) {
          throw new Error("Invalid response from server");
        }
        if (cancelled) return;
        setToken(data.token);
        setRoomUrl(data.roomUrl);
        setRole(data.role || null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not join the stream");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creatorId, streamId]);

  const isPresenter = role === "presenter";

  useEffect(() => {
    if (!isPresenter || !creatorId || !streamId) return undefined;
    const q = query(
      collection(db, "creators", creatorId, "liveStreams", streamId, "participants"),
      orderBy("joinedAt", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: LiveViewerRow[] = snap.docs.map((d) => {
          const data = d.data() as { fanId?: string; displayName?: string; joinedAt?: string };
          return {
            fanId: typeof data.fanId === "string" ? data.fanId : d.id,
            displayName:
              typeof data.displayName === "string" && data.displayName.trim()
                ? data.displayName.trim()
                : "Member",
            joinedAt: typeof data.joinedAt === "string" ? data.joinedAt : "",
          };
        });
        setViewers(rows);
      },
      () => setViewers([]),
    );
    return () => unsub();
  }, [isPresenter, creatorId, streamId]);

  useEffect(() => {
    if (isPresenter || loading || error) return undefined;

    const notifyLeave = () => {
      if (!auth.currentUser) return;
      void auth.currentUser.getIdToken().then((t) => {
        if (!t) return;
        const body = JSON.stringify({ action: "leaveViewer", creatorId, streamId });
        void fetch(resolveApiUrl("/api/liveStreamDaily"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${t}`,
          },
          body,
          keepalive: true,
        });
      });
    };

    const onPageHide = () => notifyLeave();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      notifyLeave();
    };
  }, [isPresenter, loading, error, creatorId, streamId]);

  const dailyUrl = roomUrl && token ? `${roomUrl}?t=${token}` : null;
  const headerTitle = title?.trim() || "Live stream";
  const viewerCount = viewers.length;

  return (
    <div className="fixed inset-0 z-[100] bg-gray-950 flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-900/95 border-b border-gray-800">
        <div className="min-w-0">
          <h2 className="text-white font-semibold text-sm sm:text-base truncate">{headerTitle}</h2>
          {isPresenter ? (
            <p className="text-gray-400 text-xs truncate">
              {viewerCount === 0
                ? "You're live — waiting for members to join"
                : `${viewerCount} ${viewerCount === 1 ? "member" : "members"} watching`}
            </p>
          ) : (
            <p className="text-gray-400 text-xs truncate">Watching live</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 border border-gray-700"
        >
          Leave
        </button>
      </div>

      {isPresenter ? (
        <div className="shrink-0 px-4 py-2.5 bg-gray-900/80 border-b border-gray-800 max-h-32 overflow-y-auto">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            Members in this stream
          </p>
          {viewerCount === 0 ? (
            <p className="text-sm text-gray-500 m-0">
              When a member taps <strong className="text-gray-400">Watch live</strong>, they&apos;ll appear here.
              Daily&apos;s video panel may still say &quot;waiting&quot; — that&apos;s normal; use this list for who joined.
            </p>
          ) : (
            <ul className="m-0 p-0 list-none space-y-1">
              {viewers.map((v) => (
                <li
                  key={v.fanId}
                  className="text-sm text-gray-200 flex items-center justify-between gap-2 py-0.5"
                >
                  <span className="truncate font-medium">{v.displayName}</span>
                  {v.joinedAt ? (
                    <span className="text-[10px] text-gray-500 shrink-0">
                      {new Date(v.joinedAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="flex-1 relative min-h-0">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            Connecting…
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-red-300 text-sm max-w-md">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        ) : dailyUrl ? (
          <iframe
            ref={iframeRef}
            title="Live stream"
            src={dailyUrl}
            allow={
              role === "presenter"
                ? "camera; microphone; fullscreen; display-capture"
                : "fullscreen"
            }
            className="absolute inset-0 w-full h-full border-0"
          />
        ) : null}
      </div>
    </div>
  );
};

export default LiveStreamWatchRoom;
