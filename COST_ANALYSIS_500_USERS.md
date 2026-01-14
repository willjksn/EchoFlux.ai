# Monthly Cost Analysis for 500 Users

## Assumptions
- **User Distribution**: Equal distribution across plans (167 Free, 167 Pro, 166 Elite)
- **Usage**: All users use 100% of their monthly limits
- **Chatbot**: Average 50 queries per user per month (no hard limit)
- **Voice Assistant**: **ADMIN ONLY** - 10 sessions total per month, 3 minutes per session (assumes 3 admin users, minimal usage)
- **Token Estimates**: Based on typical prompt/response sizes

---

## Plan Limits (Monthly)

### Free Plan (167 users)
- Strategies: 1 per user = **167 strategies**
- Captions: 10 per user = **1,670 captions**
- Replies: 50 per user = **8,350 replies**
- Chatbot: 50 queries per user = **8,350 queries**
- Voice Assistant: Not available

### Pro Plan (167 users)
- Strategies: 2 per user = **334 strategies**
- Captions: 500 per user = **83,500 captions**
- Replies: 250 per user = **41,750 replies**
- Chatbot: 50 queries per user = **8,350 queries**
- Voice Assistant: Not available (Admin only)

### Elite Plan (166 users)
- Strategies: 5 per user = **830 strategies**
- Captions: 1,500 per user = **249,000 captions**
- Replies: 750 per user = **124,500 replies**
- Chatbot: 50 queries per user = **8,300 queries**
- Voice Assistant: Not available (Admin only)

### Admin Users (3 users - assumed)
- Voice Assistant: **10 sessions total**, 3 minutes per session

---

## Total Monthly Usage

| Feature | Total Requests |
|---------|---------------|
| Strategies | 1,331 |
| Captions | 334,170 |
| Replies | 174,600 |
| Chatbot Queries | 25,000 |
| Voice Assistant Sessions (Admin Only) | 10 |

---

## Model Costs (Google Gemini Pricing - January 2026)

### Gemini 2.0 Flash Lite (Low Cost Tier)
- **Input**: $0.075 per million tokens
- **Output**: $0.30 per million tokens
- Used for: Captions, Replies

### Gemini 2.0 Flash (Medium Cost Tier)
- **Input**: $0.15 per million tokens
- **Output**: $0.60 per million tokens
- Used for: Strategies, Chatbot, Content Gap Analysis, Performance Prediction, Content Repurposing, Sexting Sessions

### Gemini 2.5 Flash Native Audio (Voice Assistant)
- **Text Input**: $0.50 per million tokens
- **Audio Input**: $3.00 per million tokens
- **Text Output**: $2.00 per million tokens
- **Audio Output**: $12.00 per million tokens

---

## Token Estimates Per Request

### Captions (Flash Lite)
- **Input**: ~2,000 tokens (prompt + context + media description)
- **Output**: ~500 tokens (3-5 captions with hashtags)
- **Total per caption**: ~2,500 tokens

### Strategies (Flash)
- **Input**: ~3,000 tokens (detailed prompt with context)
- **Output**: ~8,000 tokens (multi-week roadmap)
- **Total per strategy**: ~11,000 tokens

### Replies (Flash Lite)
- **Input**: ~1,000 tokens (message + context)
- **Output**: ~200 tokens (short reply)
- **Total per reply**: ~1,200 tokens

### Chatbot Queries (Flash)
- **Input**: ~5,000 tokens (question + knowledge base)
- **Output**: ~1,000 tokens (answer)
- **Total per query**: ~6,000 tokens

### Voice Assistant Sessions (Native Audio)
- **Text Input**: ~5,000 tokens (system instruction + knowledge base)
- **Audio Input**: ~30,000 tokens per 3-minute session (estimated)
- **Text Output**: ~500 tokens (occasional text responses)
- **Audio Output**: ~60,000 tokens per 3-minute session (estimated)
- **Total per session**: ~95,500 tokens

---

## Cost Calculations

