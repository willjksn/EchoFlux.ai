import React, { useState, useEffect } from 'react';
import { auth } from '../firebaseConfig';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { CheckCircleIcon, XMarkIcon } from './icons/UIIcons';

export const ResetPassword: React.FC = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isVerifying, setIsVerifying] = useState(true);
    const [actionCode, setActionCode] = useState<string | null>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [passwordRequirements, setPasswordRequirements] = useState({
        hasUppercase: false,
        hasLowercase: false,
        hasSpecialChar: false,
        hasNumeric: false,
        hasMinLength: false,
    });

    useEffect(() => {
        // Extract action code from URL
        // Firebase sends the action code as 'oobCode' parameter
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('oobCode');
        const mode = urlParams.get('mode');
        const emailParam = urlParams.get('email');

        if (code) {
            setActionCode(code);
            if (emailParam) {
                setEmail(emailParam);
            }
            // Verify the code and get the email
            verifyPasswordResetCode(auth, code)
                .then((verifiedEmail) => {
                    setEmail(verifiedEmail);
                    setIsVerifying(false);
                })
                .catch((err) => {
                    console.error('Error verifying password reset code:', err);
                    setError('This password reset link is invalid or has expired. Please request a new one.');
                    setIsVerifying(false);
                });
        } else if (mode === 'resetPassword') {
            // Sometimes the code might be in the hash instead
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const hashCode = hashParams.get('oobCode');
            if (hashCode) {
                setActionCode(hashCode);
                if (emailParam) {
                    setEmail(emailParam);
                }
                verifyPasswordResetCode(auth, hashCode)
                    .then((verifiedEmail) => {
                        setEmail(verifiedEmail);
                        setIsVerifying(false);
                    })
                    .catch((err) => {
                        console.error('Error verifying password reset code:', err);
                        setError('This password reset link is invalid or has expired. Please request a new one.');
                        setIsVerifying(false);
                    });
            } else {
                setError('Invalid password reset link. Please request a new password reset email.');
                setIsVerifying(false);
            }
        } else {
            setError('Invalid password reset link. Please request a new password reset email.');
            setIsVerifying(false);
        }
    }, []);

    // Check password requirements in real-time
    useEffect(() => {
        if (password) {
            setPasswordRequirements({
                hasUppercase: /[A-Z]/.test(password),
                hasLowercase: /[a-z]/.test(password),
                hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
                hasNumeric: /[0-9]/.test(password),
                hasMinLength: password.length >= 8,
            });
        } else {
            setPasswordRequirements({
                hasUppercase: false,
                hasLowercase: false,
                hasSpecialChar: false,
                hasNumeric: false,
                hasMinLength: false,
            });
        }
    }, [password]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validate passwords match
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        // Validate password requirements
        const allRequirementsMet = Object.values(passwordRequirements).every(req => req === true);
        if (!allRequirementsMet) {
            setError('Password does not meet all requirements.');
            return;
        }

        if (!actionCode) {
            setError('Invalid reset code. Please request a new password reset email.');
            return;
        }

        setIsLoading(true);

        try {
            await confirmPasswordReset(auth, actionCode, password);
            setSuccess(true);
            // Redirect to login after 3 seconds
            setTimeout(() => {
                window.location.href = '/?login=true';
            }, 3000);
        } catch (err: any) {
            console.error('Error resetting password:', err);
            if (err.code === 'auth/invalid-action-code') {
                setError('This password reset link is invalid or has expired. Please request a new one.');
            } else if (err.code === 'auth/weak-password') {
                setError('Password is too weak. Please choose a stronger password.');
            } else {
                setError(err.message || 'Failed to reset password. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    if (isVerifying) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
                <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
                    <div className="text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4"></div>
                        <p className="text-gray-600 dark:text-gray-400">Verifying reset link...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
                <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
                    <div className="text-center">
                        <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Password Reset Successful!</h2>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            Your password has been successfully reset. You will be redirected to the login page in a few seconds.
                        </p>
                        <a 
                            href="/?login=true" 
                            className="text-primary-600 dark:text-primary-400 hover:underline"
                        >
                            Go to login page now
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-12">
            <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Reset Your Password</h2>
                    {email && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Enter a new password for <strong>{email}</strong>
                        </p>
                    )}
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                        <div className="flex items-center gap-2">
                            <XMarkIcon className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            New Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                            placeholder="Enter new password"
                        />
                        {password && (
                            <div className="mt-2 space-y-1 text-xs">
                                <div className={`flex items-center gap-2 ${passwordRequirements.hasUppercase ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                    <span>{passwordRequirements.hasUppercase ? '✓' : '○'}</span>
                                    <span>One uppercase letter</span>
                                </div>
                                <div className={`flex items-center gap-2 ${passwordRequirements.hasLowercase ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                    <span>{passwordRequirements.hasLowercase ? '✓' : '○'}</span>
                                    <span>One lowercase letter</span>
                                </div>
                                <div className={`flex items-center gap-2 ${passwordRequirements.hasSpecialChar ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                    <span>{passwordRequirements.hasSpecialChar ? '✓' : '○'}</span>
                                    <span>One special character</span>
                                </div>
                                <div className={`flex items-center gap-2 ${passwordRequirements.hasNumeric ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                    <span>{passwordRequirements.hasNumeric ? '✓' : '○'}</span>
                                    <span>One number</span>
                                </div>
                                <div className={`flex items-center gap-2 ${passwordRequirements.hasMinLength ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                    <span>{passwordRequirements.hasMinLength ? '✓' : '○'}</span>
                                    <span>At least 8 characters</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Confirm New Password
                        </label>
                        <input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                            placeholder="Confirm new password"
                        />
                        {confirmPassword && password !== confirmPassword && (
                            <p className="mt-1 text-xs text-red-600 dark:text-red-400">Passwords do not match</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || !password || !confirmPassword || password !== confirmPassword || !Object.values(passwordRequirements).every(req => req === true)}
                        className="w-full py-2 px-4 bg-primary-600 text-white font-semibold rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoading ? 'Resetting Password...' : 'Reset Password'}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <a 
                        href="/?login=true" 
                        className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                    >
                        Back to Login
                    </a>
                </div>
            </div>
        </div>
    );
};

