/**
 * Plain text email templates for waitlist communications
 */

export const WAITLIST_EMAIL_TEMPLATES = {
  /**
   * Sent when a user joins the waitlist
   */
  confirmation: (name?: string | null): string => {
    const greeting = name ? `Hi ${name},` : 'Hi there,';
    return `${greeting}

Thanks for joining the EchoFlux.ai testing waitlist — we're excited to learn more about how you plan and create content.

We're currently onboarding a small group of early testers so we can stay close to feedback and refine workflows before full release.

If selected, you'll receive:
• early platform access
• direct feature feedback opportunities
• roadmap visibility
• extended testing allowances

We'll reach out soon with next steps.

— The EchoFlux Team`;
  },

  /**
   * Sent when a user is selected for early testing
   */
  selected: (inviteCode: string, grantPlan: string, expiresAt?: string | null, name?: string | null): string => {
    const greeting = name ? `Hi ${name},` : 'Hi there,';
    const expirationNote = expiresAt 
      ? `\nExpires: ${new Date(expiresAt).toLocaleDateString()}`
      : '';
    
    return `${greeting}

Thanks for signing up — we'd love to bring you into the EchoFlux.ai early testing group 🎉

EchoFlux is currently operating in offline / planning-first mode, with a focus on:
• content strategy generation
• caption workflows
• calendar planning
• media organization

During testing, we're especially looking for feedback around:
✔ ease of navigation
✔ clarity of workflows
✔ feature usefulness
✔ areas where structure could improve

We'll send your onboarding link shortly — along with a short setup guide.

Your Invite Code: ${inviteCode}
Plan: ${grantPlan}${expirationNote}

How to get started:
1) Go to https://echoflux.ai
2) Click "Sign in" → "Sign Up" (or "Continue with Google")
3) Enter the invite code when prompted
4) Complete onboarding

If you have issues, reply to this email.

— The EchoFlux Team`;
  },

  /**
   * Sent on first login (in-app notification or email)
   */
  firstLoginOnboarding: (name?: string | null): string => {
    const greeting = name ? `Hi ${name},` : 'Welcome,';
    return `${greeting}

Welcome to EchoFlux.ai — Early Testing Access

This version is focused on planning workflows only.
Auto-posting and live analytics are intentionally disabled so creators stay fully in control of publishing.

Recommended first steps:
1️⃣ Generate a content strategy
2️⃣ Move items onto your calendar
3️⃣ Use Compose to generate captions
4️⃣ Attach media from your library
5️⃣ Copy + post manually to your platforms

Your feedback directly shapes upcoming releases — thanks for being part of this stage.

— The EchoFlux Team`;
  },

  /**
   * Sent to request feedback from testers
   */
  feedbackRequest: (name?: string | null): string => {
    const greeting = name ? `Hi ${name},` : 'Hi there,';
    return `${greeting}

Thanks for testing EchoFlux so far — your feedback is incredibly valuable to us.

When you've had time to explore, we'd love to know:
• What felt the most useful?
• What felt confusing or unnecessary?
• Where could the planning workflows improve?

Reply anytime — we're reading everything during this phase.

— The EchoFlux Team`;
  },
};
