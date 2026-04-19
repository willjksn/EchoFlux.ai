/**
 * Persist "read" dismissals for in-app usage warnings (bell). Survives full page refresh until month rolls over.
 */
export function usageNotificationMonthKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function usageDismissedStorageKey(userId: string): string {
    return `usageNotifyDismissed:${userId}:${usageNotificationMonthKey()}`;
}

export function loadDismissedUsageNotificationIds(userId: string | undefined): Set<string> {
    if (!userId || typeof localStorage === 'undefined') return new Set();
    try {
        const raw = localStorage.getItem(usageDismissedStorageKey(userId));
        if (!raw) return new Set();
        const arr = JSON.parse(raw) as unknown;
        if (!Array.isArray(arr)) return new Set();
        return new Set(arr.filter((x): x is string => typeof x === 'string' && x.length > 0));
    } catch {
        return new Set();
    }
}

export function dismissUsageNotificationId(userId: string | undefined, notificationId: string): void {
    if (!userId || !notificationId || typeof localStorage === 'undefined') return;
    try {
        const key = usageDismissedStorageKey(userId);
        const s = loadDismissedUsageNotificationIds(userId);
        s.add(notificationId);
        localStorage.setItem(key, JSON.stringify([...s]));
    } catch {
        /* ignore quota */
    }
}

export function dismissUsageNotificationIds(userId: string | undefined, ids: string[]): void {
    if (!userId || !ids.length) return;
    for (const id of ids) dismissUsageNotificationId(userId, id);
}
