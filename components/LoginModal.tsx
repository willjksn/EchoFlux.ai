import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { XMarkIcon } from './icons/UIIcons';
import { auth } from '../firebaseConfig';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import type { Plan } from '../types';
import { isMaintenanceMode, canBypassMaintenance } from '../src/utils/maintenance';

/* ---------- Terms & Privacy content (unchanged) ---------- */

const Terms: React.FC = () => (
  <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
    <p>
      Welcome to EchoFlux.AI. By using this platform, you agree to our terms of service.
      This includes using the platform responsibly, respecting other users, and following all
      applicable laws and regulations.
    </p>
    <p>
      <strong>Platform Feature Availability:</strong> EchoFlux.AI integrates with multiple social media platforms, 
      but feature availability varies by platform due to API limitations:
    </p>
    <ul className="list-disc pl-6 space-y-1 mt-2">
      <li><strong>Instagram/Facebook:</strong> Full features available for Business Accounts</li>
      <li><strong>X (Twitter):</strong> Requires paid API tier for most features</li>
      <li><strong>TikTok:</strong> Posting only - inbox/DM features not supported</li>
      <li><strong>YouTube:</strong> Publishing & analytics - no DM automation</li>
      <li><strong>LinkedIn:</strong> Post publishing - no messaging automation</li>
      <li><strong>Threads:</strong> Publishing only - limited features</li>
    </ul>
    <p>
      You are responsible for any content you create, schedule, or publish through EchoFlux.AI.
      We do not guarantee performance of any content or strategy recommendations provided by the AI.
    </p>
    <p>
      EchoFlux.AI is provided &quot;as is&quot; without warranties of any kind. We are not
      liable for any loss or damage resulting from use of the platform, platform outages, API deprecations, 
      or third-party policy changes.
    </p>
    <p>
      <strong>Prohibited Use:</strong> You may not circumvent API limitations, automate prohibited behaviors, 
      or violate any platform's Terms of Service.
    </p>
    <p>
      By continuing, you acknowledge that you have read and understood these terms and the full Terms of Service.
    </p>
  </div>
);

const PrivacyPolicy: React.FC = () => (
  <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
    <p>
      EchoFlux.AI respects your privacy. We collect basic account information such as your name,
      email address, and profile details to personalize your experience.
    </p>
    <p>
      We may analyze your content, posting history, and engagement data to provide recommendations
      and optimize your social media strategy. This data is used only within the platform and is
      not sold to third parties.
    </p>
    <p>
      You may request deletion of your account and associated data at any time by contacting
      support.
    </p>
    <p>
      By using EchoFlux.AI, you consent to our data usage practices described here.
    </p>
  </div>
);

