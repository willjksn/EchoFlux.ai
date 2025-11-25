import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { CreditCardIcon, VisaIcon, MastercardIcon, CheckCircleIcon } from './icons/UIIcons';
import { PaymentPlan, User } from '../types';

export const PaymentModal: React.FC = () => {
    const { paymentPlan, closePaymentModal, user, setUser, selectedClient, setClients, showToast } = useAppContext();
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    if (!paymentPlan) return null;

    const handleSuccess = () => {
        if (paymentPlan.name === 'Autopilot Add-on') {
            if (user) {
                setUser({ ...user, hasAutopilot: true });
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
            setUser({
                ...user,
                plan: paymentPlan.name as User['plan'],
                monthlyCaptionGenerationsUsed: 0,
                monthlyImageGenerationsUsed: 0,
                monthlyVideoGenerationsUsed: 0,
            });
            showToast(`Successfully switched to the ${paymentPlan.name} plan!`, 'success');
        }

        setIsLoading(false);
        setIsSuccess(true);
        setTimeout(() => {
            closePaymentModal();
        }, 1500);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        // Simulate API call
        setTimeout(handleSuccess, 2000);
    };

    const handleFreePlanConfirm = () => {
        setIsLoading(true);
        setTimeout(handleSuccess, 1000);
    }

    const renderContent = () => {
        if (isSuccess) {
            return (
                <div className="text-center p-8">
                    <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto animate-pulse" />
                    <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Purchase Complete!</h2>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">Welcome to {paymentPlan.name}.</p>
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
                        <button onClick={closePaymentModal} className="px-6 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500">Cancel</button>
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
                    <div className="p-6 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl">
                         <button type="submit" disabled={isLoading} className="w-full flex justify-center py-3 px-4 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50">
                            {isLoading ? 'Processing...' : `Pay $${paymentPlan.price}`}
                        </button>
                    </div>
                </form>
            </>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60" aria-labelledby="payment-modal-title" role="dialog" aria-modal="true">
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full m-4 transition-all duration-300 ease-in-out transform scale-100">
                <button onClick={closePaymentModal} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 z-10">
                   <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                {renderContent()}
            </div>
        </div>
    );
};