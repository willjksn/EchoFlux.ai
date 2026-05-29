import type { Firestore } from "firebase-admin/firestore";
import { getAdminApp } from "./_firebaseAdmin.js";

function normalizedEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/**
 * Resolve canonical Firebase Auth UID for a Fan Hub member on a creator page.
 */
export async function resolveFanHubMemberAuthUid(
  db: Firestore,
  creatorId: string,
  input: { fanId?: string; fanEmail?: string },
): Promise<{ fanId: string; email: string } | null> {
  const creator = creatorId.trim();
  if (!creator) return null;

  let fanId = typeof input.fanId === "string" ? input.fanId.trim() : "";
  let email = normalizedEmail(input.fanEmail);

  if (fanId.includes("@")) {
    if (!email) email = fanId.toLowerCase();
    fanId = "";
  }

  if (email) {
    try {
      const authUid = (await getAdminApp().auth().getUserByEmail(email)).uid;
      if (authUid) fanId = authUid;
    } catch {
      /* no Auth user for this email */
    }
  }

  if (!fanId && email) {
    const fansCol = db.collection("creators").doc(creator).collection("fans");
    const byDocId = await fansCol.doc(email).get();
    if (byDocId.exists) {
      fanId = byDocId.id;
    } else {
      const byEmail = await fansCol.where("email", "==", email).limit(5).get();
      if (!byEmail.empty) fanId = byEmail.docs[0].id;
    }
  }

  if (!fanId) return null;

  const fanRef = db.collection("creators").doc(creator).collection("fans").doc(fanId);
  const fanSnap = await fanRef.get();
  if (!fanSnap.exists && email) {
    await fanRef.set(
      {
        id: fanId,
        creatorId: creator,
        email,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } else if (fanSnap.exists && !email) {
    const d = fanSnap.data() as { email?: string };
    email = normalizedEmail(d.email) || email;
  }

  if (!email) {
    const subSnap = await db
      .collection("creatorSubscribers")
      .doc(creator)
      .collection("subscribers")
      .doc(fanId)
      .get();
    const subEmail = normalizedEmail((subSnap.data() as { email?: string; fanEmail?: string } | undefined)?.email);
    const subFanEmail = normalizedEmail((subSnap.data() as { fanEmail?: string } | undefined)?.fanEmail);
    email = subEmail || subFanEmail || email;
  }

  return { fanId, email: email || "" };
}
