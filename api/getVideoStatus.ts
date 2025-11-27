// api/getVideoStatus.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.ts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // TODO: Look up job status in your DB or provider.
  return res.status(501).json({
    error: "Video status tracking is not implemented yet.",
    note: "Use a job ID to fetch real status from your video provider.",
  });
}

