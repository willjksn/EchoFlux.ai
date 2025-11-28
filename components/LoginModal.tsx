import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { XMarkIcon } from './icons/UIIcons';
import { auth } from '../firebaseConfig';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import type { Plan } from '../types';

/* ---------- Terms & Privacy content (unchanged) ---------- */

const Terms: React.FC = () => (
  <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
    <p>
      Welcome to EngageSuite.ai. By using this platform, you agree to our terms of service.
      This includes using the platform responsibly, respecting other users, and following all
      applicable laws and regulations.
    </p>
    <p>
      You are responsible for any content you create, schedule, or publish through EngageSuite.ai.
      We do not guarantee performance of any content or strategy recommendations provided by the AI.
    </p>
    <p>
      EngageSuite.ai is provided &quot;as is&quot; without warranties of any kind. We are not
      liable for any loss or damage resulting from use of the platform.
    </p>
    <p>
      By continuing, you acknowledge that you have read and understood these terms.
    </p>
  </div>
);

const PrivacyPolicy: React.FC = () => (
  <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
    <p>
      EngageSuite.ai respects your privacy. We collect basic account information such as your name,
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
      By using EngageSuite.ai, you consent to our data usage practices described here.
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
      if (isLogin) {
        // Sign in
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Logged in successfully!', 'success');
        onClose();
      } else {
        // Sign up
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
      showToast(error.message || 'Authentication failed', 'error');
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
              : 'Start using EngageSuite to grow your audience.'}
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

