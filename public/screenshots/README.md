# Screenshots for Animated Go Live Steps

Place your app screenshots in this directory with the following names:

## Required Screenshots:

1. **step1-profile-setup.png** - Screenshot of the Profile/Onboarding page
   - Should show the profile setup or onboarding flow
   - Recommended size: 1200x800px or similar aspect ratio
   - Format: PNG (with transparency if needed) or JPG

2. **step2-plan-my-week.png** - Screenshot of the Plan My Week page
   - Should show the Plan My Week interface with content planning
   - Recommended size: 1200x800px or similar aspect ratio
   - Format: PNG or JPG

3. **step3-write-captions.png** - Screenshot of the Write Captions page
   - Should show the Write Captions interface
   - Recommended size: 1200x800px or similar aspect ratio
   - Format: PNG or JPG

## How to Take Screenshots:

1. Open your app in the browser
2. Navigate to each page:
   - Profile/Onboarding page
   - Plan My Week page
   - Write Captions page
3. Take a screenshot (use browser dev tools or screenshot tool)
4. Save with the exact filenames listed above
5. Place them in this `public/screenshots/` directory

## Tips:

- Use browser dev tools to take responsive screenshots
- Make sure screenshots show the key UI elements that the cursor will interact with
- Keep file sizes reasonable (under 500KB each if possible)
- Use PNG for better quality, JPG for smaller file sizes

## Adjusting Cursor Positions:

After adding screenshots, you may need to adjust cursor positions in `components/AnimatedGoLiveSteps.tsx`:
- Look for the `steps` array in the `useEffect` hook
- Adjust the `x` and `y` coordinates (percentages) to match where elements are in your screenshots
- Test and refine until the cursor points to the right elements
