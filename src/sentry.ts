import * as Sentry from "@sentry/react";

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  // Only initialize Sentry if DSN is provided (production or staging)
  if (!dsn) {
    console.log("Sentry DSN not found. Error tracking disabled.");
    return;
  }

  try {
    Sentry.init({
      dsn,
      // Performance Monitoring - enable tracing
      tracesSampleRate: import.meta.env.MODE === "production" ? 0.1 : 1.0, // 10% in production, 100% in development
      
      // Integrations will be automatically included based on the SDK version
      // For v10, browser tracing is included by default
      // Session Replay can be enabled later if needed

    // Environment
    environment: import.meta.env.MODE || "development",

    // Release tracking (optional)
    // release: "echoflux-app@1.0.0",

    // Filter out common errors that aren't actionable
    ignoreErrors: [
      // Browser extensions
      "top.GLOBALS",
      "originalCreateNotification",
      "canvas.contentDocument",
      "MyApp_RemoveAllHighlights",
      "atomicFindClose",
      "fb_xd_fragment",
      "bmi_SafeAddOnload",
      "EBCallBackMessageReceived",
      "conduitPage",
      // Network errors that are often caused by ad blockers or network issues
      "NetworkError",
      "Network request failed",
      "Failed to fetch",
      "Load failed",
      // Firebase errors that are expected
      "auth/popup-closed-by-user",
      "auth/cancelled-popup-request",
    ],

    // Don't send PII (personally identifiable information)
    beforeSend(event, hint) {
      // Remove sensitive data from URLs
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/[?&]token=[^&]*/, "");
        event.request.url = event.request.url.replace(/[?&]api_key=[^&]*/, "");
      }
      
      // Remove sensitive data from headers
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["Authorization"];
      }

      return event;
    },
    });

    console.log("Sentry initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Sentry:", error);
    // Don't throw - allow app to continue without Sentry
  }
}

// Helper function to capture exceptions manually
export function captureException(error: Error, context?: Record<string, any>) {
  if (context) {
    Sentry.withScope((scope) => {
      Object.keys(context).forEach((key) => {
        scope.setContext(key, context[key]);
      });
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

// Helper function to capture messages
export function captureMessage(message: string, level: Sentry.SeverityLevel = "info") {
  Sentry.captureMessage(message, level);
}