### 1. Captions (334,170 requests)
- Input: 334,170 × 2,000 = 668,340,000 tokens = 668.34M tokens
- Output: 334,170 × 500 = 167,085,000 tokens = 167.09M tokens
- **Cost**: (668.34 × $0.075) + (167.09 × $0.30) = $50.13 + $50.13 = **$100.26**

### 2. Strategies (1,331 requests)
- Input: 1,331 × 3,000 = 3,993,000 tokens = 3.99M tokens
- Output: 1,331 × 8,000 = 10,648,000 tokens = 10.65M tokens
- **Cost**: (3.99 × $0.15) + (10.65 × $0.60) = $0.60 + $6.39 = **$6.99**

### 3. Replies (174,600 requests)
- Input: 174,600 × 1,000 = 174,600,000 tokens = 174.60M tokens
- Output: 174,600 × 200 = 34,920,000 tokens = 34.92M tokens
- **Cost**: (174.60 × $0.075) + (34.92 × $0.30) = $13.10 + $10.48 = **$23.58**

### 4. Chatbot Queries (25,000 requests)
- Input: 25,000 × 5,000 = 125,000,000 tokens = 125M tokens
- Output: 25,000 × 1,000 = 25,000,000 tokens = 25M tokens
- **Cost**: (125 × $0.15) + (25 × $0.60) = $18.75 + $15.00 = **$33.75**

### 5. Voice Assistant Sessions (Admin Only - 10 sessions, 3 min each)
- Text Input: 10 × 5,000 = 50,000 tokens = 0.05M tokens
- Audio Input: 10 × 30,000 = 300,000 tokens = 0.3M tokens
- Text Output: 10 × 500 = 5,000 tokens = 0.005M tokens
- Audio Output: 10 × 60,000 = 600,000 tokens = 0.6M tokens
- **Cost**: 
  - Text Input: 0.05 × $0.50 = $0.03
  - Audio Input: 0.3 × $3.00 = $0.90
  - Text Output: 0.005 × $2.00 = $0.01
  - Audio Output: 0.6 × $12.00 = $7.20
  - **Total Voice (Admin Only)**: **$8.14**

### 6. Premium Content Studio Features (Elite users only - 166 users)
Assuming Elite users use Premium Content Studio features:
- **Content Gap Analysis**: ~50 per user = 8,300 requests (Flash model)
  - Input: 8,300 × 4,000 = 33.2M tokens
  - Output: 8,300 × 3,000 = 24.9M tokens
  - Cost: (33.2 × $0.15) + (24.9 × $0.60) = $4.98 + $14.94 = **$19.92**

- **Performance Predictions**: ~30 per user = 4,980 requests (Flash model)
  - Input: 4,980 × 3,500 = 17.43M tokens
  - Output: 4,980 × 2,500 = 12.45M tokens
  - Cost: (17.43 × $0.15) + (12.45 × $0.60) = $2.61 + $7.47 = **$10.08**

- **Content Repurposing**: ~20 per user = 3,320 requests (Flash model)
  - Input: 3,320 × 3,000 = 9.96M tokens
  - Output: 3,320 × 2,000 = 6.64M tokens
  - Cost: (9.96 × $0.15) + (6.64 × $0.60) = $1.49 + $3.98 = **$5.47**

- **Sexting Session Suggestions**: ~100 per user = 16,600 requests (Flash model)
  - Input: 16,600 × 2,000 = 33.2M tokens
  - Output: 16,600 × 800 = 13.28M tokens
  - Cost: (33.2 × $0.15) + (13.28 × $0.60) = $4.98 + $7.97 = **$12.95**

- **Roleplay Scenarios**: ~20 per user = 3,320 requests (Flash model via generateText)
  - Input: 3,320 × 5,000 = 16.6M tokens
  - Output: 3,320 × 4,000 = 13.28M tokens
  - Cost: (16.6 × $0.15) + (13.28 × $0.60) = $2.49 + $7.97 = **$10.46**

- **Body Ratings**: ~30 per user = 4,980 requests (Flash model via generateText)
  - Input: 4,980 × 2,500 = 12.45M tokens
  - Output: 4,980 × 1,500 = 7.47M tokens
  - Cost: (12.45 × $0.15) + (7.47 × $0.60) = $1.87 + $4.48 = **$6.35**