/* ---------- Props: now supports initialView + selectedPlan ---------- */

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: 'login' | 'signup';
  selectedPlan?: Plan; // optional; used only on sign-up
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  initialView = 'login',
  selectedPlan,
}) => {
  const { showToast } = useAppContext();

  // derive initial mode from initialView
  const [isLogin, setIsLogin] = useState(initialView === 'login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [viewingPolicy, setViewingPolicy] = useState<'terms' | 'privacy' | null>(null);

  const [showPassword, setShowPassword] = useState(false);

  // keep internal state in sync if parent changes initialView
  useEffect(() => {
    setIsLogin(initialView === 'login');
  }, [initialView]);

  if (!isOpen) return null;

  /* ---------- AUTH HANDLERS ---------- */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Check maintenance mode
      if (isMaintenanceMode()) {
        // Allow bypass for whitelisted email
        if (!canBypassMaintenance(email)) {
          showToast('The site is currently in maintenance mode. Please check back soon.', 'error');
          setIsLoading(false);
          return;
        }
      }

      if (isLogin) {
        // Sign in
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Logged in successfully!', 'success');
        onClose();
      } else {
        // Sign up - block during maintenance unless whitelisted
        if (isMaintenanceMode() && !canBypassMaintenance(email)) {
          showToast('New sign-ups are currently disabled. The site is in maintenance mode.', 'error');
          setIsLoading(false);
          return;
        }

        if (password !== confirmPassword) {
          showToast('Passwords do not match.', 'error');
          setIsLoading(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);

        // Store pending plan selection for user creation (handled in AuthContext / backend)
        const planToStore: Plan = selectedPlan || ('Free' as Plan);
        try {
          localStorage.setItem('pendingPlan', planToStore);
        } catch {
          // non-fatal if localStorage isn't available
        }

        await updateProfile(userCredential.user, {
          displayName: fullName || 'New User',
        });

        showToast('Account created! Please complete onboarding.', 'success');
        onClose();
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      let errorMessage = 'Authentication failed';
      
      // Handle login-specific errors
      if (isLogin) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
          errorMessage = 'Wrong username or password. Please check your credentials and try again.';
        } else if (error.code === 'auth/invalid-email') {
          errorMessage = 'Invalid email address. Please check your email and try again.';
        } else if (error.code === 'auth/too-many-requests') {
          errorMessage = 'Too many failed login attempts. Please try again later.';
        } else if (error.message) {
          errorMessage = error.message;
        }
      } else {
        // Handle signup-specific errors
        if (error.code === 'auth/email-already-in-use') {
          errorMessage = 'This email is already registered. Please sign in instead.';
        } else if (error.code === 'auth/invalid-email') {
          errorMessage = 'Invalid email address. Please check your email and try again.';
        } else if (error.code === 'auth/weak-password') {
          errorMessage = 'Password is too weak. Please use a stronger password (at least 6 characters).';
        } else if (error.message) {
          errorMessage = error.message;
        }
      }
      
      showToast(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      showToast('Please enter your email first.', 'error');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      showToast('Password reset email sent!', 'success');
    } catch (error: any) {
      console.error('Reset error:', error);
      showToast(error.message || 'Failed to send reset email', 'error');
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      // Check maintenance mode
      if (isMaintenanceMode()) {
        showToast('The site is currently in maintenance mode. Please check back soon.', 'error');
        setIsLoading(false);
        return;
      }

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Check if user can bypass after Google sign-in
      if (isMaintenanceMode() && !canBypassMaintenance(result.user.email)) {
        // Sign them out if they can't bypass
        await auth.signOut();
        showToast('The site is currently in maintenance mode. Please check back soon.', 'error');
        setIsLoading(false);
        return;
      }
      
      showToast('Logged in with Google successfully!', 'success');
      onClose();
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      let errorMessage = 'Failed to sign in with Google';
      
      if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup - don't show error, just stop loading
        setIsLoading(false);
        return;
      } else if (error.code === 'auth/popup-blocked') {
        errorMessage = 'Popup was blocked. Please allow popups for this site.';
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = 'Google sign-in is not enabled. Please enable it in Firebase Console under Authentication → Sign-in method.';
      } else if (error.code === 'auth/unauthorized-domain') {
        errorMessage = 'This domain is not authorized. Please add your domain in Firebase Console under Authentication → Settings → Authorized domains.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showToast(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Shared input classes that guarantee visible text in both themes
  const inputClasses =
    'w-full px-3 py-2 border rounded-md ' +
    'bg-white text-gray-900 placeholder-gray-400 ' +
    'dark:bg-gray-900 dark:text-white dark:placeholder-gray-400 ' +
    'border-gray-300 dark:border-gray-600 ' +
    'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>

        {/* Header + Login/Signup toggle */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-center mb-2">
            <span className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-300 font-bold text-xl">
              ES
            </span>
          </div>
          <h2 className="text-xl font-bold text-center text-gray-900 dark:text-white">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isLogin
              ? 'Sign in to access your content workspace.'
              : 'Start using EchoFlux.AI to grow your audience.'}
          </p>

          <div className="mt-4 flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${
                isLogin
                  ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-300 shadow'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${
                !isLogin
                  ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-300 shadow'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Optional: show selected plan badge when signing up via pricing */}
          {!isLogin && selectedPlan && (
            <p className="mt-2 text-xs text-center text-primary-600 dark:text-primary-300">
              You&apos;re signing up for the <span className="font-semibold">{selectedPlan}</span>{' '}
              plan.
            </p>
          )}
        </div>

        {/* Body */}
        <div className="px-6 pb-6 pt-4 max-h-[80vh] overflow-y-auto">
          {viewingPolicy ? (
            <>
              <h2 className="text-2xl font-bold mb-4">
                {viewingPolicy === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
              </h2>
              <div className="max-h-[60vh] overflow-y-auto">
                {viewingPolicy === 'terms' ? <Terms /> : <PrivacyPolicy />}
              </div>
              <button
                onClick={() => setViewingPolicy(null)}
                className="mt-4 text-primary-600 underline text-sm"
              >
                Back
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full Name"
                    className={inputClasses}
                    autoComplete="name"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClasses}
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputClasses} pr-10`}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className={inputClasses}
                    autoComplete="new-password"
                  />
                </div>
              )}

              {isLogin && (
                <div className="flex items-center justify-between">
                  <label className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                    <input
                      type="checkbox"
                      className="h-3 w-3 text-primary-600 border-gray-300 rounded mr-2"
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs text-primary-600 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">Or</span>
                </div>
              </div>

              {/* Google Sign In Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-sm font-semibold rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-60 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {isLoading ? 'Please wait...' : 'Continue with Google'}
              </button>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-semibold rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-60"
              >
                {isLoading ? 'Please wait...' : isLogin ? 'Log In' : 'Sign Up'}
              </button>

              <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400 text-center leading-snug">
                By continuing, you agree to our{' '}
                <button
                  type="button"
                  onClick={() => setViewingPolicy('terms')}
                  className="text-primary-600 hover:underline"
                >
                  Terms of Service
                </button>{' '}
                and{' '}
                <button
                  type="button"
                  onClick={() => setViewingPolicy('privacy')}
                  className="text-primary-600 hover:underline"
                >
                  Privacy Policy
                </button>
                .
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

