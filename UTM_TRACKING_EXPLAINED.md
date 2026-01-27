# UTM Tracking Explained

## What is UTM Tracking?

**UTM (Urchin Tracking Module)** parameters are query strings added to URLs to track where traffic comes from. They help you understand:
- Which marketing campaigns drive traffic
- Which social platforms send the most visitors
- Which specific links perform best
- User behavior and conversion paths

## How UTM Parameters Work

### Basic Structure
When you add UTM parameters to a URL, it looks like this:

```
https://onlyfans.com/yourprofile?utm_source=echoflux_bio&utm_medium=social&utm_campaign=onlyfans_promo&utm_content=link_button
```

### The 5 UTM Parameters

1. **`utm_source`** (Required)
   - Identifies WHERE the traffic comes from
   - Examples: `echoflux_bio`, `instagram`, `twitter`, `facebook`
   - Think: "What website/app sent this visitor?"

2. **`utm_medium`** (Required)
   - Identifies WHAT TYPE of link it is
   - Examples: `social`, `email`, `cpc`, `organic`, `referral`
   - Think: "What kind of marketing channel?"

3. **`utm_campaign`** (Recommended)
   - Identifies WHICH CAMPAIGN this link belongs to
   - Examples: `onlyfans_promo`, `summer_sale`, `new_content_launch`
   - Think: "What marketing campaign is this part of?"

4. **`utm_content`** (Optional)
   - Identifies SPECIFIC ELEMENT that was clicked
   - Examples: `link_button`, `bio_page_top`, `story_link`
   - Think: "Which specific button/link was clicked?"

5. **`utm_term`** (Optional, mainly for paid ads)
   - Identifies KEYWORDS (for paid search campaigns)
   - Examples: `premium_content`, `exclusive_access`
   - Usually not needed for bio links

## Real-World Example

### Scenario: Bio Page with OnlyFans Link

**Original URL:**
```
https://onlyfans.com/yourusername
```

**With UTM Parameters:**
```
https://onlyfans.com/yourusername?utm_source=echoflux_bio&utm_medium=social&utm_campaign=onlyfans_promo&utm_content=bio_link_button
```

### What This Tells You:

1. **`utm_source=echoflux_bio`**: Traffic came from your EchoFlux bio page
2. **`utm_medium=social`**: It's from a social media context
3. **`utm_campaign=onlyfans_promo`**: Part of your OnlyFans promotion campaign
4. **`utm_content=bio_link_button`**: They clicked the specific button on your bio page

## How to View UTM Data

### In Google Analytics
1. Go to **Acquisition** → **Campaigns** → **All Campaigns**
2. See which UTM campaigns drive the most traffic
3. Filter by `utm_source` to see which platforms perform best

### In OnlyFans/Fansly/Fanvue
- Most platforms don't show UTM data directly
- You'll need to use Google Analytics or a link shortener (like Bitly) that tracks clicks
- Or use EchoFlux's click tracking (when implemented)

### In EchoFlux (When Implemented)
- Bio page will track clicks with UTM data
- View analytics in your dashboard
- See which links get the most clicks
- See which UTM campaigns drive conversions

## Best Practices for Bio Links

### 1. Consistent Naming
Use consistent UTM values so data is easy to analyze:

```
utm_source=echoflux_bio (always the same)
utm_medium=social (always the same)
utm_campaign=onlyfans_promo (specific to the link)
utm_content=onlyfans_button (specific to the button)
```

### 2. Keep It Simple
Don't overcomplicate:
- ✅ Good: `utm_campaign=onlyfans_promo`
- ❌ Bad: `utm_campaign=onlyfans_promo_2024_q1_winter_special_limited_time`

### 3. Use Lowercase
- ✅ Good: `utm_source=echoflux_bio`
- ❌ Bad: `utm_source=EchoFlux_Bio`

### 4. Use Underscores, Not Spaces
- ✅ Good: `utm_campaign=onlyfans_promo`
- ❌ Bad: `utm_campaign=onlyfans promo` (spaces become `%20`)

## Example UTM Configurations

### OnlyFans Link
```
utm_source=echoflux_bio
utm_medium=social
utm_campaign=onlyfans_promo
utm_content=onlyfans_button
```

### Fansly Link
```
utm_source=echoflux_bio
utm_medium=social
utm_campaign=fansly_promo
utm_content=fansly_button
```

### Fanvue Link
```
utm_source=echoflux_bio
utm_medium=social
utm_campaign=fanvue_promo
utm_content=fanvue_button
```

### Different Campaigns
If you run a "Summer Sale" campaign:
```
utm_source=echoflux_bio
utm_medium=social
utm_campaign=summer_sale_2024
utm_content=onlyfans_button
```

## How EchoFlux Will Implement UTM

### Auto-Generate (Default)
When you add a link, EchoFlux will automatically add:
- `utm_source=echoflux_bio` (always)
- `utm_medium=social` (always)
- `utm_campaign=[link_title_lowercase]` (e.g., "OnlyFans" → "onlyfans")
- `utm_content=[username]` (your bio page username)

**Example:**
- Link Title: "OnlyFans"
- Username: "yourname"
- Auto-generated: `?utm_source=echoflux_bio&utm_medium=social&utm_campaign=onlyfans&utm_content=yourname`

### Manual Override
You can customize any UTM parameter:
- Change `utm_campaign` to match your marketing campaign
- Change `utm_content` to identify specific buttons
- Add custom tracking for A/B testing

### Click Tracking
When someone clicks a link:
1. EchoFlux records the click with UTM data
2. You can see analytics in your dashboard
3. Track which campaigns drive the most clicks
4. Optimize your bio page based on data

## Why UTM Tracking Matters

### 1. Measure ROI
- See which platforms drive paying subscribers
- Know which campaigns are worth investing in
- Optimize your marketing spend

### 2. Understand Your Audience
- See which social platforms send quality traffic
- Identify which content resonates
- Learn what drives conversions

### 3. Optimize Your Bio Page
- Test different link placements
- See which buttons get clicked most
- A/B test different campaigns

### 4. Professional Analytics
- Show sponsors/advertisers real data
- Prove your marketing effectiveness
- Make data-driven decisions

## Common Questions

### Q: Do UTM parameters affect SEO?
**A:** No, UTM parameters are ignored by search engines. They're purely for tracking.

### Q: Will UTM parameters break my links?
**A:** No, they're just query strings. The link works exactly the same, just with tracking data attached.

### Q: Can I use UTM on all my links?
**A:** Yes! It's recommended for any link you want to track, especially:
- Bio page links
- Social media posts
- Email campaigns
- Paid ads

### Q: What if I don't set UTM parameters?
**A:** Your links will still work, but you won't be able to track:
- Where traffic comes from
- Which campaigns perform best
- Which platforms drive conversions

### Q: Can I change UTM parameters later?
**A:** Yes! In EchoFlux, you can edit UTM parameters anytime. The new values will apply to future clicks.

## Next Steps

1. **Enable Auto-UTM** in Bio Page Builder (when feature is live)
2. **Customize Campaign Names** to match your marketing campaigns
3. **Track Results** in your analytics dashboard
4. **Optimize** based on what you learn

---

**Note:** UTM tracking is a standard industry practice used by marketers worldwide. It's completely safe and doesn't affect link functionality.
