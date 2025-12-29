/**
 * Environment Variable Validation
 * Validates all required environment variables at app startup
 */

interface EnvValidationResult {
  isValid: boolean;
  missing: string[];
  warnings: string[];
}

const REQUIRED_VARS = {
  // Firebase (Critical - app won't work without these)
  firebase: [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
  ],
  // Backend (Critical for API functions)
  backend: [
    'FIREBASE_SERVICE_ACCOUNT_KEY_BASE64',
  ],
  // AI (Optional but recommended)
  ai: [
    // GEMINI_API_KEY or GOOGLE_API_KEY (at least one)
  ],
};

const OPTIONAL_VARS = [
  'OPENAI_API_KEY',
  'REPLICATE_API_TOKEN',
  'VITE_SENTRY_DSN',
  'VITE_INVITE_ONLY_MODE',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_SECURE',
  'SMTP_FROM',
  'POSTMARK_SERVER_TOKEN',
  'POSTMARK_FROM',
  'POSTMARK_MESSAGE_STREAM',
  'CRON_SECRET',
];

export function validateEnvVars(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check Firebase vars
  REQUIRED_VARS.firebase.forEach((key) => {
    if (!import.meta.env[key]) {
      missing.push(key);
    }
  });

  // Check backend vars
  REQUIRED_VARS.backend.forEach((key) => {
    if (!import.meta.env[key] && !process.env[key]) {
      // Backend vars might be in process.env (server-side)
      // Only check import.meta.env for client-side vars
      if (key.startsWith('VITE_')) {
        if (!import.meta.env[key]) {
          missing.push(key);
        }
      } else {
        // Server-side only - can't check from client, so just warn
        warnings.push(`${key} (server-side only - verify in Vercel)`);
      }
    }
  });

  // Check AI keys (at least one should be present)
  const hasGeminiKey = import.meta.env.VITE_GEMINI_API_KEY || 
                       process.env.GEMINI_API_KEY || 
                       process.env.GOOGLE_API_KEY;
  if (!hasGeminiKey) {
    warnings.push('GEMINI_API_KEY or GOOGLE_API_KEY (AI features will be disabled)');
  }

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
  };
}

export function showEnvValidationErrors(result: EnvValidationResult) {
  if (result.isValid && result.warnings.length === 0) {
    return; // All good
  }

  if (result.missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    result.missing.forEach((key) => {
      console.error(`   - ${key}`);
    });
    console.error('\n⚠️  The application may not work correctly without these variables.');
    console.error('   Please add them to your Vercel environment variables.\n');
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️  Optional environment variables missing:');
    result.warnings.forEach((key) => {
      console.warn(`   - ${key}`);
    });
    console.warn('\n   These are optional but recommended for full functionality.\n');
  }
}

// Run validation and show errors
export function initEnvValidation() {
  if (typeof window === 'undefined') {
    return; // Server-side, skip
  }

  const result = validateEnvVars();
  showEnvValidationErrors(result);

  // In production, show user-friendly error if critical vars are missing
  if (!result.isValid && import.meta.env.MODE === 'production') {
    // Could show a modal or banner to admin users
    console.error('Critical environment variables are missing. Please contact support.');
  }

  return result;
}



