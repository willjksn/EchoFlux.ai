# EchoFlux AI Cost Estimate — ~50 Creators (Ballpark)

Rough monthly cost for **~50 creators** using EchoFlux AI features (captions, chat session, AI comment replies, DM replies, etc.). Uses current plan limits and typical usage so you can check cost-effectiveness.

---

## 1. What’s included in the estimate

| Feature | Model | Plan limits (from code) | Typical usage assumption |
|--------|--------|---------------------------|---------------------------|
| **AI captions** | Gemini 2.0 Flash Lite | Free 10, Pro 500, Elite 1,500/month | 40% of limit per creator |
| **DM / style replies** | Gemini 2.0 Flash Lite | Free 50, Pro 250, Elite 750/month | 30% of limit per creator |
| **AI comment replies (feed)** | Gemini 2.0 Flash Lite | Elite only, no separate cap | ~40 replies/creator/month for 10 Elite |
| **Chat session (sexting) AI** | Gemini 2.0 Flash | Elite only, rate-limited (8/min) | ~15 sessions × 8 suggestions for 10 Elite |

Other AI (strategy, chatbot, content ideas, etc.) is not counted in detail here; the total adds a small buffer for them.

---

## 2. Pricing used (Google Gemini API, ballpark)

- **Gemini 2.0 Flash Lite:** ~$0.07/1M input, ~$0.30/1M output  
- **Gemini 2.0 Flash:** ~$0.10/1M input, ~$0.40/1M output  

(Check [Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing) for current prices.)

Approximate cost per call (token guesses):

- **Caption:** ~600 input + ~120 output (Flash Lite) → **~$0.00008/caption**
- **Reply (DM or feed):** ~350 input + ~60 output (Flash Lite) → **~$0.00004/reply**
- **Chat session suggestion:** ~1,800 input + ~150 output (Flash) → **~$0.00024/call**

---

## 3. Scenario: 50 creators (30 Pro, 20 Elite)

**Captions (40% of limit):**

- Pro: 30 × 200 = 6,000  
- Elite: 20 × 600 = 12,000  
- Total: 18,000 captions → 18,000 × $0.00008 ≈ **$1.44**

**DM replies (30% of limit):**

- Pro: 30 × 75 = 2,250  
- Elite: 20 × 225 = 4,500  
- Total: 6,750 replies → 6,750 × $0.00004 ≈ **$0.27**

**Feed comment replies (Elite, 10 creators × 40):**

- 400 replies → 400 × $0.00004 ≈ **$0.02**

**Chat session (10 Elite, 15 sessions × 8 suggestions):**

- 1,200 calls → 1,200 × $0.00024 ≈ **$0.29**

**Subtotal (main features):** ~**$2.02/month**

**Buffer for other AI (strategy, chatbot, trends, etc.):** +~50% → **~$3/month**

---

## 4. Ballpark ranges

| Scenario | Monthly AI cost (50 creators) |
|----------|-------------------------------|
| **Light usage** (lower % of limits, fewer chat sessions) | **~$2–4** |
| **Typical usage** (above assumptions) | **~$5–8** |
| **Heavy usage** (high % of limits, lots of chat + feed replies) | **~$10–18** |

So for **~50 creators**, a reasonable expectation is **about $5–10/month** in Gemini (and similar) AI cost for captions, chat session, AI comment replies, and DM replies, with heavy usage possibly up to **~$15–20/month**.

---

## 5. Cost-effectiveness

- **Revenue (ballpark):** 30 Pro × $19 + 20 Elite × $39 ≈ **$1,530/month** (before trials/discounts).
- **AI cost:** **~$5–10/month** typical → **~0.3–0.7%** of that revenue.
- Even at **$20/month** AI cost, it’s still **~1.3%** of revenue.

So at ~50 creators, these AI features are **very cost-effective** relative to plan revenue, as long as you keep using the current models (Flash Lite for captions/replies, Flash for chat session) and similar usage patterns.

---

## 6. Ways to keep cost under control

1. **Keep reply/caption on Flash Lite** (already the case in `_modelRouter.ts`).  
2. **Keep plan limits** (caption/reply caps) so heavy users don’t blow up cost.  
3. **Optional:** Cache repeated caption patterns or add a small cache for feed reply prompts if you see duplicate contexts.  
4. **Monitor:** Log or sample token usage per endpoint (e.g. captions, reply, feed reply, sexting) and review monthly to spot spikes.

---

*Numbers are approximate; actual cost depends on real usage and Google’s current Gemini pricing.*
