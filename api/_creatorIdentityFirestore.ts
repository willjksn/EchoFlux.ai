import type admin from "firebase-admin";

const COLLECTION = "creatorIdentity";

export type CreatorIdentityDoc = Record<string, unknown>;

export async function getCreatorIdentityCurrent(
  db: admin.firestore.Firestore,
  uid: string
): Promise<CreatorIdentityDoc | null> {
  const snap = await db.collection("users").doc(uid).collection(COLLECTION).doc("current").get();
  if (!snap.exists) return null;
  return (snap.data() || {}) as CreatorIdentityDoc;
}
