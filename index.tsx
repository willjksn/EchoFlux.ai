import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initSentry } from './src/sentry';
import { initEnvValidation } from './src/utils/envValidation';

// Validate environment variables at startup
initEnvValidation();

// Initialize Sentry BEFORE React renders
initSentry();

// Patch fetch so relative `/api/*` calls don't inherit credentials from the current page URL.
// This prevents errors like:
// "Request cannot be constructed from a URL that includes credentials: /api/getUsageStats"
// which can happen when the site is accessed via a URL that contains userinfo (e.g. Basic Auth).
(() => {
  if (typeof window === 'undefined') return;
  if (typeof window.fetch !== 'function') return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      if (typeof input === 'string' && /^\/api(?:\/|\?|$)/.test(input)) {
        const absolute = new URL(input, window.location.origin).toString();
        return originalFetch(absolute, init);
      }
    } catch {
      // Fall through to original fetch
    }
    return originalFetch(input as any, init);
  };
})();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);