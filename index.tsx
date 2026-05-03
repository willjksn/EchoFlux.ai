import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/stormij-fanhub.css';
import './styles/fan-landing-feed.css';

// If the site is accessed via a credentialed URL (e.g. https://user@host/...),
// some third-party SDKs will crash when parsing URLs (userinfo is disallowed).
// Normalize to a credential-free URL early.
(() => {
  if (typeof window === 'undefined') return;
  const href = window.location.href;
  if (/^https?:\/\/[^/]*@/.test(href)) {
    const safe =
      `${window.location.protocol}//${window.location.host}` +
      `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(safe);
  }
})();

// Patch fetch so relative `/api/*` calls don't inherit credentials from the current page URL.
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
      if (name === 'NotFoundError' || msg.includes('not a child of this node')) {
        return child;
      }
      throw e;
    }
  };
  proto.__echofluxPatchedRemoveChild = true;
})();

/** Max automatic reloads when a stale tab requests JS chunks removed by a new deploy (SPA serves HTML → MIME error). */
const CHUNK_RECOVER_ATTEMPTS_KEY = 'echoflux:chunk-recover-attempts';

(() => {
  if (typeof window === 'undefined') return;

  function shouldRecover(reason: unknown): boolean {
    const msg = String((reason as Error)?.message ?? (typeof reason === 'string' ? reason : ''));
    const name = String((reason as Error)?.name ?? '');
    const blob = `${name} ${msg}`;
    return (
      blob.includes('MIME type') ||
      blob.includes('Failed to fetch dynamically imported module') ||
      blob.includes('Importing a module script failed')
    );
  }

  function tryRecover(reason: unknown): boolean {
    if (!shouldRecover(reason)) return false;
    try {
      const n = Number(sessionStorage.getItem(CHUNK_RECOVER_ATTEMPTS_KEY) || '0');
      if (n >= 2) return false;
      sessionStorage.setItem(CHUNK_RECOVER_ATTEMPTS_KEY, String(n + 1));
    } catch {
      return false;
    }
    queueMicrotask(() => window.location.reload());
    return true;
  }

  window.addEventListener('unhandledrejection', (e) => {
    if (tryRecover(e.reason)) e.preventDefault();
  });
})();

function MissingFirebaseEnv() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
        background: '#0f0f12',
        color: '#e8e8ec',
      }}
    >
      <div style={{ maxWidth: 520, lineHeight: 1.6 }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Firebase env not configured</h1>
        <p style={{ marginBottom: '1rem', color: '#a8a8b0' }}>
          Add your Web SDK keys to <code style={{ color: '#e8e8ec' }}>.env.local</code> (see{' '}
          <code style={{ color: '#e8e8ec' }}>ENV_SETUP_GUIDE.md</code>). The dev server needs{' '}
          <code style={{ color: '#e8e8ec' }}>VITE_FIREBASE_*</code> variables so the app can load.
        </p>
        <p style={{ fontSize: '0.875rem', color: '#787880' }}>
          Restart <code style={{ color: '#a8a8b0' }}>npm run dev</code> after saving env changes.
        </p>
      </div>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const rawKey = import.meta.env.VITE_FIREBASE_API_KEY;
const firebaseKey = typeof rawKey === 'string' ? rawKey.trim() : '';

if (!firebaseKey) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <MissingFirebaseEnv />
    </React.StrictMode>,
  );
} else {
  void import('./bootstrap').then(({ mountApp }) => {
    mountApp(rootElement);
  });
}
