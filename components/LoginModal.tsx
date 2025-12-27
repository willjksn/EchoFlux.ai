import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { XMarkIcon, CheckCircleIcon } from './icons/UIIcons';
import { auth, db } from '../firebaseConfig';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import type { Plan } from '../types';
import { isMaintenanceMode, canBypassMaintenance } from '../src/utils/maintenance';

/* ---------- Terms & Privacy content (unchanged) ---------- */

const Terms: React.FC = () => (
  <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
    <p>
      Welcome to EchoFlux.ai. By using this platform, you agree to our terms of service.
      This includes using the platform responsibly, respecting other users, and following all
      applicable laws and regulations.
    </p>
    <p>
      <strong>Platform Feature Availability:</strong> EchoFlux.ai integrates with multiple social media platforms, 
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
      You are responsible for any content you create, schedule, or publish through EchoFlux.ai.
      We do not guarantee performance of any content or strategy recommendations provided by the AI.
    </p>
    <p>
      EchoFlux.ai is provided &quot;as is&quot; without warranties of any kind. We are not
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
      EchoFlux.ai respects your privacy. We collect basic account information such as your name,
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
      By using EchoFlux.ai, you consent to our data usage practices described here.
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
  const [errorModal, setErrorModal] = useState<{ show: boolean; message: string }>({ show: false, message: '' });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
  const [passwordRequirements, setPasswordRequirements] = useState({
    hasUppercase: false,
    hasLowercase: false,
    hasSpecialChar: false,
    hasNumeric: false,
    hasMinLength: false,
  });
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');

  // keep internal state in sync if parent changes initialView
  useEffect(() => {
    setIsLogin(initialView === 'login');
    // Clear validation errors when switching views
    setValidationErrors({});
    // Reset terms acceptance when switching views
    setAcceptedTerms(false);
    // Reset password requirements when switching views
    setPasswordRequirements({
      hasUppercase: false,
      hasLowercase: false,
      hasSpecialChar: false,
      hasNumeric: false,
      hasMinLength: false,
    });
    setShowPasswordRequirements(false);
    // Reset forgot password state when switching views
    setShowForgotPassword(false);
    setForgotPasswordEmail('');
  }, [initialView]);

  // Check password requirements in real-time
  useEffect(() => {
    if (!isLogin && password) {
      setPasswordRequirements({
        hasUppercase: /[A-Z]/.test(password),
        hasLowercase: /[a-z]/.test(password),
        hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
        hasNumeric: /[0-9]/.test(password),
        hasMinLength: password.length >= 8,
      });
    } else if (!isLogin && !password) {
      setPasswordRequirements({
        hasUppercase: false,
        hasLowercase: false,
        hasSpecialChar: false,
        hasNumeric: false,
        hasMinLength: false,
      });
    }
  }, [password, isLogin]);

  if (!isOpen) return null;

  /* ---------- AUTH HANDLERS ---------- */

  // Validate signup form
  const validateSignup = (): boolean => {
    const errors: Record<string, string> = {};

    // Validate full name
    if (!fullName || fullName.trim().length < 2) {
      errors.fullName = 'Please enter your full name (at least 2 characters)';
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      errors.email = 'Please enter a valid email address';
    }

    // Validate password with all requirements
    if (!password) {
      errors.password = 'Password is required';
    } else {
      const requirements = {
        hasUppercase: /[A-Z]/.test(password),
        hasLowercase: /[a-z]/.test(password),
        hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
        hasNumeric: /[0-9]/.test(password),
        hasMinLength: password.length >= 8,
      };

      const missingRequirements: string[] = [];
      if (!requirements.hasUppercase) missingRequirements.push('uppercase character');
      if (!requirements.hasLowercase) missingRequirements.push('lowercase character');
      if (!requirements.hasSpecialChar) missingRequirements.push('special character');
      if (!requirements.hasNumeric) missingRequirements.push('numeric character');
      if (!requirements.hasMinLength) missingRequirements.push('minimum 8 characters');

      if (missingRequirements.length > 0) {
        errors.password = `Password must include: ${missingRequirements.join(', ')}`;
      }
    }

    // Validate confirm password
    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    // Validate terms acceptance
    if (!acceptedTerms) {
      errors.terms = 'You must accept the Terms of Service and Privacy Policy to continue';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setValidationErrors({}); // Clear previous errors

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
        // Validate login form
        if (!email) {
          setValidationErrors({ email: 'Email is required' });
          setIsLoading(false);
          return;
        }
        if (!password) {
          setValidationErrors({ password: 'Password is required' });
          setIsLoading(false);
          return;
        }

        // Sign in
        await signInWithEmailAndPassword(auth, email, password);
        
        // Clear pendingSignup if it exists (account already created)
        // Keep paymentAttempt so user knows they need to complete payment
        const pendingSignup = typeof window !== 'undefined' ? localStorage.getItem('pendingSignup') : null;
        if (pendingSignup) {
          try {
            const pendingData = JSON.parse(pendingSignup);
            // Only clear if this is the same email (account was already created)
            if (pendingData.email === email) {
              localStorage.removeItem('pendingSignup');
            }
          } catch (e) {
            // If parse fails, just remove it
            localStorage.removeItem('pendingSignup');
          }
        }
        
        showToast('Logged in successfully!', 'success');
        onClose();
      } else {
        // Sign up - validate first
        if (!validateSignup()) {
          setIsLoading(false);
          // Show first error in toast
          const firstError = Object.values(validationErrors)[0];
          if (firstError) {
            showToast(firstError, 'error');
          }
          return;
        }

        // Block during maintenance unless whitelisted
        if (isMaintenanceMode() && !canBypassMaintenance(email)) {
          showToast('New sign-ups are currently disabled. The site is in maintenance mode.', 'error');
          setIsLoading(false);
          return;
        }

        // Check if email is already registered before storing as pending signup
        try {
          const signInMethods = await fetchSignInMethodsForEmail(auth, email);
          if (signInMethods && signInMethods.length > 0) {
            // Email is already registered - check if there's a payment attempt
            const paymentAttemptStr = typeof window !== 'undefined' ? localStorage.getItem('paymentAttempt') : null;
            let errorMessage = 'This email is already registered. Please sign in instead.';
            
            if (paymentAttemptStr) {
              try {
                const paymentAttempt = JSON.parse(paymentAttemptStr);
                if (paymentAttempt.email === email && paymentAttempt.accountCreated) {
                  errorMessage = 'Your account was created but payment was not completed. Please sign in to complete your plan selection.';
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
            
            setErrorModal({ show: true, message: errorMessage });
            setIsLoading(false);
            return;
          }
        } catch (checkError: any) {
          // If check fails, we'll proceed anyway - the actual signup will catch the error
          console.warn('Could not check if email exists:', checkError);
        }

        // Store signup info temporarily - don't create account yet
        // We'll create the account after plan selection
        const signupData = {
          email,
          password,
          fullName: fullName.trim(),
          selectedPlan: selectedPlan || null,
          timestamp: Date.now(),
        };

        // Store in localStorage temporarily (will be cleared after account creation)
        localStorage.setItem('pendingSignup', JSON.stringify(signupData));

        // Close modal and let the plan selection flow handle account creation
        onClose();
        
        // Show message that they need to select a plan
        if (selectedPlan) {
          showToast(`Please complete your ${selectedPlan} plan selection to create your account.`, 'info');
        } else {
          showToast('Please select a plan to complete your signup.', 'info');
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      let errorMessage = 'Authentication failed. Please try again.';
      
      // Handle login-specific errors
      if (isLogin) {
        const errorCode = error?.code || '';
        // Firebase Auth v9+ uses 'auth/invalid-credential' for both wrong password and user not found
        if (errorCode === 'auth/user-not-found' || 
            errorCode === 'auth/wrong-password' || 
            errorCode === 'auth/invalid-credential' ||
            errorCode === 'auth/invalid-login-credentials') {
          errorMessage = 'Incorrect email or password. Please check your credentials and try again.';
          // Show error modal for login credential errors
          setErrorModal({ show: true, message: errorMessage });
        } else if (errorCode === 'auth/invalid-email') {
          errorMessage = 'Invalid email address. Please check your email and try again.';
          setErrorModal({ show: true, message: errorMessage });
        } else if (errorCode === 'auth/too-many-requests') {
          errorMessage = 'Too many failed login attempts. Please try again later.';
          setErrorModal({ show: true, message: errorMessage });
        } else if (errorCode === 'auth/network-request-failed') {
          errorMessage = 'Network error. Please check your connection and try again.';
          setErrorModal({ show: true, message: errorMessage });
        } else if (error?.message) {
          errorMessage = error.message;
          setErrorModal({ show: true, message: errorMessage });
        }
      } else {
        // Handle signup-specific errors
        const errorCode = error?.code || '';
        if (errorCode === 'auth/email-already-in-use') {
          errorMessage = 'This email is already registered. Please sign in instead.';
          // Show popup modal for email already in use
          setErrorModal({ show: true, message: errorMessage });
        } else if (errorCode === 'auth/invalid-email') {
          errorMessage = 'Invalid email address. Please check your email and try again.';
        } else if (errorCode === 'auth/weak-password') {
          errorMessage = 'Password is too weak. Please use a stronger password (at least 6 characters).';
        } else if (error?.message) {
          errorMessage = error.message;
        }
      }
      
      // Show error toast (skip if modal is shown)
      if (!errorModal.show) {
        showToast(errorMessage, 'error');
      }
      console.error('Login error message shown:', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    // Use the email from forgot password form, or fall back to the main email field
    const emailToUse = forgotPasswordEmail || email;
    
    if (!emailToUse || !emailToUse.trim()) {
      // If no email in either field, show the forgot password form
      if (!showForgotPassword) {
        setShowForgotPassword(true);
        return;
      }
      showToast('Please enter your email address.', 'error');
      return;
    }

    try {
      const actionCodeSettings = {
        url: `${window.location.origin}/reset-password?email=${encodeURIComponent(emailToUse)}`,
        handleCodeInApp: false, // Open link in email client, not app
      };
      await sendPasswordResetEmail(auth, emailToUse.trim(), actionCodeSettings);
      showToast('Password reset email sent! Please check your email and click the link to reset your password.', 'success');
      // Reset state after successful send
      setShowForgotPassword(false);
      setForgotPasswordEmail('');
    } catch (error: any) {
      console.error('Reset error:', error);
      if (error.code === 'auth/user-not-found') {
        showToast('No account found with this email address.', 'error');
      } else if (error.code === 'auth/invalid-email') {
        showToast('Please enter a valid email address.', 'error');
      } else {
        showToast(error.message || 'Failed to send reset email', 'error');
      }
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

      // Validate terms acceptance for signup
      if (!isLogin && !acceptedTerms) {
        setValidationErrors({ terms: 'You must accept the Terms of Service and Privacy Policy to continue' });
        setIsLoading(false);
        return;
      }

      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Check if user can bypass after Google sign-in
      if (isMaintenanceMode() && !canBypassMaintenance(result.user.email)) {
        // Sign them out if they can't bypass
        await signOut(auth);
        showToast('The site is currently in maintenance mode. Please check back soon.', 'error');
        setIsLoading(false);
        return;
      }

      // If this is a signup (not login), check if it's a new user
      if (!isLogin) {
        // Check if user document exists in Firestore
        const userRef = doc(db, 'users', result.user.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          // New user during signup - store as pending signup
          // AuthContext will see this and not create the document yet
          const signupData = {
            email: result.user.email || '',
            password: '', // Google sign-in doesn't have password
            fullName: result.user.displayName || 'New User',
            selectedPlan: selectedPlan || null,
            timestamp: Date.now(),
            isGoogleSignup: true, // Flag to indicate Google signup
            googleUid: result.user.uid, // Store the UID for later
            googlePhotoURL: result.user.photoURL || null,
          };
          
          localStorage.setItem('pendingSignup', JSON.stringify(signupData));
          
          // Close modal - AuthContext will handle not creating the document
          // and App.tsx will show the plan selector
          onClose();
          showToast('Please select a plan to complete your signup.', 'info');
          setIsLoading(false);
          return;
        }
      }
      
      // Existing user or login - proceed normally
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
              EF
            </span>
          </div>
          <h2 className="text-xl font-bold text-center text-gray-900 dark:text-white">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isLogin
              ? 'Sign in to access your content workspace.'
              : 'Start using EchoFlux.ai to grow your audience.'}
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
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (validationErrors.fullName) {
                        setValidationErrors(prev => ({ ...prev, fullName: '' }));
                      }
                    }}
                    placeholder="Full Name"
                    className={`${inputClasses} ${validationErrors.fullName ? 'border-red-500 focus:ring-red-500' : ''}`}
                    autoComplete="name"
                  />
                  {validationErrors.fullName && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.fullName}</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (validationErrors.email) {
                      setValidationErrors(prev => ({ ...prev, email: '' }));
                    }
                  }}
                  placeholder="you@example.com"
                  className={`${inputClasses} ${validationErrors.email ? 'border-red-500 focus:ring-red-500' : ''}`}
                  autoComplete="email"
                />
                {validationErrors.email && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (validationErrors.password) {
                        setValidationErrors(prev => ({ ...prev, password: '' }));
                      }
                      // Clear confirm password error if passwords now match
                      if (confirmPassword && e.target.value === confirmPassword && validationErrors.confirmPassword) {
                        setValidationErrors(prev => ({ ...prev, confirmPassword: '' }));
                      }
                    }}
                    onFocus={() => {
                      if (!isLogin) {
                        setShowPasswordRequirements(true);
                      }
                    }}
                    onBlur={() => {
                      // Delay hiding to allow clicking on the popover
                      setTimeout(() => {
                        setShowPasswordRequirements(false);
                      }, 200);
                    }}
                    placeholder="••••••••"
                    className={`${inputClasses} pr-10 ${validationErrors.password ? 'border-red-500 focus:ring-red-500' : ''}`}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                  
                  {/* Password Requirements Popover */}
                  {!isLogin && showPasswordRequirements && (
                    <div 
                      className="absolute z-10 mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                        Password requirements
                      </h4>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-center">
                          {passwordRequirements.hasUppercase ? (
                            <CheckCircleIcon className="w-4 h-4 mr-2 text-green-500 flex-shrink-0" />
                          ) : (
                            <div className="w-4 h-4 mr-2 flex-shrink-0" />
                          )}
                          <span className={passwordRequirements.hasUppercase ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}>
                            Require uppercase character
                          </span>
                        </li>
                        <li className="flex items-center">
                          {passwordRequirements.hasLowercase ? (
                            <CheckCircleIcon className="w-4 h-4 mr-2 text-green-500 flex-shrink-0" />
                          ) : (
                            <div className="w-4 h-4 mr-2 flex-shrink-0" />
                          )}
                          <span className={passwordRequirements.hasLowercase ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}>
                            Require lowercase character
                          </span>
                        </li>
                        <li className="flex items-center">
                          {passwordRequirements.hasSpecialChar ? (
                            <CheckCircleIcon className="w-4 h-4 mr-2 text-green-500 flex-shrink-0" />
                          ) : (
                            <div className="w-4 h-4 mr-2 flex-shrink-0" />
                          )}
                          <span className={passwordRequirements.hasSpecialChar ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}>
                            Require special character
                          </span>
                        </li>
                        <li className="flex items-center">
                          {passwordRequirements.hasNumeric ? (
                            <CheckCircleIcon className="w-4 h-4 mr-2 text-green-500 flex-shrink-0" />
                          ) : (
                            <div className="w-4 h-4 mr-2 flex-shrink-0" />
                          )}
                          <span className={passwordRequirements.hasNumeric ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}>
                            Require numeric character
                          </span>
                        </li>
                        <li className="flex items-center">
                          {passwordRequirements.hasMinLength ? (
                            <CheckCircleIcon className="w-4 h-4 mr-2 text-green-500 flex-shrink-0" />
                          ) : (
                            <div className="w-4 h-4 mr-2 flex-shrink-0" />
                          )}
                          <span className={passwordRequirements.hasMinLength ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}>
                            Password length requirements
                          </span>
                        </li>
                        <li className="flex items-center pl-6">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Minimum password length: 8
                          </span>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
                {validationErrors.password && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.password}</p>
                )}
              </div>

              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (validationErrors.confirmPassword) {
                          setValidationErrors(prev => ({ ...prev, confirmPassword: '' }));
                        }
                        // Clear error if passwords now match
                        if (password && e.target.value === password) {
                          setValidationErrors(prev => ({ ...prev, confirmPassword: '' }));
                        }
                      }}
                      placeholder="Re-enter password"
                      className={`${inputClasses} pr-10 ${validationErrors.confirmPassword ? 'border-red-500 focus:ring-red-500' : ''}`}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      {showConfirmPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {validationErrors.confirmPassword && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.confirmPassword}</p>
                  )}
                </div>
              )}

              {!isLogin && (
                <div className="pt-2">
                  <label className="flex items-start text-xs text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => {
                        setAcceptedTerms(e.target.checked);
                        if (validationErrors.terms) {
                          setValidationErrors(prev => ({ ...prev, terms: '' }));
                        }
                      }}
                      className="mt-0.5 h-4 w-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 dark:bg-gray-800 dark:checked:bg-primary-600"
                    />
                    <span className="ml-2">
                      I agree to the{' '}
                      <button
                        type="button"
                        onClick={() => setViewingPolicy('terms')}
                        className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                      >
                        Terms of Service
                      </button>{' '}
                      and{' '}
                      <button
                        type="button"
                        onClick={() => setViewingPolicy('privacy')}
                        className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                      >
                        Privacy Policy
                      </button>
                    </span>
                  </label>
                  {validationErrors.terms && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.terms}</p>
                  )}
                </div>
              )}

              {isLogin && (
                <>
                  {showForgotPassword ? (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                          Reset Your Password
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setShowForgotPassword(false);
                            setForgotPasswordEmail('');
                          }}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-blue-800 dark:text-blue-300 mb-3">
                        Enter your email address and we&apos;ll send you a link to reset your password. This works even if you forgot your username.
                      </p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-blue-900 dark:text-blue-200 mb-1">
                            Email Address
                          </label>
                          <input
                            type="email"
                            value={forgotPasswordEmail}
                            onChange={(e) => setForgotPasswordEmail(e.target.value)}
                            placeholder="Enter your email"
                            className={inputClasses}
                            autoComplete="email"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleForgotPassword();
                              }
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          disabled={isLoading || !forgotPasswordEmail.trim()}
                          className="w-full py-2 px-4 bg-primary-600 text-white text-sm font-semibold rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isLoading ? 'Sending...' : 'Send Reset Link'}
                        </button>
                      </div>
                    </div>
                  ) : (
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
                        onClick={() => {
                          setShowForgotPassword(true);
                          // Pre-populate with email if it's already entered
                          if (email && !forgotPasswordEmail) {
                            setForgotPasswordEmail(email);
                          }
                        }}
                        className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}
                </>
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
            </form>
          )}
        </div>
      </div>

      {/* Error Modal for Authentication Errors */}
      {errorModal.show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {isLogin ? 'Login Error' : 'Sign Up Error'}
              </h3>
              <button
                onClick={() => setErrorModal({ show: false, message: '' })}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-6">
              <div className="flex items-center mb-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {isLogin 
                      ? (errorModal.message.includes('email') || errorModal.message.includes('password') 
                          ? 'Incorrect Credentials' 
                          : 'Unable to Sign In')
                      : 'Unable to Create Account'}
                  </p>
                </div>
              </div>
              <p className="text-gray-700 dark:text-gray-300 text-sm">{errorModal.message}</p>
            </div>
            <div className="flex gap-3">
              {!isLogin && errorModal.message.includes('already registered') && (
                <button
                  onClick={() => {
                    setErrorModal({ show: false, message: '' });
                    setIsLogin(true);
                  }}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Sign In Instead
                </button>
              )}
              <button
                onClick={() => {
                  setErrorModal({ show: false, message: '' });
                  // Clear password fields on close for security
                  if (isLogin) {
                    setPassword('');
                  }
                }}
                className={`px-4 py-2 ${!isLogin && errorModal.message.includes('already registered') ? 'flex-1' : 'w-full'} bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors`}
              >
                {isLogin ? 'Try Again' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

