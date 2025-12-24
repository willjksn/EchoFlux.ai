# Strategy Workflow Integration Proposal

## Current State Analysis

### How Strategy Currently Works:
1. **Generate Roadmap** → AI creates multi-week plan with daily suggestions
2. **Upload Media** → User uploads image/video to a suggestion
3. **Auto-Generate Caption** → AI creates caption based on media + strategy context
4. **Status Changes** → Immediately sets to "Scheduled" and creates Post + CalendarEvent
5. **Problem**: Status is misleading (not actually scheduled yet), calendar may not show it

### How Other Features Work:
- **Opportunities**: Finds trends → Can send to Strategy OR create content directly
- **Content Intelligence**: Standalone tools (gap analysis, optimize, predict, repurpose)
- **AI Weekly Plan**: Generates suggestions on Dashboard → Stored in localStorage
- **Calendar**: Shows events from various sources

---

## Proposed Integrated Workflow

### 🎯 **Core Concept: Strategy as Content Alignment Hub**

Strategy should be a **planning and alignment tool** where you:
1. Get AI-generated roadmap suggestions
2. **Align your media** to those suggestions
3. **Refine with Content Intelligence** (optimize, predict, repurpose)
4. **Schedule when ready** (not automatically)

### 📊 **Status Flow (Clearer States)**

```
Draft (no media) 
  → Ready (media uploaded, caption generated) 
  → Scheduled (user explicitly schedules it)
  → Posted (user marks as posted)
```

**Current Problem**: Jumps from Draft → Scheduled (confusing)
**Solution**: Use "Ready" status when media is uploaded, only "Scheduled" when user schedules it

---

## Integrated Feature Connections

### 1. **Opportunities → Strategy**
- ✅ Already works: Can send opportunity to Strategy
- **Enhancement**: When creating content from opportunity, offer:
  - "Add to Strategy" → Creates new strategy item
  - "Use Content Intelligence" → Analyze/optimize before adding
  - "Create Now" → Direct to Compose

### 2. **Strategy → Content Intelligence**
- **Add buttons to Strategy items**:
  - "Optimize Caption" → Uses Content Intelligence optimizer
  - "Predict Performance" → Uses Content Intelligence predictor
  - "Repurpose" → Adapts Strategy content for other platforms
- **Gap Analysis** → Can analyze Strategy roadmap to find missing content types

### 3. **Strategy → Calendar**
- **When media is uploaded**: Status = "Ready", shows on Calendar as "Ready to Post"
- **When user schedules**: Status = "Scheduled", shows on Calendar as "Scheduled"
- **Calendar shows**: All Strategy items with media (Ready or Scheduled)

### 4. **AI Weekly Plan → Strategy**
- **Weekly Plan should**:
  - Use active Strategy roadmap as context
  - Fill gaps in Strategy (suggest content for days without media)
  - Suggest optimal posting times based on Strategy dates
- **Weekly Plan suggestions** → Can be added to Strategy roadmap

### 5. **Content Intelligence → Strategy**
- **Gap Analysis** → Analyzes Strategy roadmap + past content
- **Optimize** → Can optimize all Strategy captions at once
- **Predict** → Can predict performance of Strategy posts before scheduling

---

## Proposed Changes

### 1. **Strategy Status Flow**
```typescript
// Current: Draft → Scheduled (when media uploaded)
// Proposed: Draft → Ready → Scheduled → Posted

status: 'draft' | 'ready' | 'scheduled' | 'posted'
```

**When media is uploaded:**
- Status = `'ready'` (not `'scheduled'`)
- Creates CalendarEvent with status `'Ready'` (not `'Scheduled'`)
- Post status = `'Draft'` (not `'Scheduled'`)

**When user schedules:**
- Status = `'scheduled'`
- CalendarEvent status = `'Scheduled'`
- Post status = `'Scheduled'`

### 2. **Calendar Integration**
- **Show all Strategy items with media** (Ready or Scheduled)
- **Visual distinction**: 
  - "Ready" = Yellow/Orange (needs scheduling)
  - "Scheduled" = Blue (scheduled for specific date/time)
- **Click to schedule**: From Calendar, user can schedule Ready items

### 3. **Content Intelligence Integration**
- **Add "Optimize" button** to each Strategy item (when caption exists)
- **Add "Predict" button** to each Strategy item (when caption exists)
- **Add "Repurpose" button** to Strategy items (adapt for other platforms)
- **Bulk actions**: "Optimize All Captions", "Predict All Performance"

### 4. **Weekly Plan Integration**
- **Use Strategy as context**: When generating weekly plan, consider active Strategy
- **Fill Strategy gaps**: Suggest content for Strategy days without media
- **Add to Strategy**: Weekly Plan suggestions can be added to Strategy roadmap

### 5. **Opportunities Integration**
- **Enhanced "Create Content" flow**:
  - Option 1: "Add to Strategy" → Creates new Strategy item
  - Option 2: "Use Content Intelligence" → Analyze/optimize first
  - Option 3: "Create in Compose" → Direct creation

---

## User Experience Flow

### **Scenario 1: Planning a Campaign**
1. **Strategy** → Generate 4-week roadmap
2. **Media Library** → Upload/organize media
3. **Strategy** → Align media to roadmap suggestions
4. **Content Intelligence** → Optimize captions, predict performance
5. **Calendar** → Review all planned content
6. **Schedule** → Mark items as "Scheduled" when ready to post

### **Scenario 2: Finding Trends**
1. **Opportunities** → Scan for trending topics
2. **Create Content** → Choose "Add to Strategy" or "Use Content Intelligence"
3. **Strategy** → Content appears in roadmap
4. **Content Intelligence** → Optimize and predict
5. **Calendar** → See when to post

### **Scenario 3: Weekly Planning**
1. **Dashboard** → "Plan My Week"
2. **AI analyzes**: Active Strategy + past content + trends
3. **Suggests**: Content to fill Strategy gaps
4. **User adds**: Suggestions to Strategy or creates directly
5. **Calendar** → Shows complete weekly plan

---

## Implementation Priority

### Phase 1: Fix Strategy Status & Calendar (High Priority)
- Change status flow: Draft → Ready → Scheduled
- Ensure Strategy items show on Calendar when media is uploaded
- Fix calendar event creation

### Phase 2: Content Intelligence Integration (Medium Priority)
- Add Optimize/Predict/Repurpose buttons to Strategy items
- Connect gap analysis to Strategy roadmap

### Phase 3: Weekly Plan Integration (Medium Priority)
- Use Strategy as context for weekly plan
- Allow adding weekly plan suggestions to Strategy

### Phase 4: Opportunities Enhancement (Low Priority)
- Enhanced "Create Content" flow with multiple options
- Better integration with Strategy

---

## Questions to Answer

1. **Should Strategy items automatically appear on Calendar when media is uploaded?**
   - ✅ YES - As "Ready" status, not "Scheduled"

2. **Should users be able to schedule from Calendar?**
   - ✅ YES - Click "Ready" item → Schedule it

3. **Should Content Intelligence be available directly in Strategy?**
   - ✅ YES - Buttons on each Strategy item

4. **Should Weekly Plan use Strategy as context?**
   - ✅ YES - Fill gaps in Strategy, suggest optimal times

5. **Should "Scheduled" status only be set when user explicitly schedules?**
   - ✅ YES - Not automatic when media is uploaded



