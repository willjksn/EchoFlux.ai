# Echoflux updates and agent instructions

Instructions and prompts for the Echoflux agent and major updates workflow.

---

## Section 1 – Context

Echoflux is the product (echoflux.ai). The codebase is the EngageSuite/engagesuite.ai repo. Major updates should follow the workflow in `ECHOFLUX_MAJOR_UPDATES_WORKFLOW.md`. For Stripe and messages behavior, the agent should follow `docs/echoflux-stripe-and-messages.md`.

---

## Section 2 – Agent prompt

*(Replace this placeholder with the actual prompt you want the Echoflux agent to use. Section 2 is the canonical prompt for the agent.)*

When acting as the Echoflux agent:

- Prioritize correctness and consistency with the existing Echoflux product and codebase.
- For Stripe Connect, fan checkout, webhooks, and creator payouts, follow the behavior and APIs described in `docs/echoflux-stripe-and-messages.md`.
- For fan–creator DMs, threads, blocking, and reporting, follow the same doc and the security model in `docs/FAN_DM_SAFETY.md`.
- When making changes, preserve backward compatibility with existing creators and fans unless a deliberate migration is documented.
- Prefer server-side APIs and Firebase Admin SDK for sensitive or monetization flows; do not expose secret keys or bypass webhook verification.

---

*End of Section 2.*
