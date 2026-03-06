import React, { useState, useEffect, useCallback } from "react";
import { useAppContext } from "./AppContext";
import { auth, db } from "../firebaseConfig";
import { collection, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";

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
 * Fan Hub → Purchases: treat purchases with scheduling to calendar.
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

  const fetchPurchases = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch("/api/creatorOrders?limit=200", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.orders) && data.orders.length > 0) {
          const realPurchases: Purchase[] = data.orders.map((o: any) => ({
            id: o.id,
            email: o.fanEmail || o.fanId || "Unknown",
            fanName: o.fanName || null,
            productName: o.productTitle || o.type || "Purchase",
            treatType: o.productId || o.type,
            amountCents: o.amountCents || 0,
            createdAt: new Date(o.createdAt),
            scheduleStatus: o.scheduleStatus || "pending",
            scheduledDate: o.scheduledDate || null,
            scheduledTime: o.scheduledTime || null,
            isDemo: false,
          }));
          setPurchases(realPurchases);
        }
      }
    } catch {
      // Keep demo data on error
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

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
    const scheduledAt = new Date(scheduleDate);
    scheduledAt.setHours(h ?? 0, min ?? 0, 0, 0);

    // Update local state (demo mode)
    setPurchases((prev) =>
      prev.map((purchase) =>
        purchase.id === p.id
          ? {
              ...purchase,
              scheduleStatus: "scheduled" as ScheduleStatus,
              scheduledDate: scheduleDate.trim(),
              scheduledTime: `${String(h ?? 0).padStart(2, "0")}:${String(min ?? 0).padStart(2, "0")}`,
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
        const timeStr = `${String(h ?? 0).padStart(2, "0")}:${String(min ?? 0).padStart(2, "0")}`;
        
        await addDoc(collection(db, "users", user.id, "onlyfans_calendar_events"), {
          // Core event fields
          title: `${calendarTreatType === 'video_call' ? '📹 Video Call' : calendarTreatType === 'chat_session' ? '💬 Chat Session' : '🎁 Treat'}: ${p.fanName || p.email}`,
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

  const markCompleted = (p: Purchase) => {
    setPurchases((prev) =>
      prev.map((purchase) =>
        purchase.id === p.id
          ? { ...purchase, scheduleStatus: "completed" as ScheduleStatus }
          : purchase
      )
    );
    showToast?.("Marked as completed.", "success");
  };

  const filteredPurchases = purchases.filter((p) => {
    if (filterStatus === "all") {
      // By default, hide scheduled items - they appear on calendar now
      return p.scheduleStatus === "pending";
    }
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
            Treat purchases appear here. Set a date and time and click <strong>Schedule</strong> to add it to your{" "}
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
              ? "No purchases yet. When someone buys from your Treats store, it will appear here."
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
                      {p.fanName || p.email}
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
                      This will add the treat to your <strong>Calendar</strong> and notify the fan.
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
          <li><span className="purchases-dot purchases-dot-treat"></span> Scheduled treats appear on your calendar with a purple badge</li>
          <li><span className="purchases-dot purchases-dot-session"></span> Chat sessions are auto-added when scheduled</li>
          <li>Fans receive a notification when you schedule their purchase</li>
          <li>You can reschedule anytime from here or from the calendar</li>
        </ul>
      </div>
    </div>
  );
};
