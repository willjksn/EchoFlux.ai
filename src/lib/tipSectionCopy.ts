import type { StorefrontLandingContent } from "../../types";

export type TipSectionContext = "landing" | "member";

const DEFAULT_HEADING = "Support this creator";
const DEFAULT_SUBLINE_GUEST = "One-time tip — no subscription needed.";
const DEFAULT_SUBLINE_MEMBER = "Choose any amount to send support.";

/**
 * Tip section copy: same customizable heading on landing and member Tip tab.
 * Landing shows guest subline (e.g. no subscription). Members see a separate subline without that pitch.
 */
export function resolveTipSectionCopy(
  landingContent: StorefrontLandingContent | null | undefined,
  context: TipSectionContext
): { heading: string; subline: string } {
  const lc = landingContent ?? {};
  const heading =
    typeof lc.tipSectionHeading === "string" && lc.tipSectionHeading.trim()
      ? lc.tipSectionHeading.trim()
      : DEFAULT_HEADING;

  if (context === "landing") {
    const subline =
      typeof lc.tipSectionSublineGuest === "string" && lc.tipSectionSublineGuest.trim()
        ? lc.tipSectionSublineGuest.trim()
        : DEFAULT_SUBLINE_GUEST;
    return { heading, subline };
  }

  const subline =
    typeof lc.tipSectionSublineMember === "string" && lc.tipSectionSublineMember.trim()
      ? lc.tipSectionSublineMember.trim()
      : DEFAULT_SUBLINE_MEMBER;
  return { heading, subline };
}
