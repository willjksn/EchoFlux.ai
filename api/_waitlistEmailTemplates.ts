/**
 * Plain text email templates for waitlist communications
 */

export const WAITLIST_EMAIL_TEMPLATES = {
  /**
   * Sent when a user joins the waitlist
   */
  confirmation: (name?: string | null): string => {
    return `Thanks for joining the EchoFlux.ai testing waitlist — we’re excited to learn more about how you plan and create content.

We’re currently onboarding a small group of early testers so we can stay close to feedback and refine workflows before full release.

If selected, you’ll receive:
• early platform access
• direct feature feedback opportunities
• roadmap visibility
• extended testing allowances

We’ll reach out soon with next steps.

— The EchoFlux Team`;
  },

  /**
   * Sent when a user is selected for early testing
   */
  selected: (inviteCode: string, grantPlan: string, expiresAt?: string | null, name?: string | null): string => {
    const expirationNote = expiresAt ? ` (expires ${new Date(expiresAt).toLocaleDateString()})` : '';

    return `You are now apart of the EchoFlux.ai early testing group 🎉

EchoFlux is currently operating in offline / planning-first mode, with a focus on:
• content strategy generation
• caption workflows
• calendar planning
• media organization

During testing, we’re especially looking for feedback around:
✔ ease of navigation
✔ clarity of workflows
✔ feature usefulness
✔ areas where structure could improve

We’ll send your onboarding link shortly — along with a short setup guide.

Onboarding link: https://echoflux.ai
Invite code: ${inviteCode}
Plan: ${grantPlan}${expirationNote}

If you have issues, reply to this email.

— The EchoFlux Team`;
  },

  /**
   * Sent on first login (in-app notification or email)
   */
  firstLoginOnboarding: (name?: string | null): string => {
    return `Welcome to EchoFlux.ai — Early Testing Access

This version is focused on planning workflows only.
Auto-posting and live analytics are intentionally disabled so creators stay fully in control of publishing.

Recommended first steps:
1️⃣ Open Plan → Today for content ideas
2️⃣ Move items onto your calendar
3️⃣ Use Create Post for captions
4️⃣ Attach media from Vault
5️⃣ Copy + post manually to your platforms (or use Fan Hub / witme.io for fans)

Your feedback directly shapes upcoming releases — thanks for being part of this stage.

— The EchoFlux Team`;
  },

  /**
   * Sent to request feedback from testers
   */
  feedbackRequest: (name?: string | null): string => {
    return `Thanks for testing EchoFlux so far — your feedback is incredibly valuable to us.

When you’ve had time to explore, we’d love to know:
• What felt the most useful?
• What felt confusing or unnecessary?
• Where could the planning workflows improve?

Reply anytime — we’re reading everything during this phase.

— The EchoFlux Team`;
  },

  /**
   * Automatic feedback request — 7 days after approval
   */
  feedbackDay7: (name?: string | null): string => {
    return `Thanks for testing EchoFlux so far — your feedback is incredibly valuable to us.

If you have 2 minutes, could you reply with a quick answer to these?
• What was the first workflow you tried (Strategy / Calendar / Compose / Media)?
• What felt the most useful so far?
• What felt confusing or unnecessary?
• What’s one improvement that would make you use EchoFlux every week?
• Anything you expected to see but couldn’t find?

Reply anytime — we’re reading everything during this phase.

— The EchoFlux Team`;
  },

  /**
   * Automatic final feedback — 14 days after approval
   */
  feedbackDay14: (name?: string | null): string => {
    return `Final check-in — thanks again for being part of EchoFlux early testing.

If you’re open to one more round of feedback, could you answer these?
• On a scale of 1–10, how likely are you to keep using EchoFlux for planning? Why?
• What planning workflow should we improve first (Plan / Calendar / Create Post / Vault)?
• What feature would make EchoFlux “must-have” for you?
• What should we remove or simplify?
• If EchoFlux had one “wow” moment, what should it be?

Reply anytime — we’re reading everything during this phase.

— The EchoFlux Team`;
  },
};
