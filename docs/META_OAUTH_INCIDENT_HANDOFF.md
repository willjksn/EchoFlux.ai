# Meta OAuth Incident Handoff

## Incident Summary
Meta OAuth connection works inconsistently for non-admin users in EchoFlux settings.

## User-Visible Impact
- Non-admin users cannot reliably connect Facebook/Instagram.
- Connection can appear to complete on Meta screens, but app still shows `Connect`.
- This blocks posting/analytics onboarding.

## Current State
- Business Verification: **Verified**
- Access Verification (Tech Provider): **Submitted / In Review**
- App Review permissions: **Approved** for required scopes

## Key Symptoms Observed
1. Connect Facebook (non-admin):
   - "It looks like this app isn't available"
   - "This app needs at least one supported permission"
2. Connect Instagram:
   - Flow proceeds through Meta/Instagram handoff, then fails with:
   - `Invalid Request: Invalid redirect URI`
3. Account picker can show multiple profiles/assets (personal + target), user selects target, but final connect may still fail or not reflect in UI.

## Code Changes Already Merged to `main`
Recent commits on `origin/main`:
- `c04546d` - Split Facebook vs Instagram connect flows
- `f8fe82c` - Meta OAuth redirect fixes
- `1621344` - Callback/Settings success-state alignment

## Current OAuth Design (Expected)
- Frontend calls `/api/oauth/meta/authorize` with connect mode:
  - `connect=facebook` for Facebook button
  - `connect=instagram` for Instagram button
- Backend reads:
  - `META_LOGIN_CONFIG_FACEBOOK`
  - `META_LOGIN_CONFIG_INSTAGRAM`
- Callback writes to Firestore:
  - `users/{uid}/social_accounts/facebook`
  - `users/{uid}/social_accounts/instagram` (when IG selected)

## Meta App / Asset Context
- App ID used in OAuth: `875668391474933`
- Redirect URI used: `https://echoflux.ai/api/oauth/meta/callback`
- Reported configs:
  - EchoFlux Facebook (General, user token) last4 `0065`
  - EchoFlux Instagram (Instagram Graph API, user token) last4 `4157`
- Social assets:
  - IG: `https://www.instagram.com/echoflux.ai/`
  - FB Page: `https://www.facebook.com/echoflux.aiapp/`

## Most Likely Root Cause (Current)
Meta-side gating/config state for non-admin users:
- App Review is approved, but runtime use can still fail while Access Verification is pending.
- Config-level restrictions/mapping may also contribute when moving from FB to IG handoff.

## Immediate Next Steps (Once Access Verification Decision Arrives)
### If Approved
- Re-test Facebook connect (non-admin, incognito)
- Re-test Instagram connect (non-admin, incognito)
- Verify Settings shows connected state
- Verify Firestore docs exist and show `connected: true`

### If Still Failing After Approval
1. Inspect `POST /api/oauth/meta/authorize` response in DevTools.
2. Confirm `authUrl` has:
   - correct `client_id`
   - correct `redirect_uri`
   - correct `config_id` per button
3. Confirm Meta allowlist includes:
   - `https://echoflux.ai/api/oauth/meta/callback`
   - `https://www.echoflux.ai/api/oauth/meta/callback`
4. Confirm env vars are set in the environment under test (Production vs Preview).
5. Redeploy and retest.

## Branch/Release Constraints
- Do **not** merge `feature/echoflux-pricing-packaging-pro-elite` to `main` yet.
- Continue landing OAuth fixes via dedicated fix branch only.

## Deferred Work
- Tablet layout/alignment issues (user requested to handle after connection issue is stable).
