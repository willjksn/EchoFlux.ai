import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { Promotion, PromotionUsage, Plan } from '../types';
import { db } from '../firebaseConfig';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, getDocs, where } from 'firebase/firestore';
import { PlusIcon, TrashIcon, CheckCircleIcon } from './icons/UIIcons';

const planOptions: Plan[] = ['Free', 'Pro', 'Elite', 'Agency', 'Starter', 'Growth'];

export const PromotionsManagement: React.FC = () => {
    const { user, showToast } = useAppContext();
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [promotionUsages, setPromotionUsages] = useState<PromotionUsage[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
    const [showUsageModal, setShowUsageModal] = useState(false);
    const [selectedPromotionId, setSelectedPromotionId] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        description: '',
        type: 'percentage' as 'percentage' | 'fixed' | 'free',
        discountValue: 0,
        applicablePlans: [] as Plan[],
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        maxUses: '',
        maxUsesPerUser: '1',
        freeDays: '',
        discountDurationDays: '',
    });

    useEffect(() => {
        if (!user || user.role !== 'Admin') return;

        // Load promotions
        const promotionsRef = collection(db, 'promotions');
        const q = query(promotionsRef, orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const promoList: Promotion[] = [];
            snapshot.forEach((doc) => {
                promoList.push({ id: doc.id, ...doc.data() } as Promotion);
            });
            setPromotions(promoList);
        });

        // Load promotion usages
        const usagesRef = collection(db, 'promotion_usages');
        const usagesQ = query(usagesRef, orderBy('usedAt', 'desc'));
        const unsubscribeUsages = onSnapshot(usagesQ, (snapshot) => {
            const usageList: PromotionUsage[] = [];
            snapshot.forEach((doc) => {
                usageList.push({ id: doc.id, ...doc.data() } as PromotionUsage);
            });
            setPromotionUsages(usageList);
        });

        return () => {
            unsubscribe();
            unsubscribeUsages();
        };
    }, [user]);

    const handleCreatePromotion = async () => {
        if (!formData.code || !formData.name) {
            showToast('Please fill in code and name', 'error');
            return;
        }

        if (!user) return;

        try {
            const promotion: Omit<Promotion, 'id'> = {
                code: formData.code.toUpperCase().trim(),
                name: formData.name,
                description: formData.description,
                type: formData.type,
                discountValue: formData.discountValue,
                applicablePlans: formData.applicablePlans,
                startDate: new Date(formData.startDate).toISOString(),
                endDate: formData.endDate ? new Date(formData.endDate).toISOString() : '',
                maxUses: formData.maxUses ? parseInt(formData.maxUses) : undefined,
                currentUses: 0,
                maxUsesPerUser: parseInt(formData.maxUsesPerUser) || 1,
                isActive: true,
                createdAt: new Date().toISOString(),
                createdBy: user.id,
                freeDays: formData.freeDays ? parseInt(formData.freeDays) : undefined,
                discountDurationDays: formData.discountDurationDays ? parseInt(formData.discountDurationDays) : undefined,
            };

            await addDoc(collection(db, 'promotions'), promotion);
            showToast('Promotion created successfully!', 'success');
            setIsCreating(false);
            resetForm();
        } catch (error) {
            console.error('Failed to create promotion:', error);
            showToast('Failed to create promotion', 'error');
        }
    };

    const handleUpdatePromotion = async (promo: Promotion, updates: Partial<Promotion>) => {
        try {
            await updateDoc(doc(db, 'promotions', promo.id), updates);
            showToast('Promotion updated successfully!', 'success');
        } catch (error) {
            console.error('Failed to update promotion:', error);
            showToast('Failed to update promotion', 'error');
        }
    };

    const handleDeletePromotion = async (promoId: string) => {
        if (!confirm('Are you sure you want to delete this promotion?')) return;

        try {
            await deleteDoc(doc(db, 'promotions', promoId));
            showToast('Promotion deleted successfully!', 'success');
        } catch (error) {
            console.error('Failed to delete promotion:', error);
            showToast('Failed to delete promotion', 'error');
        }
    };

    const resetForm = () => {
        setFormData({
            code: '',
            name: '',
            description: '',
            type: 'percentage',
            discountValue: 0,
            applicablePlans: [],
            startDate: new Date().toISOString().split('T')[0],
            endDate: '',
            maxUses: '',
            maxUsesPerUser: '1',
            freeDays: '',
            discountDurationDays: '',
        });
        setEditingPromotion(null);
    };

    const getPromotionStatus = (promo: Promotion): { status: 'active' | 'expired' | 'inactive' | 'maxed'; label: string; color: string } => {
        const now = new Date();
        const start = new Date(promo.startDate);
        const end = promo.endDate ? new Date(promo.endDate) : null;

        if (!promo.isActive) {
            return { status: 'inactive', label: 'Inactive', color: 'bg-gray-500' };
        }

        if (now < start) {
            return { status: 'inactive', label: 'Scheduled', color: 'bg-blue-500' };
        }

        if (end && now > end) {
            return { status: 'expired', label: 'Expired', color: 'bg-red-500' };
        }

        if (promo.maxUses && promo.currentUses >= promo.maxUses) {
            return { status: 'maxed', label: 'Max Uses Reached', color: 'bg-orange-500' };
        }

        return { status: 'active', label: 'Active', color: 'bg-green-500' };
    };

    const getUsageForPromotion = (promoId: string) => {
        return promotionUsages.filter(u => u.promotionId === promoId);
    };

    if (!user || user.role !== 'Admin') {
        return (
            <div className="p-6 text-center">
                <p className="text-gray-600 dark:text-gray-400">Admin access required.</p>
            </div>
        );
    }

    return (
        <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                            Promotions Management
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            Create and manage discount codes, free trials, and limited-time offers
                        </p>
                    </div>
                    <button
                        onClick={() => setIsCreating(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                    >
                        <PlusIcon className="w-5 h-5" />
                        Create Promotion
                    </button>
                </div>

                {/* Create/Edit Modal */}
                {(isCreating || editingPromotion) && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full m-4 max-h-[90vh] overflow-y-auto">
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {editingPromotion ? 'Edit Promotion' : 'Create Promotion'}
                                    </h2>
                                    <button
                                        onClick={() => {
                                            setIsCreating(false);
                                            resetForm();
                                        }}
                                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    >
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Promotion Code *
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.code}
                                                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                                placeholder="SUMMER50"
                                                className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                                disabled={!!editingPromotion}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Name *
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="Summer Sale 50% Off"
                                                className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Description
                                        </label>
                                        <textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Promotion description..."
                                            rows={2}
                                            className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Type *
                                            </label>
                                            <select
                                                value={formData.type}
                                                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                                                className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                            >
                                                <option value="percentage">Percentage Discount</option>
                                                <option value="fixed">Fixed Amount Discount</option>
                                                <option value="free">Free Access</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                {formData.type === 'percentage' ? 'Discount %' : formData.type === 'fixed' ? 'Discount Amount ($)' : 'Free Days'}
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.discountValue}
                                                onChange={(e) => setFormData({ ...formData, discountValue: parseFloat(e.target.value) || 0 })}
                                                placeholder={formData.type === 'percentage' ? '50' : formData.type === 'fixed' ? '10' : '30'}
                                                min="0"
                                                max={formData.type === 'percentage' ? 100 : undefined}
                                                className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    {formData.type === 'percentage' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Discount Duration (days) - Leave empty for one-time discount
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.discountDurationDays}
                                                onChange={(e) => setFormData({ ...formData, discountDurationDays: e.target.value })}
                                                placeholder="30"
                                                min="1"
                                                className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                            />
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Applicable Plans (leave empty for all plans)
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {planOptions.map(plan => (
                                                <label key={plan} className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.applicablePlans.includes(plan)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setFormData({ ...formData, applicablePlans: [...formData.applicablePlans, plan] });
                                                            } else {
                                                                setFormData({ ...formData, applicablePlans: formData.applicablePlans.filter(p => p !== plan) });
                                                            }
                                                        }}
                                                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                                    />
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">{plan}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Start Date *
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.startDate}
                                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                                className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                End Date (optional)
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.endDate}
                                                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                                className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 items-end">
                                        <div className="flex flex-col">
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Max Uses (optional - leave empty for unlimited)
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.maxUses}
                                                onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
                                                placeholder="10"
                                                min="1"
                                                className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Max Uses Per User
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.maxUsesPerUser}
                                                onChange={(e) => setFormData({ ...formData, maxUsesPerUser: e.target.value })}
                                                placeholder="1"
                                                min="1"
                                                className="w-full p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4">
                                        <button
                                            onClick={() => {
                                                setIsCreating(false);
                                                resetForm();
                                            }}
                                            className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleCreatePromotion}
                                            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                                        >
                                            {editingPromotion ? 'Update' : 'Create'} Promotion
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Promotions List */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="p-6">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Active Promotions</h2>
                        {promotions.length === 0 ? (
                            <p className="text-gray-500 dark:text-gray-400 text-center py-8">No promotions created yet.</p>
                        ) : (
                            <div className="space-y-4">
                                {promotions.map((promo) => {
                                    const status = getPromotionStatus(promo);
                                    const usage = getUsageForPromotion(promo.id);
                                    const remainingUses = promo.maxUses ? promo.maxUses - promo.currentUses : 'Unlimited';

                                    return (
                                        <div
                                            key={promo.id}
                                            className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                                            {promo.name}
                                                        </h3>
                                                        <span className={`px-2 py-1 text-xs font-medium text-white rounded-full ${status.color}`}>
                                                            {status.label}
                                                        </span>
                                                        {promo.isActive && status.status === 'active' && (
                                                            <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-full">
                                                                {promo.code}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {promo.description && (
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{promo.description}</p>
                                                    )}
                                                    <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                                                        <span>
                                                            <strong>Type:</strong> {promo.type === 'percentage' ? `${promo.discountValue}% off` : promo.type === 'fixed' ? `$${promo.discountValue} off` : `${promo.freeDays || promo.discountValue} free days`}
                                                        </span>
                                                        <span>
                                                            <strong>Uses:</strong> {promo.currentUses} / {remainingUses}
                                                        </span>
                                                        {promo.applicablePlans.length > 0 && (
                                                            <span>
                                                                <strong>Plans:</strong> {promo.applicablePlans.join(', ')}
                                                            </span>
                                                        )}
                                                        <span>
                                                            <strong>Start:</strong> {new Date(promo.startDate).toLocaleDateString()}
                                                        </span>
                                                        {promo.endDate && (
                                                            <span>
                                                                <strong>End:</strong> {new Date(promo.endDate).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setShowUsageModal(true)}
                                                        className="p-2 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                                                        title="View Usage"
                                                    >
                                                        <CheckCircleIcon className="w-5 h-5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdatePromotion(promo, { isActive: !promo.isActive })}
                                                        className={`p-2 ${promo.isActive ? 'text-green-600' : 'text-gray-400'} hover:opacity-80`}
                                                        title={promo.isActive ? 'Deactivate' : 'Activate'}
                                                    >
                                                        {promo.isActive ? <CheckCircleIcon className="w-5 h-5" /> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeletePromotion(promo.id)}
                                                        className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                                        title="Delete"
                                                    >
                                                        <TrashIcon className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

