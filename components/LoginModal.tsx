import React, { useState } from 'react';
import { GoogleIcon } from './icons/UIIcons';
import { auth, db } from '../firebaseConfig';

import {
    GoogleAuthProvider,
    signInWithRedirect,
    signInWithPopup,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    signInWithEmailAndPassword,
    sendPasswordResetEmail
} from 'firebase/auth';

import { doc, setDoc } from 'firebase/firestore';
import { User } from '../types';
import { defaultSettings } from '../constants';
import { Terms } from './Terms';
import { Privacy } from './Privacy';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SocialButton: React.FC<{ icon: React.ReactNode; text: string; onClick: () => void }> = ({
    icon,
    text,
    onClick,
}) => (
    <button
        onClick={onClick}
        className="w-full inline-flex items-center justify-center py-3 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
    >
        {icon}
        <span className="ml-4">{text}</span>
    </button>
);

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
    const [view, setView] = useState<'login' | 'signup' | 'forgotPassword' | 'verifyEmail'>('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [viewingPolicy, setViewingPolicy] = useState<'terms' | 'privacy' | null>(null);

    if (!isOpen) return null;

    const getFirebaseErrorMessage = (code: string): string => {
        const map: any = {
            'auth/user-not-found': 'Invalid email or password.',
            'auth/wrong-password': 'Invalid email or password.',
            'auth/invalid-credential': 'Invalid email or password.',
            'auth/email-already-in-use': 'An account with this email already exists.',
            'auth/weak-password': 'Password should be at least 6 characters.',
            'auth/invalid-email': 'Invalid email address.',
            'auth/popup-closed-by-user': 'Popup closed. Try again.',
            'auth/account-exists-with-different-credential':
                'This email already exists with a different login method.',
            'auth/unauthorized-domain':
                'This domain is not authorized in Firebase Authentication settings.',
        };
        return map[code] || 'Something went wrong. Please try again.';
    };

    // GOOGLE LOGIN WITH REDIRECT + POPUP FALLBACK
    const handleGoogleLogin = async () => {
        setIsLoading(true);
        setError(null);

        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        try {
            // 🔥 1st attempt: redirect (best for mobile)
            await signInWithRedirect(auth, provider);
        } catch (err: any) {
            console.warn('Redirect failed, trying popup:', err.code);

            try {
                // 🔥 2nd attempt: popup
                await signInWithPopup(auth, provider);
            } catch (popupError: any) {
                console.error('Google login failed:', popupError);
                setError(getFirebaseErrorMessage(popupError.code));
                setIsLoading(false);
            }
        }
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agreedToTerms) {
            setError('You must agree to the Terms and Privacy Policy.');
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            const result = await createUserWithEmailAndPassword(auth, email, password);
            await sendEmailVerification(result.user);

            await setDoc(doc(db, 'users', result.user.uid), {
                id: result.user.uid,
                name,
                email,
                avatar: `https://picsum.photos/seed/${result.user.uid}/100`,
                plan: 'Free',
                role: 'User',
                signupDate: new Date().toISOString(),
                hasCompletedOnboarding: false,
                notifications: { newMessages: true, weeklySummary: false, trendAlerts: false },
                monthlyCaptionGenerationsUsed: 0,
                monthlyImageGenerationsUsed: 0,
                monthlyVideoGenerationsUsed: 0,
                storageUsed: 0,
                storageLimit: 100,
                mediaLibrary: [],
                settings: defaultSettings,
            });

            setInfo(`A verification email was sent to ${email}.`);
            setView('verifyEmail');
        } catch (err: any) {
            setError(getFirebaseErrorMessage(err.code));
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const result = await signInWithEmailAndPassword(auth, email, password);

            if (!result.user.emailVerified) {
                await sendEmailVerification(result.user);
                setError('Please verify your email before logging in. A new link has been sent.');
                setView('verifyEmail');
                return;
            }

            onClose();
        } catch (err: any) {
            setError(getFirebaseErrorMessage(err.code));
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            await sendPasswordResetEmail(auth, email);
            setInfo('A reset link has been sent to your email.');
            setView('verifyEmail');
        } catch (err: any) {
            setError(getFirebaseErrorMessage(err.code));
        } finally {
            setIsLoading(false);
        }
    };

    // ---- UI RENDERING ----
    const closeModal = () => {
        setEmail('');
        setPassword('');
        setError(null);
        setIsLoading(false);
        onClose();
    };

    const renderContent = () => {
        if (viewingPolicy === 'terms')
            return (
                <>
                    <h2 className="text-2xl font-bold mb-4">Terms of Service</h2>
                    <div className="max-h-[60vh] overflow-y-auto">
                        <Terms />
                    </div>
                    <button onClick={() => setViewingPolicy(null)} className="mt-4 text-primary-600 underline">
                        Back
                    </button>
                </>
            );

        if (viewingPolicy === 'privacy')
            return (
                <>
                    <h2 className="text-2xl font-bold mb-4">Privacy Policy</h2>
                    <div className="max-h-[60vh] overflow-y-auto">
                        <Privacy />
                    </div>
                    <button onClick={() => setViewingPolicy(null)} className="mt-4 text-primary-600 underline">
                        Back
                    </button>
                </>
            );

        // VERIFY EMAIL SCREEN
        if (view === 'verifyEmail')
            return (
                <div className="text-center">
                    <h2 className="text-xl font-bold">Check Your Email</h2>
                    <p className="mt-2 text-gray-500">{info}</p>
                    <button
                        className="mt-6 text-primary-600 underline"
                        onClick={() => setView('login')}
                    >
                        Return to Login
                    </button>
                </div>
            );

        // RESET PASSWORD
        if (view === 'forgotPassword')
            return (
                <>
                    <h2 className="text-xl font-bold text-center">Reset Password</h2>
                    <form className="mt-4 space-y-4" onSubmit={handleResetPassword}>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Email address"
                            className="w-full px-3 py-2 border rounded-md"
                        />

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-2 rounded-md text-white bg-primary-600"
                        >
                            {isLoading ? 'Sending...' : 'Send Reset Link'}
                        </button>
                    </form>

                    <button
                        onClick={() => setView('login')}
                        className="mt-4 text-primary-600 underline text-sm"
                    >
                        Back to Login
                    </button>
                </>
            );

        // SIGN UP
        if (view === 'signup')
            return (
                <>
                    <h2 className="text-2xl font-bold text-center">Create Account</h2>
                    <form className="mt-6 space-y-4" onSubmit={handleSignUp}>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Full Name"
                            className="w-full px-3 py-2 border rounded-md"
                        />
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Email"
                            className="w-full px-3 py-2 border rounded-md"
                        />
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password"
                            className="w-full px-3 py-2 border rounded-md"
                        />

                        <label className="flex items-start gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={agreedToTerms}
                                onChange={(e) => setAgreedToTerms(e.target.checked)}
                            />
                            I agree to the{' '}
                            <button
                                type="button"
                                onClick={() => setViewingPolicy('terms')}
                                className="text-primary-600 underline"
                            >
                                Terms
                            </button>{' '}
                            &{' '}
                            <button
                                type="button"
                                onClick={() => setViewingPolicy('privacy')}
                                className="text-primary-600 underline"
                            >
                                Privacy Policy
                            </button>
                        </label>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-2 rounded-md text-white bg-primary-600"
                        >
                            {isLoading ? 'Creating...' : 'Sign Up'}
                        </button>
                    </form>

                    <p className="mt-4 text-center text-sm">
                        Already have an account?{' '}
                        <button onClick={() => setView('login')} className="text-primary-600 underline">
                            Sign In
                        </button>
                    </p>

                    {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}
                </>
            );

        // LOGIN VIEW
        return (
            <>
                <h2 className="text-2xl font-bold text-center">Welcome Back</h2>

                {/* GOOGLE BUTTON */}
                <div className="mt-6 space-y-4">
                    <SocialButton icon={<GoogleIcon />} text="Sign in with Google" onClick={handleGoogleLogin} />
                </div>

                <div className="mt-6 flex items-center">
                    <div className="flex-grow border-t" />
                    <span className="mx-3 text-sm text-gray-500">OR</span>
                    <div className="flex-grow border-t" />
                </div>

                {/* EMAIL LOGIN */}
                <form className="mt-6 space-y-4" onSubmit={handleLogin}>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email address"
                        className="w-full px-3 py-2 border rounded-md"
                    />

                    <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        className="w-full px-3 py-2 border rounded-md"
                    />

                    <div className="text-right">
                        <button
                            type="button"
                            onClick={() => setView('forgotPassword')}
                            className="text-sm text-primary-600 underline"
                        >
                            Forgot password?
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-2 rounded-md text-white bg-primary-600"
                    >
                        {isLoading ? 'Signing In...' : 'Sign In'}
                    </button>
                </form>

                {error && <p className="text-red-500 text-sm text-center mt-2">{error}</p>}

                <p className="mt-6 text-center text-sm">
                    Don't have an account?{' '}
                    <button onClick={() => setView('signup')} className="text-primary-600 underline">
                        Sign Up
                    </button>
                </p>
            </>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md p-8 relative shadow-xl">
                <button onClick={closeModal} className="absolute right-4 top-4 text-gray-500 hover:text-gray-800">
                    ✕
                </button>
                {renderContent()}
            </div>
        </div>
    );
};
