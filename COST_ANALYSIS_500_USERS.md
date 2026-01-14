# Monthly Cost Analysis for 500 Users

## Assumptions
- **User Distribution**: Equal distribution across plans (167 Free, 167 Pro, 166 Elite)
- **Usage**: All users use 100% of their monthly limits
- **Chatbot**: Average 50 queries per user per month (no hard limit)
- **Voice Assistant**: Average 30 sessions per user per month, 5 minutes per session (Pro/Elite only)
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
- Voice Assistant: 30 sessions × 5 min = **150 sessions/user** = **25,050 sessions**

### Elite Plan (166 users)
- Strategies: 5 per user = **830 strategies**
- Captions: 1,500 per user = **249,000 captions**
- Replies: 750 per user = **124,500 replies**
- Chatbot: 50 queries per user = **8,300 queries**
- Voice Assistant: 30 sessions × 5 min = **150 sessions/user** = **24,900 sessions**

---

## Total Monthly Usage

| Feature | Total Requests |
|---------|---------------|
| Strategies | 1,331 |
| Captions | 334,170 |
| Replies | 174,600 |
| Chatbot Queries | 25,000 |
| Voice Assistant Sessions | 49,950 |

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
- **Audio Input**: ~50,000 tokens per 5-minute session (estimated)
- **Text Output**: ~500 tokens (occasional text responses)
- **Audio Output**: ~100,000 tokens per 5-minute session (estimated)
- **Total per session**: ~156,000 tokens

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

### 5. Voice Assistant Sessions (49,950 sessions)
- Text Input: 49,950 × 5,000 = 249,750,000 tokens = 249.75M tokens
- Audio Input: 49,950 × 50,000 = 2,497,500,000 tokens = 2,497.5M tokens
- Text Output: 49,950 × 500 = 24,975,000 tokens = 24.98M tokens
- Audio Output: 49,950 × 100,000 = 4,995,000,000 tokens = 4,995M tokens
- **Cost**: 
  - Text Input: 249.75 × $0.50 = $124.88
  - Audio Input: 2,497.5 × $3.00 = $7,492.50
  - Text Output: 24.98 × $2.00 = $49.96
  - Audio Output: 4,995 × $12.00 = $59,940.00
  - **Total Voice**: **$67,607.34**

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
| Voice Assistant | **$67,607.34** |
| Premium Content Studio | $77.94 |
| **TOTAL** | **$67,849.86** |

---

## Key Findings

1. **Voice Assistant is the largest cost driver** at ~99.6% of total costs ($67,607.34)
   - Audio input/output is expensive ($3/$12 per million tokens)
   - 5-minute sessions generate ~156,000 tokens each
   - 49,950 sessions = 7.8 billion tokens

2. **Text-based features are very affordable**:
   - Captions: $100.26 (334K requests)
   - Strategies: $6.99 (1.3K requests)
   - Replies: $23.58 (175K requests)
   - Chatbot: $33.75 (25K requests)
   - Premium Content Studio: $77.94

3. **Cost per user per month**:
   - With Voice Assistant: **$135.70/user/month**
   - Without Voice Assistant: **$0.48/user/month**

---

## Recommendations

1. **Voice Assistant Cost Optimization**:
   - Consider session time limits (e.g., 3 minutes instead of 5)
   - Implement usage caps for voice assistant (e.g., 20 sessions/month for Pro, 50 for Elite)
   - Consider batch processing for non-real-time voice queries
   - Monitor and optimize audio token usage

2. **Alternative Voice Pricing**:
   - If voice assistant usage is lower (e.g., 10 sessions/user/month), cost drops to **$22,535.78/month** ($45.07/user/month)
   - If voice assistant is limited to Elite only (166 users × 30 sessions = 4,980 sessions), cost drops to **$6,760.73/month** ($13.52/user/month)

3. **Text Features Are Efficient**:
   - Current text-based features (captions, strategies, replies, chatbot) cost only **$164.58/month** for 500 users
   - These can scale significantly without major cost impact

---

## Scenario Variations

### Scenario A: Conservative Voice Usage (10 sessions/user/month)
- Voice Sessions: 16,650 (Pro) + 16,600 (Elite) = 33,250 sessions
- Voice Cost: **$45,071.25**
- **Total Monthly Cost**: **$45,303.17** ($90.61/user/month)

### Scenario B: Voice Assistant Elite Only
- Voice Sessions: 24,900 (Elite only)
- Voice Cost: **$33,803.67**
- **Total Monthly Cost**: **$34,036.59** ($68.07/user/month)

### Scenario C: No Voice Assistant
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
