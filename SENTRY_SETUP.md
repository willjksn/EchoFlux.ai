# Sentry Error Tracking Setup Guide

Sentry has been installed and integrated into the application. Follow these steps to complete the setup.

## 1. Create a Sentry Account

1. Go to https://sentry.io/signup/
2. Sign up for a free account (or use existing account)
3. Create a new project:
   - Select **React** as the platform
   - Give it a name (e.g., "EchoFlux.ai" or "engagesuite.ai")

## 2. Get Your DSN (Data Source Name)

1. After creating the project, Sentry will show you a DSN
2. It looks like: `https://xxxxxxxxxxxxx@xxxxxx.ingest.sentry.io/xxxxxx`
3. Copy this DSN - you'll need it in the next step

## 3. Add DSN to Environment Variables

### Local Development (.env file)

Create or update `.env` in your project root:

```env
VITE_SENTRY_DSN=https://your-dsn-here@xxxxxx.ingest.sentry.io/xxxxxx
```

### Vercel Production

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add a new environment variable:
   - **Key**: `VITE_SENTRY_DSN`
   - **Value**: Your Sentry DSN (from step 2)
   - **Environment**: Select all (Production, Preview, Development)
4. Click **Save**
5. **Important**: Redeploy your application for the changes to take effect

## 4. Verify Setup

1. After adding the DSN and redeploying, test by triggering an error
2. Check your Sentry dashboard - you should see errors appear there
3. The ErrorBoundary component will automatically send React errors to Sentry

## 5. Usage in Code

### Automatic Error Tracking

- React errors caught by ErrorBoundary are automatically sent to Sentry
- Unhandled promise rejections are automatically captured
- Network errors are automatically captured

### Manual Error Tracking

You can manually capture errors or messages:

```typescript
import { captureException, captureMessage } from '../src/sentry';

// Capture an exception
try {
  // your code
} catch (error) {
  captureException(error, {
    additionalContext: {
      userId: user.id,
      action: 'login',
    },
  });
}

// Capture a message
captureMessage('Something important happened', 'warning');
```

## 6. Sentry Configuration

The Sentry configuration is in `src/sentry.ts`. Key settings:

- **Traces Sample Rate**: 10% in production, 100% in development
- **Session Replay**: 10% of sessions, 100% of sessions with errors
- **Ignored Errors**: Common browser extension and network errors are filtered out
- **Privacy**: Authorization headers and tokens are automatically removed from events

## 7. Best Practices

1. **Don't log sensitive data**: Sentry automatically filters tokens and API keys
2. **Add context**: Use the `context` parameter to add helpful debugging info
3. **Monitor regularly**: Check your Sentry dashboard for new errors
4. **Set up alerts**: Configure alerts in Sentry for critical errors
5. **Tag releases**: Consider adding release tracking for better error tracking

## 8. Troubleshooting

### Errors not appearing in Sentry?

1. Check that `VITE_SENTRY_DSN` is set correctly
2. Verify the DSN format is correct
3. Check browser console for Sentry initialization messages
4. Ensure you've redeployed after adding the environment variable

### Too many errors?

1. Adjust the `ignoreErrors` array in `src/sentry.ts`
2. Reduce the `tracesSampleRate` if performance monitoring is generating too much data
3. Set up error filtering rules in Sentry dashboard

## 9. Next Steps

- [ ] Add Sentry DSN to Vercel environment variables
- [ ] Redeploy application
- [ ] Test error tracking
- [ ] Set up alerts in Sentry dashboard
- [ ] Configure release tracking (optional)
- [ ] Set up error filtering rules (optional)

---

**Note**: Error tracking will be disabled if `VITE_SENTRY_DSN` is not set, so the app will work normally during development without Sentry configured.


