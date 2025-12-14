# Cost Monitoring & Pricing Analysis

## Overview
This document tracks the cost structure of AI features in EchoFlux.AI and ensures pricing plans remain profitable while providing value to users.

## AI Model Costs (as of January 2025)

### Gemini 2.0 Flash Lite (Primary Model for Captions & Replies)
- **Input:** $0.0375 per 1M tokens
- **Output:** $0.15 per 1M tokens
- **Used for:** Caption generation, AI replies, message categorization, hashtag generation

### Gemini 2.0 Flash (Standard Model)
- **Input:** $0.075 per 1M tokens
- **Output:** $0.30 per 1M tokens
- **Used for:** Content strategy, analytics reports, autopilot suggestions

### Gemini 2.0 Flash Thinking (Advanced Model)
- **Input:** $0.50 per 1M tokens
- **Output:** $1.50 per 1M tokens
- **Used for:** Complex analytics, deep insights

### Gemini 1.5 Pro (Premium Model)
- **Input:** $1.25 per 1M tokens
- **Output:** $5.00 per 1M tokens
- **Used for:** Advanced content generation, complex tasks

## Cost Per Feature Estimate

### AI Caption Generation
- **Model:** gemini-2.0-flash-lite
- **Estimated tokens per caption:**
  - Input: ~3,000 tokens (prompt + image processing)
  - Output: ~500 tokens (caption + hashtags)
  - **Total: ~3,500 tokens per caption**
- **Cost per caption:** ~$0.0002 ($0.20 per 1,000 captions)
  - Input cost: (3,000 / 1,000,000) × $0.0375 = $0.0001125
  - Output cost: (500 / 1,000,000) × $0.15 = $0.000075
  - **Total: $0.0001875 ≈ $0.0002 per caption**

### AI Reply Generation
- **Model:** gemini-2.0-flash-lite
- **Estimated tokens per reply:**
  - Input: ~1,500 tokens (message context + user settings)
  - Output: ~300 tokens (reply text)
  - **Total: ~1,800 tokens per reply**
- **Cost per reply:** ~$0.0001 ($0.10 per 1,000 replies)
  - Input cost: (1,500 / 1,000,000) × $0.0375 = $0.00005625
  - Output cost: (300 / 1,000,000) × $0.15 = $0.000045
  - **Total: $0.00010125 ≈ $0.0001 per reply**

## Plan Cost Analysis

### Creator Plans

| Plan | Price | Captions | Caption Cost | Replies | Reply Cost | Total AI Cost | Margin |
|------|-------|----------|--------------|---------|------------|--------------|--------|
| **Free** | $0 | 0 | $0 | 25 | $0.0025 | $0.0025 | N/A |
| **Caption Pro** | $9 | 100 | $0.02 | 0 | $0 | $0.02 | $8.98 (99.8%) |
| **Pro** | $29 | 500 | $0.10 | 250 | $0.025 | $0.125 | $28.88 (99.6%) |
| **Elite** | $149 | 1,500 | $0.30 | 750 | $0.075 | $0.375 | $148.63 (99.7%) |
| **Agency** | Custom | 10,000* | $2.00* | 2,000 | $0.20 | $2.20* | Variable |

*Agency plan includes 10,000 captions/month. Overage: $0.01 per caption beyond limit.

### Business Plans

| Plan | Price | Captions | Caption Cost | Replies | Reply Cost | Total AI Cost | Margin |
|------|-------|----------|--------------|---------|------------|--------------|--------|
| **Starter** | $99 | 1,000 | $0.20 | 500 | $0.05 | $0.25 | $98.75 (99.7%) |
| **Growth** | $199 | 2,500 | $0.50 | 1,500 | $0.15 | $0.65 | $198.35 (99.7%) |

## Agency Plan Overage Fees

To prevent abuse and ensure sustainability, the Agency plan includes soft caps with overage fees:

| Feature | Included | Overage Fee | Rationale |
|---------|----------|-------------|-----------|
| **AI Captions** | 10,000/month | $0.01 per caption | 50x markup on cost ($0.0002 → $0.01) |
| **AI Replies** | 2,000/month | $0.05 per reply | 500x markup on cost ($0.0001 → $0.05) |
| **Image Generation** | Coming Soon - Unlimited* | Review if excessive | Subject to fair use policy |
| **Video Generation** | Coming Soon - 50/month | $2.00 per video | Covers higher processing costs |

*Unlimited features are subject to fair use. Usage exceeding 10x typical plan usage may trigger review.

## Cost Monitoring Recommendations

### 1. Track Actual Usage
- Monitor token consumption per request type
- Compare estimated vs. actual costs monthly
- Adjust estimates if actual costs differ significantly

### 2. Set Up Alerts
- Alert when Agency plan usage exceeds 80% of soft cap
- Alert when any plan's actual cost exceeds 5% of plan price
- Alert when model costs increase (Google pricing changes)

### 3. Review Monthly
- Calculate actual cost per feature
- Compare to plan prices
- Identify plans that may need adjustment
- Review Agency overage revenue

### 4. Cost Optimization
- Use cheapest model appropriate for task (gemini-2.0-flash-lite for captions/replies)
- Cache common responses where possible
- Monitor for abuse or unusual usage patterns
- Consider rate limiting for high-cost features

## Fair Use Policy

### Unlimited Features
Features marked as "Unlimited" are subject to reasonable use:
- **Definition:** Usage that exceeds 10x the typical plan usage
- **Action:** Contact subscriber to discuss custom pricing or usage optimization
- **Examples:**
  - Agency plan generating 100,000+ captions/month
  - Single user generating 50,000+ replies/month

### Monitoring
- Track usage patterns monthly
- Flag accounts with unusual spikes
- Review quarterly for policy adjustments

## Future Considerations

1. **Model Cost Changes:** Google may adjust pricing. Review quarterly.
2. **New Features:** Calculate costs before adding new AI features.
3. **Volume Discounts:** Consider negotiating with Google for high-volume usage.
4. **BYOK (Bring Your Own Key):** Already available for Elite/Agency plans to reduce costs for high-volume users.

## Cost Tracking Implementation

The app tracks model usage via `api/trackModelUsage.ts`:
- Logs every AI request with model, tokens, and estimated cost
- Stores in Firestore collection: `modelUsageLogs`
- Analytics available in Admin Dashboard

### Key Metrics to Monitor:
- Total requests per plan
- Average cost per request
- Total cost per plan
- Overage revenue (Agency plan)
- Cost trends over time

## Notes

- Cost estimates are conservative and may be lower in practice
- Actual token usage varies based on prompt complexity and media size
- Image processing costs are included in caption generation estimates
- Overage fees provide significant margin (50-500x markup) to cover infrastructure and support costs


