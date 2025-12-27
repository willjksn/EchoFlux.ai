import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { CreditCardIcon, VisaIcon, MastercardIcon, CheckCircleIcon } from './icons/UIIcons';
import { PaymentPlan, User } from '../types';
import { doc, setDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { createAccountFromPendingSignup } from '../src/utils/createAccountFromPendingSignup';

export const PaymentModal: React.FC = () => {
    const { paymentPlan, closePaymentModal, user, setUser, selectedClient, setClients, showToast, setPricingView, setActivePage } = useAppContext();
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isProrationPreviewLoading, setIsProrationPreviewLoading] = useState(false);
    const [prorationPreview, setProrationPreview] = useState<{
        amountDue: number;
        currency: string;
        message?: string;
    } | null>(null);
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);


    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
            }
        };
    }, []);

    // Preview prorated "due today" amount for users who already have a Stripe subscription
    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                setProrationPreview(null);

                if (!paymentPlan) return;
                if (!user) return;

                const stripeSubscriptionId = (user as any)?.stripeSubscriptionId as string | undefined;
                if (!stripeSubscriptionId) return; // New subscribers: Stripe Checkout handles it

                // Free is cancel-at-period-end, not a prorated due-today payment
                if (paymentPlan.price === 0) return;

                setIsProrationPreviewLoading(true);

                const auth = (await import('../firebaseConfig')).auth;
                const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;

                const response = await fetch('/api/previewSubscriptionChange', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                        planName: paymentPlan.name,
                        billingCycle: paymentPlan.cycle,
                    }),
                });

                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    // Preview failures should never block checkout/upgrade; just hide preview.
                    console.warn('Proration preview failed:', data);
                    return;
                }

                const amountDue = typeof data?.amount_due === 'number' ? data.amount_due : 0;
                const currency = typeof data?.currency === 'string' ? data.currency : 'usd';
                const message = typeof data?.message === 'string' ? data.message : undefined;

                if (cancelled) return;
                setProrationPreview({
                    amountDue,
                    currency,
                    message,
                });
            } catch (err) {
                console.warn('Proration preview error:', err);
            } finally {
                if (!cancelled) setIsProrationPreviewLoading(false);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [paymentPlan?.name, paymentPlan?.cycle, paymentPlan?.price, user?.id]);

    if (!paymentPlan) return null;

    const handleSuccess = async () => {
        try {
        if (paymentPlan.name === 'Autopilot Add-on') {
            if (user) {
                    await setUser({ ...user, hasAutopilot: true });
            }
            showToast('Autopilot has been activated!', 'success');
        } else if (selectedClient) {
            setClients(prevClients => 
                prevClients.map(client => 
                    client.id === selectedClient.id
                        ? {
                            ...client,
                            plan: paymentPlan.name as User['plan'],
                            monthlyCaptionGenerationsUsed: 0,
                            monthlyImageGenerationsUsed: 0,
                            monthlyVideoGenerationsUsed: 0,
                        }
                        : client
                )
            );
             showToast(`Client successfully switched to the ${paymentPlan.name} plan!`, 'success');
        } else if (user) {
                // Map plan name to ensure it matches exactly with the Plan type
                const planName = paymentPlan.name as User['plan'];
                
                // All users are Creators now - ensure userType is set
                const newUserType: UserType = 'Creator';
                
                // Update user plan, userType (if needed), and reset usage counters
                const now = new Date().toISOString();
                
                const updatedUser: any = {
                    id: user.id,
                    plan: planName,
                    userType: newUserType,
                    monthlyCaptionGenerationsUsed: 0,
                    monthlyImageGenerationsUsed: 0,
                    monthlyVideoGenerationsUsed: 0,
                    subscriptionStartDate: now, // Set subscription start date
                    billingCycle: paymentPlan.cycle, // Set billing cycle
                    cancelAtPeriodEnd: false, // Clear cancellation if resubscribing
                    subscriptionEndDate: deleteField(), // Clear end date if resubscribing (use deleteField instead of undefined)
                };
                
                // Save to Firestore first to ensure persistence
                await setDoc(doc(db, 'users', user.id), updatedUser, { merge: true });
                
                // Then update local state
                await setUser(updatedUser);
                
                console.log('Plan updated successfully:', planName);
                
            showToast(`Successfully switched to the ${paymentPlan.name} plan!`, 'success');
                setIsLoading(false);
                setIsSuccess(true);
                
                // Clear any existing timeout
                if (closeTimeoutRef.current) {
                    clearTimeout(closeTimeoutRef.current);
                }
                
                // Set new timeout to close modal after success
                closeTimeoutRef.current = setTimeout(() => {
                    closePaymentModal();
                    setIsSuccess(false);
                }, 2000);
            }
        } catch (error) {
            console.error('Failed to update plan:', error);
            showToast('Failed to update plan. Please try again.', 'error');
        setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentPlan) return;

        setIsLoading(true);

        try {
            if (!user) {
                showToast('Please sign in to continue.', 'error');
                setIsLoading(false);
                return;
            }

            // Get auth token for API call
            const auth = (await import('../firebaseConfig')).auth;
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;

            const stripeSubscriptionId = (user as any)?.stripeSubscriptionId as string | undefined;

            // If the user already has an active subscription, change the subscription in place.
            // This is required for proration/credit logic on upgrades (including cross-interval).
            if (stripeSubscriptionId) {
                const response = await fetch('/api/changeSubscriptionPlan', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                        planName: paymentPlan.name,
                        billingCycle: paymentPlan.cycle,
                    }),
                });

                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const msg = data?.message || data?.error || 'Failed to change subscription';
                    throw new Error(msg);
                }

                // If Stripe requires the user to complete payment manually, send them to the hosted invoice.
                const hostedInvoiceUrl = data?.invoice?.hosted_invoice_url as string | null | undefined;
                const amountDue = data?.invoice?.amount_due as number | undefined;
                const status = data?.invoice?.status as string | undefined;

                if (hostedInvoiceUrl && amountDue && amountDue > 0 && status !== 'paid') {
                    window.location.href = hostedInvoiceUrl;
                    return;
                }

                showToast('Plan updated successfully (proration applied).', 'success');
                setIsLoading(false);
                closePaymentModal();
                return;
            }

            // Create Stripe checkout session
            const response = await fetch('/api/createCheckoutSession', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    planName: paymentPlan.name,
                    billingCycle: paymentPlan.cycle,
                    // Promotional codes can be entered directly in Stripe Checkout
                    // Stripe's allow_promotion_codes: true enables this feature
                }),
            });

            if (!response.ok) {
                let errorMessage = 'Failed to create checkout session';
                let errorDetails = '';
                
                // Clone response before reading to avoid "body stream already read" error
                const responseClone = response.clone();
                
                try {
                    const error = await response.json();
                    errorMessage = error.message || error.error || errorMessage;
                    errorDetails = error.details || '';
                    
                    // Log the full error for debugging
                    console.error('Checkout API error:', {
                        status: response.status,
                        error: error,
                        message: errorMessage,
                        details: errorDetails
                    });
                } catch (e) {
                    // If response is not JSON, try to get text from clone
                    try {
                        const text = await responseClone.text();
                        errorMessage = text || errorMessage;
                        console.error('Checkout API error (non-JSON):', text);
                    } catch (e2) {
                        // If that fails too, use status text
                        errorMessage = response.statusText || errorMessage;
                        console.error('Failed to parse error response:', e2);
                    }
                }
                
                // Show detailed error to user
                const fullErrorMessage = errorDetails 
                    ? `${errorMessage}\n\n${errorDetails}`
                    : errorMessage;
                throw new Error(fullErrorMessage);
            }

            const { url } = await response.json();

            if (url) {
                // Redirect to Stripe Checkout
                window.location.href = url;
            } else {
                throw new Error('No checkout URL received');
            }
        } catch (error: any) {
            console.error('Checkout error:', error);
            
            // Extract error message from various possible formats
            let errorMessage = 'Failed to start checkout. Please try again.';
            
            if (error.message) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                errorMessage = error;
            }
            
            // Check for Stripe configuration errors
            if (errorMessage.includes('Stripe is not configured') || 
                errorMessage.includes('Payment system not configured') ||
                errorMessage.includes('not configured')) {
                errorMessage = 'Payment system is currently unavailable. Please contact support or try again later.';
            }
            
            showToast(errorMessage, 'error');
            setIsLoading(false);
            
            // Account was already created, so if payment fails, user can sign in and retry
            // pendingSignup is already cleared by createAccountFromPendingSignup
        }
    };

    const handleFreePlanConfirm = async () => {
        setIsLoading(true);
        try {
            if (!user) {
                showToast('Please sign in to continue.', 'error');
                setIsLoading(false);
                return;
            }

            const stripeSubscriptionId = (user as any)?.stripeSubscriptionId as string | undefined;
            const auth = (await import('../firebaseConfig')).auth;
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;

            // If user has a subscription, switching to Free means "cancel at period end" (no refunds).
            if (stripeSubscriptionId) {
                const response = await fetch('/api/cancelSubscription', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ action: 'cancel' }),
                });

                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const msg = data?.message || data?.error || 'Failed to cancel subscription';
                    throw new Error(msg);
                }

                showToast(data?.message || 'Subscription will cancel at period end.', 'success');
                // Update local state so the Billing UI reflects the cancellation immediately.
                await setUser({
                    ...(user as any),
                    cancelAtPeriodEnd: true,
                    subscriptionEndDate: data?.subscriptionEndDate || (user as any)?.subscriptionEndDate || null,
                });
                setIsLoading(false);
                closePaymentModal();
                return;
            }

            // No subscription: free plan is immediate.
            setTimeout(() => {
                handleSuccess();
            }, 500);
        } catch (err: any) {
            console.error('Failed to switch to Free:', err);
            showToast(err?.message || 'Failed to switch to Free. Please try again.', 'error');
            setIsLoading(false);
        }
    }

    const handleClose = () => {
        // Clear timeout if closing manually
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
        setIsSuccess(false);
        closePaymentModal();
    };

    const renderContent = () => {
        if (isSuccess) {
            return (
                <div className="text-center p-8">
                    <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto animate-pulse" />
                    <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Purchase Complete!</h2>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">Welcome to {paymentPlan.name}.</p>
                    <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">Redirecting...</p>
                </div>
            )
        }
        
        if (paymentPlan.price === 0) {
            return (
                <div className="p-8 text-center">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Switch to Free Plan?</h2>
                     <p className="mt-4 text-gray-600 dark:text-gray-300">
                        You will lose access to premium features like Autopilot, Custom Voice Training, and extended generation limits. Are you sure you want to continue?
                    </p>
                    <div className="mt-8 flex justify-center space-x-4">
                        <button onClick={handleClose} className="px-6 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500">Cancel</button>
                        <button onClick={handleFreePlanConfirm} disabled={isLoading} className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50">
                            {isLoading ? 'Switching...' : 'Confirm'}
                        </button>
                    </div>
                </div>
            )
        }

        // Check if this is the highest plan (Elite) to avoid showing "Upgrade"
        const isHighestPlan = paymentPlan.name === 'Elite';
        const headingText = paymentPlan.name.includes('Add-on') 
            ? 'Activate Add-on' 
            : isHighestPlan 
                ? 'Complete Your Purchase' 
                : 'Upgrade Your Plan';
        const hasStripeSubscription = Boolean((user as any)?.stripeSubscriptionId);

        return (
            <>
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {headingText}
                    </h2>
                    <p className="mt-1 text-gray-500 dark:text-gray-400">You are purchasing the <span className="font-semibold text-primary-600 dark:text-primary-400">{paymentPlan.name}</span>.</p>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="p-6 space-y-4">
                        {hasStripeSubscription ? (
                            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold text-gray-800 dark:text-gray-200">Prorated Due Today</span>
                                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {isProrationPreviewLoading ? (
                                            '...'
                                        ) : prorationPreview ? (
                                            `$${(prorationPreview.amountDue / 100).toFixed(2)}`
                                        ) : (
                                            'Calculated at checkout'
                                        )}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                    We credit your unused time on your current plan and charge only the difference. Final amount is calculated by Stripe.
                                </p>
                            </div>
                        ) : (
                            (() => {
                              const isAnnual = paymentPlan.cycle === 'annually' || paymentPlan.cycle === 'annual' || paymentPlan.cycle === 'yearly';
                              const dueToday = isAnnual ? paymentPlan.price * 12 : paymentPlan.price;
                              const cycleLabel = isAnnual ? 'yr' : 'mo';
                              return (
                            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg flex justify-between items-center">
                                <span className="font-semibold text-gray-800 dark:text-gray-200">Amount Due Today</span>
                                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                                  ${dueToday.toFixed(2)} <span className="text-base font-medium">/{cycleLabel}</span>
                                </span>
                            </div>
                              );
                            })()
                        )}
                        {paymentPlan.cycle === 'annually' && paymentPlan.price > 0 && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            ${paymentPlan.price.toFixed(2)}/mo billed annually (${(paymentPlan.price * 12).toFixed(2)}/year)
                          </div>
                        )}
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                <strong>{hasStripeSubscription ? 'Proration Preview:' : 'Secure Checkout:'}</strong>{' '}
                                {hasStripeSubscription
                                    ? 'Your final prorated amount due today is calculated by Stripe at confirmation.'
                                    : "You'll be redirected to Stripe's secure payment page to complete your purchase."}
                            </p>
                        </div>
                    </div>
                    <div className="p-6 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-sm text-gray-600 dark:text-gray-400">Total:</span>
                            <div className="text-right">
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                    {hasStripeSubscription
                                        ? (isProrationPreviewLoading
                                            ? '...'
                                            : prorationPreview
                                                ? `$${(prorationPreview.amountDue / 100).toFixed(2)}`
                                                : 'Calculated at checkout')
                                        : `$${(paymentPlan.cycle === 'annually' ? paymentPlan.price * 12 : paymentPlan.price).toFixed(2)}`}
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 text-center">
                            You can enter a promotion code during checkout on Stripe's secure payment page.
                        </p>
                         <button type="submit" disabled={isLoading} className="w-full flex justify-center py-3 px-4 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50">
                            {isLoading
                                ? (hasStripeSubscription ? 'Updating plan...' : 'Redirecting to checkout...')
                                : (hasStripeSubscription ? 'Confirm Upgrade (Proration Applied)' : `Continue to Checkout - $${(paymentPlan.cycle === 'annually' ? paymentPlan.price * 12 : paymentPlan.price).toFixed(2)}`)}
                        </button>
                        <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
                            {hasStripeSubscription ? 'Proration & billing powered by Stripe' : 'Secure payment powered by Stripe'}
                        </p>
                    </div>
                </form>
            </>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60" aria-labelledby="payment-modal-title" role="dialog" aria-modal="true">
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full m-4 transition-all duration-300 ease-in-out transform scale-100">
                {/* Only show close button if not in success state */}
                {!isSuccess && (
                    <button onClick={handleClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 z-10">
                   <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                )}
                {renderContent()}
            </div>
        </div>
    );
};