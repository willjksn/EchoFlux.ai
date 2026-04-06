import React, { useState, useEffect, useCallback } from "react";
import { useAppContext } from "./AppContext";
import { auth, db, storage } from "../firebaseConfig";
import { collection, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { formatFanDisplayLabel } from "../src/lib/fanHubDisplay";

type ScheduleStatus = "pending" | "scheduled" | "completed" | "cancelled";

type Purchase = {
  id: string;
  email: string;
  fanName: string | null;
  productName: string;
  treatType: string;
  amountCents: number;
  createdAt: Date;
  scheduleStatus: ScheduleStatus;
  scheduledDate: string | null;
  scheduledTime: string | null;
  deliveryStatus: "pending" | "delivered";
  deliveryType: "video" | "audio" | "text" | null;
  deliveryText: string | null;
  deliveryUrl: string | null;
  deliveredAt: Date | null;
  isDemo?: boolean;
};

function formatDateShort(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatScheduleDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTime12h(timeStr: string | null): string {
  if (!timeStr || !timeStr.trim()) return "";
  const [h, min] = timeStr.split(":").map(Number);
  const hour = h ?? 0;
  const minute = min ?? 0;
  if (hour === 0) return `12:${String(minute).padStart(2, "0")} AM`;
  if (hour < 12) return `${hour}:${String(minute).padStart(2, "0")} AM`;
  if (hour === 12) return `12:${String(minute).padStart(2, "0")} PM`;
  return `${hour - 12}:${String(minute).padStart(2, "0")} PM`;
}

function formatAmount(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

// Empty - no demo data for new creators
const DEMO_PURCHASES: Purchase[] = [];

/**
 * Fan Hub → Purchases: store purchases with scheduling to calendar.
 * Shows pending purchases that need scheduling, and scheduled/completed ones.
 */
export const FanHubPurchases: React.FC = () => {
  const { user, showToast } = useAppContext();
  const [purchases, setPurchases] = useState<Purchase[]>(DEMO_PURCHASES);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("12:00");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "scheduled" | "completed">("all");
  const [deliveryEditingId, setDeliveryEditingId] = useState<string | null>(null);
  const [deliveryTypeDraft, setDeliveryTypeDraft] = useState<"video" | "audio" | "text">("text");
  const [deliveryTextDraft, setDeliveryTextDraft] = useState("");
  const [deliveryUrlDraft, setDeliveryUrlDraft] = useState("");
  const [deliveryUploading, setDeliveryUploading] = useState(false);

  const fetchPurchases = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/creatorOrders?limit=200", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.orders) ? data.orders : [];
        const realPurchases: Purchase[] = list.map((o: any) => ({
          id: o.id,
          email: o.fanEmail || o.fanId || "Unknown",
          fanName: o.fanName || null,
          productName: o.productTitle || o.type || "Purchase",
          treatType: o.productId || o.type,
          amountCents: o.amountCents || 0,
          createdAt: new Date(o.createdAt),
          scheduleStatus: (o.scheduleStatus as ScheduleStatus) || "pending",
          scheduledDate: o.scheduledDate || null,
          scheduledTime: o.scheduledTime || null,
          deliveryStatus: o.deliveryStatus === "delivered" ? "delivered" : "pending",
          deliveryType:
            o.deliveryType === "video" || o.deliveryType === "audio" || o.deliveryType === "text"
              ? o.deliveryType
              : null,
          deliveryText: typeof o.deliveryText === "string" ? o.deliveryText : null,
          deliveryUrl: typeof o.deliveryUrl === "string" ? o.deliveryUrl : null,
          deliveredAt: o.deliveredAt ? new Date(o.deliveredAt) : null,
          isDemo: false,
        }));
        setPurchases(realPurchases);
      } else {
        const errBody = await res.text().catch(() => "");
        showToast?.(`Could not load purchases (${res.status}). Try Refresh.`, "error");
        if (import.meta.env.DEV) console.warn("creatorOrders failed", res.status, errBody);
      }
    } catch (e) {
      showToast?.("Could not load purchases.", "error");
      if (import.meta.env.DEV) console.warn("creatorOrders error", e);
    } finally {
      setLoading(false);
    }
  }, [user?.id, showToast]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const startEdit = (p: Purchase) => {
    setEditingId(p.id);
    setScheduleDate(p.scheduledDate ?? "");
    setScheduleTime(p.scheduledTime ?? "12:00");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setScheduleDate("");
    setScheduleTime("12:00");
  };

  const handleSchedule = async (p: Purchase) => {
    if (!scheduleDate.trim()) {
      showToast?.("Please pick a date.", "error");
      return;
    }
    setSavingId(p.id);

    // Parse time
    const [h, min] = scheduleTime.split(":").map(Number);
    const timeHHmm = `${String(h ?? 0).padStart(2, "0")}:${String(min ?? 0).padStart(2, "0")}`;
    const scheduledAt = new Date(scheduleDate);
    scheduledAt.setHours(h ?? 0, min ?? 0, 0, 0);

    if (!p.isDemo) {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        const scheduleRes = await fetch("/api/updateCreatorOrderSchedule", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            orderId: p.id,
            scheduleStatus: "scheduled",
            scheduledDate: scheduleDate.trim(),
            scheduledTime: timeHHmm,
          }),
        });
        if (!scheduleRes.ok) {
          const j = (await scheduleRes.json().catch(() => ({}))) as { error?: string };
          showToast?.(j.error || "Could not save schedule", "error");
          setSavingId(null);
          return;
        }
      } catch {
        showToast?.("Could not save schedule.", "error");
        setSavingId(null);
        return;
      }
    }

    setPurchases((prev) =>
      prev.map((purchase) =>
        purchase.id === p.id
          ? {
              ...purchase,
              scheduleStatus: "scheduled" as ScheduleStatus,
              scheduledDate: scheduleDate.trim(),
              scheduledTime: timeHHmm,
            }
          : purchase
      )
    );

    // Add to calendar (if real data and db available)
    if (!p.isDemo && db && user?.id) {
      try {
        // Determine treat type from treatType field
        const treatTypeMap: Record<string, 'video_call' | 'chat_session' | 'voice_note' | 'custom_video' | 'other'> = {
          'live_video_5m': 'video_call',
          'live_video_10m': 'video_call',
          'live_video_15m': 'video_call',
          'live_video_30m': 'video_call',
          'live_video_45m': 'video_call',
          'live_video_60m': 'video_call',
          'live_chat_5m': 'chat_session',
          'live_chat_15m': 'chat_session',
          'live_chat_30m': 'chat_session',
          'live_chat_45m': 'chat_session',
          'live_chat_60m': 'chat_session',
          'live_chat_1h': 'chat_session',
          'chat_session': 'chat_session',
          'voice_note_30s': 'voice_note',
          'voice_note_60s': 'voice_note',
          'custom_video_reply': 'custom_video',
          'private_video_reply': 'custom_video',
        };
        
        // Parse duration from treat type (e.g., 'live_video_15m' -> 15)
        const durationMatch = p.treatType?.match(/(\d+)m$/);
        const durationMinutes = durationMatch ? parseInt(durationMatch[1], 10) : undefined;
        
        const calendarTreatType = treatTypeMap[p.treatType] || 'other';
        const timeStr = timeHHmm;
        
        await addDoc(collection(db, "users", user.id, "onlyfans_calendar_events"), {
          // Core event fields
          title: `${calendarTreatType === 'video_call' ? '📹 Video Call' : calendarTreatType === 'chat_session' ? '💬 Chat Session' : '🎁 Store'}: ${p.fanName || p.email}`,
          date: scheduledAt.toISOString(),
          reminderType: "treat",
          contentType: "custom",
          description: `${p.productName} for ${p.fanName || p.email}`,
          reminderTime: timeStr,
          createdAt: new Date().toISOString(),
          userId: user.id,
          
          // Treat-specific fields
          treatPurchaseId: p.id,
          treatType: calendarTreatType,
          treatDurationMinutes: durationMinutes,
          treatStatus: "scheduled",
          fanId: p.email, // Using email as fan ID for now
          fanName: p.fanName,
          fanEmail: p.email,
        });
      } catch (err) {
        console.error("Failed to add calendar event:", err);
      }
    }

    setEditingId(null);
    setScheduleDate("");
    setScheduleTime("12:00");
    setSavingId(null);
    showToast?.("Scheduled! It will appear on your calendar.", "success");
  };

  const markCompleted = async (p: Purchase) => {
    if (!p.isDemo) {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        const scheduleRes = await fetch("/api/updateCreatorOrderSchedule", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            orderId: p.id,
            scheduleStatus: "completed",
          }),
        });
        if (!scheduleRes.ok) {
          showToast?.("Could not update order.", "error");
          return;
        }
      } catch {
        showToast?.("Could not update order.", "error");
        return;
      }
    }
    setPurchases((prev) =>
      prev.map((purchase) =>
        purchase.id === p.id
          ? { ...purchase, scheduleStatus: "completed" as ScheduleStatus }
          : purchase
      )
    );
    showToast?.("Marked as completed.", "success");
  };

  const openDeliveryEditor = (p: Purchase) => {
    setDeliveryEditingId(p.id);
    setDeliveryTypeDraft(p.deliveryType || "text");
    setDeliveryTextDraft(p.deliveryText || "");
    setDeliveryUrlDraft(p.deliveryUrl || "");
  };

  const cancelDeliveryEditor = () => {
    setDeliveryEditingId(null);
    setDeliveryTypeDraft("text");
    setDeliveryTextDraft("");
    setDeliveryUrlDraft("");
    setDeliveryUploading(false);
  };

  const handleUploadDeliveryMedia = async (p: Purchase, file: File) => {
    if (!auth.currentUser?.uid) return;
    setDeliveryUploading(true);
    try {
      const ext = (file.name.split(".").pop() || (file.type.includes("audio") ? "m4a" : "mp4")).toLowerCase();
      const path = `creators/${auth.currentUser.uid}/orderDeliveries/${p.id}/${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, {
        contentType: file.type || (deliveryTypeDraft === "audio" ? "audio/mpeg" : "video/mp4"),
      });
      const url = await getDownloadURL(storageRef);
      setDeliveryUrlDraft(url);
      showToast?.("Delivery media uploaded.", "success");
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Could not upload delivery media.", "error");
    } finally {
      setDeliveryUploading(false);
    }
  };

  const saveDelivery = async (p: Purchase) => {
    const nextType = deliveryTypeDraft;
    const nextText = deliveryTextDraft.trim();
    const nextUrl = deliveryUrlDraft.trim();
    if ((nextType === "video" || nextType === "audio") && !nextUrl) {
      showToast?.("Please provide a delivery URL or upload a file.", "error");
      return;
    }
    if (nextType === "text" && !nextText) {
      showToast?.("Please add delivery text.", "error");
      return;
    }
    setSavingId(p.id);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/updateCreatorOrderSchedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          orderId: p.id,
          deliveryStatus: "delivered",
          deliveryType: nextType,
          deliveryText: nextType === "text" ? nextText : null,
          deliveryUrl: nextType === "text" ? null : nextUrl,
          scheduleStatus: p.scheduleStatus === "completed" ? "completed" : p.scheduleStatus,
        }),
      });
      const payload = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        showToast?.(payload.error || "Could not save delivery.", "error");
        return;
      }
      setPurchases((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? {
                ...x,
                deliveryStatus: "delivered",
                deliveryType: nextType,
                deliveryText: nextType === "text" ? nextText : null,
                deliveryUrl: nextType === "text" ? null : nextUrl,
                deliveredAt: new Date(),
              }
            : x
        )
      );
      showToast?.("Delivery saved.", "success");
      cancelDeliveryEditor();
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Could not save delivery.", "error");
    } finally {
      setSavingId(null);
    }
  };

  const filteredPurchases = purchases.filter((p) => {
    if (filterStatus === "all") return true;
    return p.scheduleStatus === filterStatus;
  });

  const pendingCount = purchases.filter((p) => p.scheduleStatus === "pending").length;
  const scheduledCount = purchases.filter((p) => p.scheduleStatus === "scheduled").length;

  if (!user?.id) {
    return (
      <div className="purchases-page">
        <p className="purchases-empty">Sign in to view purchases.</p>
      </div>
    );
  }

  return (
    <div className="purchases-page">
      <header className="purchases-header">
        <div>
          <h1 className="purchases-title">Purchases</h1>
          <p className="purchases-subtitle">
            Store purchases appear here. Set a date and time and click <strong>Schedule</strong> to add it to your{" "}
            <a href="/calendar" className="purchases-link">calendar</a> and notify the fan.
          </p>
        </div>
        <div className="purchases-header-actions">
          <button
            type="button"
            onClick={() => fetchPurchases()}
            disabled={loading}
            className="purchases-btn purchases-btn-secondary"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="purchases-stats">
        <div className="purchases-stat">
          <span className="purchases-stat-value purchases-stat-pending">{pendingCount}</span>
          <span className="purchases-stat-label">Needs scheduling</span>
        </div>
        <div className="purchases-stat">
          <span className="purchases-stat-value purchases-stat-scheduled">{scheduledCount}</span>
          <span className="purchases-stat-label">Scheduled</span>
        </div>
        <div className="purchases-stat">
          <span className="purchases-stat-value">{purchases.length}</span>
          <span className="purchases-stat-label">Total purchases</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="purchases-filters">
        {(["all", "pending", "scheduled", "completed"] as const).map((status) => (
          <button
            key={status}
            type="button"
            className={`purchases-filter-btn ${filterStatus === status ? "active" : ""}`}
            onClick={() => setFilterStatus(status)}
          >
            {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
            {status === "pending" && pendingCount > 0 && (
              <span className="purchases-filter-badge">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Purchase Cards */}
      <div className="purchases-list">
        {filteredPurchases.length === 0 ? (
          <p className="purchases-empty">
            {filterStatus === "all"
              ? "No purchases yet. When someone buys from your store, it will appear here."
              : `No ${filterStatus} purchases.`}
          </p>
        ) : (
          filteredPurchases.map((p) => {
            const isPending = p.scheduleStatus === "pending";
            const isScheduled = p.scheduleStatus === "scheduled";
            const isCompleted = p.scheduleStatus === "completed";
            const isEditing = editingId === p.id;

            return (
              <div
                key={p.id}
                className={`purchases-card ${isPending ? "purchases-card-pending" : ""} ${isCompleted ? "purchases-card-completed" : ""}`}
              >
                <div className="purchases-card-header">
                  <div className="purchases-card-info">
                    <p className="purchases-card-product">{p.productName}</p>
                    <p className="purchases-card-meta">
                      <span>
                        {formatFanDisplayLabel({ displayName: p.fanName }, { fallback: "Member" })}
                        {p.email && p.email.includes("@") && (
                          <span className="purchases-card-meta-email"> · {p.email}</span>
                        )}
                      </span>
                      <span className="purchases-card-amount">{formatAmount(p.amountCents)}</span>
                    </p>
                    <p className="purchases-card-date">
                      Purchased {formatDateShort(p.createdAt)}
                      {p.isDemo && <span className="purchases-demo-badge">Demo</span>}
                    </p>
                  </div>
                  <div className="purchases-card-status">
                    {isPending && (
                      <span className="purchases-status-badge purchases-status-pending">
                        Needs scheduling
                      </span>
                    )}
                    {isScheduled && p.scheduledDate && (
                      <div className="purchases-scheduled-info">
                        <span className="purchases-status-badge purchases-status-scheduled">
                          Scheduled
                        </span>
                        <p className="purchases-scheduled-datetime">
                          {formatScheduleDate(p.scheduledDate)} at {formatTime12h(p.scheduledTime)}
                        </p>
                      </div>
                    )}
                    {isCompleted && (
                      <span className="purchases-status-badge purchases-status-completed">
                        Completed
                      </span>
                    )}
                    {p.deliveryStatus === "delivered" && (
                      <span className="purchases-status-badge purchases-status-scheduled">
                        Delivered
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="purchases-card-actions">
                  {!isEditing && !isCompleted && (
                    <>
                      {isScheduled && (
                        <>
                          <button
                            type="button"
                            className="purchases-btn purchases-btn-secondary"
                            onClick={() => startEdit(p)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="purchases-btn purchases-btn-success"
                            onClick={() => markCompleted(p)}
                          >
                            Mark Complete
                          </button>
                        </>
                      )}
                      {isPending && (
                        <button
                          type="button"
                          className="purchases-btn purchases-btn-primary"
                          onClick={() => startEdit(p)}
                        >
                          Schedule
                        </button>
                      )}
                    </>
                  )}
                  {!isEditing && (
                    <button
                      type="button"
                      className="purchases-btn purchases-btn-primary"
                      onClick={() => openDeliveryEditor(p)}
                    >
                      {p.deliveryStatus === "delivered" ? "Update Delivery" : "Deliver Purchase"}
                    </button>
                  )}
                </div>

                {/* Schedule Form */}
                {(isPending || isEditing) && isEditing && (
                  <div className="purchases-schedule-form">
                    <div className="purchases-schedule-row">
                      <label className="purchases-schedule-label">
                        <span>Date</span>
                        <input
                          type="date"
                          value={scheduleDate}
                          onChange={(e) => setScheduleDate(e.target.value)}
                          className="purchases-schedule-input"
                        />
                      </label>
                      <label className="purchases-schedule-label">
                        <span>Time</span>
                        <input
                          type="time"
                          value={scheduleTime}
                          onChange={(e) => setScheduleTime(e.target.value)}
                          className="purchases-schedule-input"
                        />
                      </label>
                      <button
                        type="button"
                        className="purchases-btn purchases-btn-primary"
                        disabled={savingId === p.id || !scheduleDate.trim()}
                        onClick={() => handleSchedule(p)}
                      >
                        {savingId === p.id ? "Saving…" : isPending && !p.scheduledDate ? "Schedule" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="purchases-btn purchases-btn-secondary"
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="purchases-schedule-hint">
                      This will add the booking to your <strong>Calendar</strong> and notify the fan.
                    </p>
                  </div>
                )}

                {deliveryEditingId === p.id && (
                  <div className="purchases-schedule-form">
                    <div className="purchases-schedule-row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
                      <label className="purchases-schedule-label" style={{ minWidth: 180 }}>
                        <span>Delivery Type</span>
                        <select
                          value={deliveryTypeDraft}
                          onChange={(e) => setDeliveryTypeDraft(e.target.value as "video" | "audio" | "text")}
                          className="purchases-schedule-input"
                        >
                          <option value="text">Text reply</option>
                          <option value="video">Video reply</option>
                          <option value="audio">Voice note</option>
                        </select>
                      </label>
                      {(deliveryTypeDraft === "video" || deliveryTypeDraft === "audio") && (
                        <label className="purchases-btn purchases-btn-secondary" style={{ cursor: deliveryUploading ? "wait" : "pointer" }}>
                          {deliveryUploading ? "Uploading…" : "Upload media"}
                          <input
                            type="file"
                            accept={deliveryTypeDraft === "audio" ? "audio/*" : "video/*"}
                            hidden
                            disabled={deliveryUploading}
                            onChange={(e) => {
                              const f = e.currentTarget.files?.[0];
                              if (f) void handleUploadDeliveryMedia(p, f);
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {deliveryTypeDraft === "text" ? (
                      <textarea
                        value={deliveryTextDraft}
                        onChange={(e) => setDeliveryTextDraft(e.target.value)}
                        placeholder="Write the delivery message or script..."
                        className="purchases-schedule-input"
                        rows={4}
                        style={{ width: "100%", marginTop: "0.5rem" }}
                      />
                    ) : (
                      <input
                        type="url"
                        value={deliveryUrlDraft}
                        onChange={(e) => setDeliveryUrlDraft(e.target.value)}
                        placeholder="Media URL (auto-filled when uploading)"
                        className="purchases-schedule-input"
                        style={{ width: "100%", marginTop: "0.5rem" }}
                      />
                    )}
                    <div className="purchases-schedule-row" style={{ marginTop: "0.5rem" }}>
                      <button
                        type="button"
                        className="purchases-btn purchases-btn-primary"
                        disabled={savingId === p.id || deliveryUploading}
                        onClick={() => void saveDelivery(p)}
                      >
                        {savingId === p.id ? "Saving…" : "Save Delivery"}
                      </button>
                      <button type="button" className="purchases-btn purchases-btn-secondary" onClick={cancelDeliveryEditor}>
                        Cancel
                      </button>
                    </div>
                    <p className="purchases-schedule-hint">
                      Fans will see this in Purchases and can play/read in-app.
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Calendar Connection Info */}
      <div className="purchases-calendar-info">
        <h3>How it connects to your Calendar</h3>
        <ul>
          <li><span className="purchases-dot purchases-dot-treat"></span> Scheduled store purchases appear on your calendar with a purple badge</li>
          <li><span className="purchases-dot purchases-dot-session"></span> Chat sessions are auto-added when scheduled</li>
          <li>Fans receive a notification when you schedule their purchase</li>
          <li>You can reschedule anytime from here or from the calendar</li>
        </ul>
      </div>
    </div>
  );
};
