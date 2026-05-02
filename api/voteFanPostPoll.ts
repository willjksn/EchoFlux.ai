import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { applyBrowserApiCors } from "./_browserApiCors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyBrowserApiCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authed = await verifyAuth(req);
  if (!authed?.uid) return res.status(401).json({ error: "Sign in to vote in polls." });

  const creatorId = typeof req.body?.creatorId === "string" ? req.body.creatorId.trim() : "";
  const postId = typeof req.body?.postId === "string" ? req.body.postId.trim() : "";
  const optionIndex = Number(req.body?.optionIndex);
  if (!creatorId || !postId || !Number.isInteger(optionIndex) || optionIndex < 0) {
    return res.status(400).json({ error: "Invalid poll vote." });
  }

  const db = getAdminDb();
  if (!db) return res.status(500).json({ error: "Database unavailable" });

  try {
    const postRef = db.collection("creators").doc(creatorId).collection("fanPosts").doc(postId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(postRef);
      if (!snap.exists) throw new Error("This poll is no longer available.");
      const data = snap.data() as Record<string, unknown>;
      const status = typeof data.status === "string" ? data.status.trim().toLowerCase() : "published";
      if (authed.uid !== creatorId && status !== "published") {
        throw new Error("This poll is not available.");
      }
      const rawPoll = data.poll && typeof data.poll === "object" ? (data.poll as Record<string, unknown>) : null;
      if (!rawPoll) throw new Error("This poll is no longer available.");
      const options = Array.isArray(rawPoll.options)
        ? rawPoll.options.filter((option): option is string => typeof option === "string" && !!option.trim())
        : [];
      if (options.length < 2 || optionIndex >= options.length) {
        throw new Error("That poll option is no longer available.");
      }

      const votesByFan =
        rawPoll.votesByFan && typeof rawPoll.votesByFan === "object"
          ? { ...(rawPoll.votesByFan as Record<string, unknown>) }
          : {};
      if (typeof votesByFan[authed.uid] === "number") return;

      const optionVotes = Array.isArray(rawPoll.optionVotes)
        ? rawPoll.optionVotes.map((vote) =>
            typeof vote === "number" && Number.isFinite(vote) ? Math.max(0, Math.round(vote)) : 0,
          )
        : options.map(() => 0);
      while (optionVotes.length < options.length) optionVotes.push(0);
      optionVotes[optionIndex] = (optionVotes[optionIndex] ?? 0) + 1;
      votesByFan[authed.uid] = optionIndex;

      tx.set(
        postRef,
        {
          poll: {
            ...rawPoll,
            options,
            optionVotes: optionVotes.slice(0, options.length),
            votesByFan,
          },
        },
        { merge: true },
      );
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save your vote.";
    return res.status(400).json({ error: message });
  }
}
