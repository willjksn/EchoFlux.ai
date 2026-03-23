/**
 * Re-export for imports that still use `src/hooks/...`.
 * Implementation lives in `components/useUnreadNewMessageNotifications.ts` next to other UI modules
 * to avoid circular bundle issues where the hook could be undefined at runtime.
 */
export {
  useUnreadNewMessageNotificationCount,
  clearNewMessageNotificationBadge,
} from "../../components/useUnreadNewMessageNotifications";
