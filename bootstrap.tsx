import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initSentry } from './src/sentry';
import { initEnvValidation } from './src/utils/envValidation';

export function mountApp(rootElement: HTMLElement) {
  try {
    sessionStorage.removeItem('echoflux:chunk-recover-attempts');
  } catch {
    /* ignore quota / private mode */
  }

  initEnvValidation();
  initSentry();

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