- **Interactive Posts**: ~20 per user = 3,320 requests (Flash model via generateText)
  - Input: 3,320 × 2,500 = 8.3M tokens
  - Output: 3,320 × 1,500 = 4.98M tokens
  - Cost: (8.3 × $0.15) + (4.98 × $0.60) = $1.25 + $2.99 = **$4.24**

- **Subscriber Messages**: ~50 per user = 8,300 requests (Flash model via generateText)
  - Input: 8,300 × 2,000 = 16.6M tokens
  - Output: 8,300 × 1,000 = 8.3M tokens
  - Cost: (16.6 × $0.15) + (8.3 × $0.60) = $2.49 + $4.98 = **$7.47**

**Premium Content Studio Subtotal**: $77.94

---

## TOTAL MONTHLY COST BREAKDOWN

| Feature Category | Monthly Cost |
|-----------------|--------------|
| Captions | $100.26 |
| Strategies | $6.99 |
| Replies | $23.58 |
| Chatbot Queries | $33.75 |
| Voice Assistant (Admin Only) | **$8.14** |
| Premium Content Studio | $77.94 |
| **TOTAL** | **$250.66** |

---

## Key Findings

1. **Voice Assistant (Admin Only) is now a minimal cost** at ~3.2% of total costs ($8.14)
   - Audio input/output is expensive ($3/$12 per million tokens)
   - 3-minute sessions generate ~95,500 tokens each
   - 10 admin sessions = 955,000 tokens (0.955M tokens)
   - **Restricting to admin only with minimal usage reduced voice costs by 99.99%** (from $67,607.34 to $8.14)

2. **Text-based features are very affordable**:
   - Captions: $100.26 (334K requests)
   - Strategies: $6.99 (1.3K requests)
   - Replies: $23.58 (175K requests)
   - Chatbot: $33.75 (25K requests)
   - Premium Content Studio: $77.94

3. **Cost per user per month**:
   - **Total**: **$0.50/user/month** (down from $135.70/user/month)
   - Text features only: **$0.48/user/month**
   - Voice (admin only): **$0.02/user/month** (amortized across all users)

---

## Recommendations

1. **Voice Assistant (Admin Only) - IMPLEMENTED**:
   - ✅ Voice assistant restricted to Admin users only
   - ✅ Cost reduced from $67,607.34/month to $8.14/month (99.99% reduction)
   - Admin users can still use voice assistant for support and testing (10 sessions/month, 3 min each)
   - Regular users no longer have access to voice assistant

2. **Text Features Are Efficient**:
   - Current text-based features (captions, strategies, replies, chatbot) cost only **$164.58/month** for 500 users
   - These can scale significantly without major cost impact
   - Premium Content Studio adds only $77.94/month for Elite users

3. **Scaling Considerations**:
   - At $0.50/user/month, the platform is highly cost-effective
   - Can support 1,000 users for ~$1,000/month
   - Can support 5,000 users for ~$5,000/month
   - Can support 10,000 users for ~$10,000/month
   - Voice assistant costs are negligible ($8.14/month for 10 sessions)

---

## Scenario Variations

### Scenario A: Current Implementation (Admin Only - 10 sessions, 3 min each)
- Voice Sessions: 10 (Admin only)
- Voice Cost: **$8.14**
- **Total Monthly Cost**: **$250.66** ($0.50/user/month)

### Scenario B: Moderate Admin Usage (20 sessions, 3 min each)
- Voice Sessions: 20 (Admin only)
- Voice Cost: **$16.28**
- **Total Monthly Cost**: **$258.80** ($0.52/user/month)

### Scenario C: No Voice Assistant (Complete Removal)
- **Total Monthly Cost**: **$242.52** ($0.49/user/month)

---

## Notes

- Token estimates are approximations based on typical prompt/response sizes
- Actual costs may vary based on:
  - Prompt complexity
  - Response length
  - Media analysis (images/videos add tokens)
  - User behavior patterns
- Voice assistant costs are highly variable based on session length and frequency
- Consider implementing usage analytics to track actual token consumption
