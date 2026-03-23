/**
 * Fan / member usernames (EchoFlux Fan Hub).
 * Unique handles live in Firestore `usernames/{lowercase}` (written only via Admin API).
 * Canonical copy on `users/{uid}.username` — clients cannot write username (see firestore.rules).
 */

import { doc, getDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

export const MEMBER_USERNAME_MIN_LENGTH = 3;
export const MEMBER_USERNAME_MAX_LENGTH = 32;

export function normalizeMemberUsername(input: string): string {
  return input.trim().toLowerCase();
}

/** Returns null if valid, otherwise a short error message for UI. */
export function validateMemberUsernameFormat(username: string): string | null {
  const u = normalizeMemberUsername(username);
  if (!u) return "Username is required.";
  if (u.length < MEMBER_USERNAME_MIN_LENGTH) {
    return `Username must be at least ${MEMBER_USERNAME_MIN_LENGTH} characters.`;
  }
  if (u.length > MEMBER_USERNAME_MAX_LENGTH) {
    return `Username must be at most ${MEMBER_USERNAME_MAX_LENGTH} characters.`;
  }
  if (!/^[a-z0-9_]+$/.test(u)) {
    return "Use only lowercase letters, numbers, and underscores.";
  }
  return null;
}

/** Client-side availability: true if this handle is not taken (requires public read on usernames/*). */
export async function isMemberUsernameAvailable(db: Firestore, username: string): Promise<boolean> {
  const formatErr = validateMemberUsernameFormat(username);
  if (formatErr) return false;
  const u = normalizeMemberUsername(username);
  const snap = await getDoc(doc(db, "usernames", u));
  return !snap.exists();
}
