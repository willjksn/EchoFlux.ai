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

// If the site is accessed via a credentialed URL (e.g. https://user@host/...),
// some third-party SDKs will crash when parsing URLs (userinfo is disallowed).
// Normalize to a credential-free URL early.
(() => {
  if (typeof window === 'undefined') return;
  const href = window.location.href;
  // Detect userinfo in the authority portion.
  if (/^https?:\/\/[^/]*@/.test(href)) {
    const safe =
      `${window.location.protocol}//${window.location.host}` +
      `${window.location.pathname}${window.location.search}${window.location.hash}`;
    // Use replace to avoid adding an extra history entry.
    window.location.replace(safe);
  }
})();

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

// Defensive DOM patch: avoid rare "Failed to execute 'removeChild' on 'Node'" crashes
// that can occur due to browser quirks/races when temporary nodes are already detached.
(() => {
  if (typeof window === 'undefined') return;
  const proto = (window as any).Node?.prototype as any;
  if (!proto || typeof proto.removeChild !== 'function') return;
  if (proto.__echofluxPatchedRemoveChild) return;

  const originalRemoveChild = proto.removeChild;
  proto.removeChild = function removeChildPatched(child: any) {
    try {
      return originalRemoveChild.call(this, child);
    } catch (e: any) {
      const name = e?.name;
      const msg = String(e?.message || '');
      // Ignore only the specific "not a child" failure; rethrow everything else.
      if (name === 'NotFoundError' || msg.includes('not a child of this node')) {
        return child;
      }
      throw e;
    }
  };
  proto.__echofluxPatchedRemoveChild = true;
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