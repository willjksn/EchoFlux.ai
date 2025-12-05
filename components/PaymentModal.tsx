import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { CreditCardIcon, VisaIcon, MastercardIcon, CheckCircleIcon } from './icons/UIIcons';
import { PaymentPlan, User } from '../types';
import { doc, setDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { validatePromotion, applyPromotion } from '../src/services/promotionService';

export const PaymentModal: React.FC = () => {
    const { paymentPlan, closePaymentModal, user, setUser, selectedClient, setClients, showToast, setPricingView, setActivePage } = useAppContext();
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [promoCode, setPromoCode] = useState('');
    const [appliedPromotion, setAppliedPromotion] = useState<any>(null);
    const [finalPrice, setFinalPrice] = useState(paymentPlan?.price || 0);
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
            }
        };
    }, []);

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
                
                // Determine which userType the new plan belongs to
                const creatorPlans: User['plan'][] = ['Free', 'Pro', 'Elite'];
                const businessPlans: User['plan'][] = ['Starter', 'Growth'];
                const isNewPlanCreator = creatorPlans.includes(planName);
                const isNewPlanBusiness = businessPlans.includes(planName);
                const currentIsCreator = user.userType === 'Creator';
                const currentIsBusiness = user.userType === 'Business';
                
                // Check if switching between Creator and Business plan types
                const needsUserTypeChange = (isNewPlanCreator && currentIsBusiness) || 
                                           (isNewPlanBusiness && currentIsCreator);
                
                // If switching between Creator/Business, reset onboarding to show selector first
                if (needsUserTypeChange) {
                    // Determine which userType the new plan requires
                    const newUserType = isNewPlanCreator ? 'Creator' : 'Business';
                    
                    // Don't change the plan yet - let them confirm userType first
                    // Clear userType and reset onboarding to trigger selector
                    try {
                        // Store the desired pricing view and plan in localStorage before reload
                        localStorage.setItem('pendingPricingView', newUserType);
                        localStorage.setItem('pendingPlanSelection', planName);
                        
                        // Update Firestore directly to delete userType field
                        await setDoc(
                            doc(db, 'users', user.id),
                            {
                                userType: deleteField(),
                                hasCompletedOnboarding: false,
                            },
                            { merge: true }
                        );
                        
                        // Reload page to fetch fresh user data (without userType)
                        // This will trigger the selector in App.tsx
                        showToast(`Please choose your account type and select a plan.`, 'success');
                        closePaymentModal();
                        setIsLoading(false);
                        setTimeout(() => window.location.reload(), 500);
                        return;
                    } catch (error) {
                        console.error('Failed to clear userType:', error);
                        showToast('Failed to reset account type. Please try again.', 'error');
                        setIsLoading(false);
                        return;
                    }
                }
                
                // Determine new userType for non-switching cases
                let newUserType = user.userType;
                if (isNewPlanCreator) {
                    newUserType = 'Creator';
                } else if (isNewPlanBusiness) {
                    newUserType = 'Business';
                }
                // Agency plan keeps current userType
                
                // Apply promotion if one was used
                if (appliedPromotion && appliedPromotion.promotion) {
                    await applyPromotion(
                        appliedPromotion.promotion.id,
                        planName,
                        paymentPlan.price,
                        appliedPromotion.discountedPrice,
                        appliedPromotion.discountAmount,
                        appliedPromotion.expiresAt
                    );
                }
                
                // Update user plan, userType (if needed), and reset usage counters
                const now = new Date().toISOString();
                const updatedUser = {
                    id: user.id,
                    plan: planName,
                    userType: newUserType,
                    monthlyCaptionGenerationsUsed: 0,
                    monthlyImageGenerationsUsed: 0,
                    monthlyVideoGenerationsUsed: 0,
                    subscriptionStartDate: now, // Set subscription start date
                    billingCycle: paymentPlan.cycle, // Set billing cycle
                    cancelAtPeriodEnd: false, // Clear cancellation if resubscribing
                    subscriptionEndDate: undefined, // Clear end date if resubscribing
                };
                
                // Save to Firestore first to ensure persistence
                await setDoc(doc(db, 'users', user.id), updatedUser, { merge: true });
                
                // Then update local state
                await setUser(updatedUser);
                
                console.log('Plan updated successfully:', planName);
                
            const successMessage = appliedPromotion 
                ? `Successfully switched to the ${paymentPlan.name} plan with ${appliedPromotion.promotion.name}!`
                : `Successfully switched to the ${paymentPlan.name} plan!`;
            showToast(successMessage, 'success');
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
        setIsLoading(true);
        // Simulate API call
        setTimeout(() => {
            handleSuccess();
        }, 2000);
    };

    const handleFreePlanConfirm = async () => {
        setIsLoading(true);
        setTimeout(() => {
            handleSuccess();
        }, 1000);
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

        return (
            <>
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {paymentPlan.name.includes('Add-on') ? 'Activate Add-on' : 'Upgrade Your Plan'}
                    </h2>
                    <p className="mt-1 text-gray-500 dark:text-gray-400">You are purchasing the <span className="font-semibold text-primary-600 dark:text-primary-400">{paymentPlan.name}</span>.</p>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="p-6 space-y-4">
                        <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg flex justify-between items-center">
                            <span className="font-semibold text-gray-800 dark:text-gray-200">Amount Due Today</span>
                            <span className="text-2xl font-bold text-gray-900 dark:text-white">${paymentPlan.price} <span className="text-base font-medium">/{paymentPlan.cycle === 'monthly' ? 'mo' : 'yr'}</span></span>
                        </div>
                        <div>
                            <label htmlFor="card-number" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Card Information</label>
                            <div className="mt-1 relative">
                                <input type="text" id="card-number" placeholder="0000 0000 0000 0000" className="w-full p-3 pl-12 border rounded-md bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600" />
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                    <CreditCardIcon />
                                </div>
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center space-x-1">
                                    <VisaIcon />
                                    <MastercardIcon />
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="expiry-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Expiry Date</label>
                                <input type="text" id="expiry-date" placeholder="MM / YY" className="mt-1 w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600"/>
                            </div>
                            <div>
                                <label htmlFor="cvc" className="block text-sm font-medium text-gray-700 dark:text-gray-300">CVC</label>
                                <input type="text" id="cvc" placeholder="123" className="mt-1 w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600"/>
                            </div>
                        </div>
                    </div>
                    {/* Promotion Code Section */}
                    <div className="p-6 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 mb-4">
                            <input
                                type="text"
                                value={promoCode}
                                onChange={(e) => setPromoCode(e.target.value)}
                                placeholder="Enter promotion code"
                                className="flex-1 px-4 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                            <button
                                type="button"
                                onClick={() => handleValidatePromotion(promoCode)}
                                disabled={!promoCode || isLoading}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 transition-colors"
                            >
                                Apply
                            </button>
                        </div>
                        {appliedPromotion && (
                            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md mb-4">
                                <div>
                                    <p className="text-sm font-medium text-green-800 dark:text-green-200">
                                        {appliedPromotion.promotion.name} applied!
                                    </p>
                                    <p className="text-xs text-green-600 dark:text-green-400">
                                        Save ${appliedPromotion.discountAmount.toFixed(2)}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleRemovePromotion}
                                    className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 text-sm"
                                >
                                    Remove
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="p-6 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-sm text-gray-600 dark:text-gray-400">Total:</span>
                            <div className="text-right">
                                {appliedPromotion && (
                                    <div className="text-sm text-gray-500 dark:text-gray-400 line-through mb-1">
                                        ${paymentPlan.price.toFixed(2)}
                                    </div>
                                )}
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                    ${finalPrice.toFixed(2)}
                                </div>
                            </div>
                        </div>
                         <button type="submit" disabled={isLoading} className="w-full flex justify-center py-3 px-4 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50">
                            {isLoading ? 'Processing...' : `Pay $${finalPrice.toFixed(2)}`}
                        </button>
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