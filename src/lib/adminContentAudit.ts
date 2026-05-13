/** Append-only moderator review trail (Firestore: `admin_content_audit_events`). */
export const ADMIN_CONTENT_AUDIT_EVENTS_COLLECTION = "admin_content_audit_events" as const;

export type AdminContentAuditAction = "view_creator_fan_hub_feed";
