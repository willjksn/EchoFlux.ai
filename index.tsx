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