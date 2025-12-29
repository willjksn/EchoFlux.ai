import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";

function parseAllowlist(raw: string | undefined): string[] {
  return String(raw || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function isInviteOnlyEnabled(): boolean {
  const v = process.env.INVITE_ONLY;
  const s = String(v || "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function isAllowedEmail(email: string, allowlist: string[]): boolean {
  const e = email.toLowerCase().trim();
  return allowlist.some((entryRaw) => {
    const entry = String(entryRaw || "").toLowerCase().trim();
    if (!entry) return false;

    // Domain allow patterns: "@domain.com" or "*@domain.com"
    if (entry.startsWith("@")) return e.endsWith(entry);
    if (entry.startsWith("*@")) return e.endsWith(entry.substring(1));

    // Exact email match
    return e === entry;
  });
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const inviteOnly = isInviteOnlyEnabled();
  const allowlist = parseAllowlist(process.env.INVITE_ALLOWLIST);

  // If invite-only is off, allow everyone.
  if (!inviteOnly) {
    res.status(200).json({ inviteOnly: false, allowed: true });
    return;
  }

  // Try auth (preferred when user is logged in)
  let email: string | undefined;
  try {
    const verifyAuth = await getVerifyAuth();
    const user = await verifyAuth(req);
    email = user?.email || undefined;
  } catch {
    // ignore, fall back to body email
  }

  // Allow body email for pre-auth checks (invite-only beta UX).
  if (!email) {
    const body = (req.body as any) || {};
    if (typeof body.email === "string") email = body.email;
  }

  if (!email) {
    res.status(200).json({
      inviteOnly: true,
      allowed: false,
      note: "Missing email",
    });
    return;
  }

  if (allowlist.length === 0) {
    res.status(200).json({
      inviteOnly: true,
      allowed: false,
      note: "Invite allowlist is empty",
    });
    return;
  }

  res.status(200).json({
    inviteOnly: true,
    allowed: isAllowedEmail(email, allowlist),
  });
}

export default withErrorHandling(handler);


