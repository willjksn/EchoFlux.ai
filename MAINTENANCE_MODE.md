# Maintenance Mode Guide

This guide explains how to enable/disable maintenance mode to restrict access to your site during development and testing.

## What is Maintenance Mode?

Maintenance mode blocks all user access to the site except for whitelisted developer emails. This is useful when:
- The site is live but still in development
- You're testing and don't want users signing up
- Payments aren't set up yet
- You need to restrict access temporarily

## How to Enable Maintenance Mode

### Option 1: Vercel Environment Variables (Recommended for Production)

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

   ```
   VITE_MAINTENANCE_MODE=true
   VITE_ALLOWED_EMAIL=your-email@example.com
   ```

4. **Redeploy** your site for changes to take effect

### Option 2: Local .env File (For Local Development)

1. Create a `.env.local` file in the root directory (if it doesn't exist)
2. Add the following:

   ```
   VITE_MAINTENANCE_MODE=true
   VITE_ALLOWED_EMAIL=your-email@example.com
   ```

3. Restart your development server

## How to Disable Maintenance Mode

### For Production (Vercel):
1. Go to Vercel → Settings → Environment Variables
2. Either:
   - Delete `VITE_MAINTENANCE_MODE`, OR
   - Set `VITE_MAINTENANCE_MODE=false`
3. Redeploy your site

### For Local Development:
1. Remove `VITE_MAINTENANCE_MODE` from `.env.local`, OR
2. Set `VITE_MAINTENANCE_MODE=false`
3. Restart your development server

## How It Works

### When Maintenance Mode is Enabled:

1. **Unauthenticated Users**: See a maintenance page instead of the landing page
2. **Login Attempts**: Blocked with a message (except whitelisted emails)
3. **Sign-up Attempts**: Blocked with a message (except whitelisted emails)
4. **Google Sign-in**: Blocked (except whitelisted emails)
5. **Whitelisted Email**: Can bypass maintenance mode and access the site normally

### Whitelisted Email Behavior:

- The email set in `VITE_ALLOWED_EMAIL` can:
  - Sign in normally
  - Sign up normally
  - Access all features
  - See a "Bypass Maintenance" button on the maintenance page

## Example Scenarios

### Scenario 1: Testing Before Launch
```
VITE_MAINTENANCE_MODE=true
VITE_ALLOWED_EMAIL=developer@echoflux.ai
```
- Only `developer@echoflux.ai` can access the site
- All other users see the maintenance page

### Scenario 2: Temporary Maintenance
```
VITE_MAINTENANCE_MODE=true
VITE_ALLOWED_EMAIL=support@echoflux.ai
```
- Only support team can access
- Users see a friendly maintenance message

### Scenario 3: Site is Live
```
VITE_MAINTENANCE_MODE=false
```
- All users can access normally
- No restrictions

## Troubleshooting

### Maintenance mode not working?
1. **Check environment variables**: Make sure `VITE_MAINTENANCE_MODE=true` is set
2. **Redeploy**: After changing Vercel env vars, you must redeploy
3. **Clear cache**: Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
4. **Check console**: Look for any errors in the browser console

### Can't bypass even with whitelisted email?
1. **Check email spelling**: The email must match exactly (case-insensitive)
2. **Verify env var**: Make sure `VITE_ALLOWED_EMAIL` is set correctly
3. **Sign out and sign in**: Try signing out and signing back in

### Want to allow multiple developers?
Currently, only one email can be whitelisted. For multiple developers:
- Use a shared email/account, OR
- Create a separate admin account that all developers can use

## Security Notes

- Environment variables starting with `VITE_` are exposed to the client-side code
- This is intentional for maintenance mode (it needs to run in the browser)
- Don't put sensitive secrets in `VITE_` variables
- The whitelisted email is visible in the client code (this is acceptable for maintenance mode)

## Quick Reference

| Action | Command/Setting |
|--------|----------------|
| Enable maintenance | `VITE_MAINTENANCE_MODE=true` |
| Disable maintenance | `VITE_MAINTENANCE_MODE=false` or remove it |
| Set whitelisted email | `VITE_ALLOWED_EMAIL=your-email@example.com` |
| Remove whitelist | Remove `VITE_ALLOWED_EMAIL` variable |









