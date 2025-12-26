# X Callback URL Troubleshooting

## Error: "Invalid callback url. Please check the characters used."

This error occurs when setting up the OAuth callback URI in X Developer Portal.

## ✅ Correct Callback URL Format

```
https://echoflux.ai/api/oauth/x/callback
```

## ❌ Common Mistakes

1. **Trailing slash**: 
   - ❌ `https://echoflux.ai/api/oauth/x/callback/`
   - ✅ `https://echoflux.ai/api/oauth/x/callback`

2. **HTTP instead of HTTPS**:
   - ❌ `http://echoflux.ai/api/oauth/x/callback`
   - ✅ `https://echoflux.ai/api/oauth/x/callback`

3. **Spaces**:
   - ❌ `https://echoflux.ai/api/oauth/x/callback ` (space at end)
   - ❌ ` https://echoflux.ai/api/oauth/x/callback` (space at start)
   - ✅ `https://echoflux.ai/api/oauth/x/callback`

4. **Wrong domain**:
   - ❌ `https://www.echoflux.ai/api/oauth/x/callback` (if www is not your domain)
   - ❌ `https://echoflux-ai.vercel.app/api/oauth/x/callback` (Vercel preview URL)
   - ✅ `https://echoflux.ai/api/oauth/x/callback` (your production domain)

5. **Hidden characters from copy-paste**:
   - ❌ Copy-pasting can include invisible characters
   - ✅ Type the URL manually

## 🔧 Step-by-Step Fix

1. **Go to X Developer Portal**:
   - Navigate to your app settings
   - Go to "User authentication settings"

2. **Clear the callback URI field completely**

3. **Type the URL manually** (don't copy-paste):
   ```
   https://echoflux.ai/api/oauth/x/callback
   ```

4. **Verify before saving**:
   - Check there are no spaces
   - Check it starts with `https://`
   - Check there's no trailing slash
   - Check the domain matches your production domain exactly

5. **Click "Save"**

6. **If it still fails**, try:
   - Remove the protocol: `echoflux.ai/api/oauth/x/callback`
   - Save
   - Then edit again and add `https://` back

## 🌐 Domain Verification

Make sure you're using your **production domain**, not:
- ❌ Vercel preview URLs (`*.vercel.app`)
- ❌ Localhost (`http://localhost:3000`)
- ❌ Development URLs

Your production domain should be: `echoflux.ai`

## 📝 Alternative: Check Your Actual Domain

If you're unsure of your production domain:

1. Check Vercel Dashboard → Your Project → Settings → Domains
2. Or check your `vercel.json` configuration
3. Use the exact domain shown there

## ✅ Verification Checklist

Before saving, verify:
- [ ] URL starts with `https://`
- [ ] No trailing slash
- [ ] No spaces before or after
- [ ] Domain matches production domain exactly
- [ ] Path is exactly `/api/oauth/x/callback`
- [ ] Typed manually (not copy-pasted)

## 🔍 Still Not Working?

If you've tried everything above:

1. **Check X Developer Portal requirements**:
   - Some apps require domain verification first
   - Make sure your app is approved/active

2. **Try a simpler URL first**:
   - Start with: `https://echoflux.ai/`
   - Save it
   - Then change to: `https://echoflux.ai/api/oauth/x/callback`

3. **Check for app restrictions**:
   - Some X apps have restrictions on callback URLs
   - Make sure your app type allows web callbacks

4. **Contact X Support**:
   - If nothing works, there might be an account/app restriction
   - X Developer Support: https://developer.twitter.com/en/support

## 📚 Reference

- [X OAuth 2.0 Documentation](https://docs.x.com/authentication/guides/v2-authentication-mapping)
- [X Developer Portal](https://developer.twitter.com/en/portal/dashboard)












