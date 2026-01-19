import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { User, SocialStats, Platform, Plan } from '../../types';
import { defaultSettings } from '../../constants';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isAuthLoading: boolean;
    setUser: (user: Partial<User> | null) => Promise<void>;
    handleLogout: () => void;
}

// inside the "else" where userDocSnap does NOT exist
const pendingPlan = (typeof window !== 'undefined'
  ? (localStorage.getItem('pendingPlan') as Plan | null)
  : null);

const newUser: User = {
  // ...
  plan: pendingPlan || 'Free',
  // ...
};

// after successful setDoc:
try {
  localStorage.removeItem('pendingPlan');
} catch {}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Utility — NEVER allow undefined to be written to Firestore
const removeUndefined = (obj: any): any => {
    if (!obj || typeof obj !== "object") return obj;
    const clean: any = {};
    for (const key in obj) {
        const value = obj[key];
        if (value !== undefined) clean[key] = removeUndefined(value);
    }
    return clean;
};

const generateMockSocialStats = (): Record<Platform, SocialStats> => {
    const stats: any = {};
    const platforms: Platform[] = ['Instagram','TikTok','X','Threads','YouTube','LinkedIn','Facebook','Pinterest'];
    platforms.forEach(p => {
        stats[p] = {
            followers: Math.floor(Math.random() * 15000) + 50,
            following: Math.floor(Math.random() * 1000) + 5,
        };
    });
    return stats;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUserState] = useState<User | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (fbUser) => {
            setIsAuthLoading(true);

            if (fbUser) {
                const ref = doc(db, 'users', fbUser.uid);
                const snap = await getDoc(ref);

                if (snap.exists()) {
                    const loaded = snap.data() as User;

                    // Default everyone to Creator
                    if (loaded.userType !== 'Creator') {
                        loaded.userType = 'Creator';
                        await setDoc(ref, { userType: 'Creator' }, { merge: true });
                    }

                    // Merge defaults safely
                    const mergedUser: User = {
                        ...loaded,
                        settings: {
                            ...defaultSettings,
                            ...(loaded.settings || {}),
                            tone: {
                                ...defaultSettings.tone,
                                ...(loaded.settings?.tone || {})
                            },
                            connectedAccounts: {
                                ...defaultSettings.connectedAccounts,
                                ...(loaded.settings?.connectedAccounts || {})
                            }
                        },
                        socialStats: loaded.socialStats || generateMockSocialStats(),
                    };

                    // Check for expired subscriptions and invite-granted access
                    try {
                        const status = (mergedUser as any)?.subscriptionStatus as string | undefined;
                        const inviteGrantPlan = (mergedUser as any)?.inviteGrantPlan as string | undefined;
                        const expiresAtIso = (mergedUser as any)?.inviteGrantExpiresAt as string | null | undefined;
                        const hasStripeSubscription = !!(mergedUser as any)?.stripeSubscriptionId;
                        const subscriptionEndDate = (mergedUser as any)?.subscriptionEndDate as string | null | undefined;
                        const cancelAtPeriodEnd = (mergedUser as any)?.cancelAtPeriodEnd as boolean | undefined;
                        const currentPlan = mergedUser.plan;

                        // Check if Stripe subscription has expired (canceled and past end date)
                        if (hasStripeSubscription && cancelAtPeriodEnd && subscriptionEndDate) {
                            const endDateMs = new Date(subscriptionEndDate).getTime();
                            if (Number.isFinite(endDateMs) && endDateMs < Date.now() && currentPlan !== 'Free') {
                                // Subscription period has ended - downgrade to Free
                                const nowIso = new Date().toISOString();
                                (mergedUser as any).plan = 'Free';
                                (mergedUser as any).subscriptionStatus = 'canceled';
                                (mergedUser as any).cancelAtPeriodEnd = false;

                                // Persist downgrade so it stays consistent across refresh/devices
                                await setDoc(ref, {
                                    plan: 'Free',
                                    subscriptionStatus: 'canceled',
                                    cancelAtPeriodEnd: false,
                                } as any, { merge: true });
                            }
                        }

                        // Expire invite-granted access (do not affect Stripe subscribers).
                        // If expired, downgrade to Free and force user to upgrade via Stripe (Pricing).
                        const isInviteGrant = status === 'invite_grant' || !!inviteGrantPlan;
                        if (isInviteGrant && !hasStripeSubscription && typeof expiresAtIso === 'string' && expiresAtIso) {
                            const expiresMs = new Date(expiresAtIso).getTime();
                            if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
                                const nowIso = new Date().toISOString();
                                (mergedUser as any).plan = 'Free';
                                (mergedUser as any).subscriptionStatus = 'invite_grant_expired';
                                (mergedUser as any).inviteGrantExpiredAt = nowIso;

                                // Persist downgrade so it stays consistent across refresh/devices.
                                await setDoc(ref, {
                                    plan: 'Free',
                                    subscriptionStatus: 'invite_grant_expired',
                                    inviteGrantExpiredAt: nowIso,
                                } as any, { merge: true });
                            }
                        }
                    } catch (e) {
                        console.warn('Subscription/invite expiry check failed:', e);
                    }

                    setUserState(mergedUser);

                } else {
                    // NEW user document - check if there's a pending signup
                    // If there is, don't create the document yet - wait for plan selection
                    const pendingSignup = typeof window !== 'undefined' ? localStorage.getItem('pendingSignup') : null;
                    
                    if (pendingSignup) {
                        // User has pending signup - don't create document yet
                        // The plan selection flow will create it after plan is selected
                        // Set user state to null so the app knows to show plan selector
                        setUserState(null);
                        setIsAuthLoading(false);
                        return;
                    }
                    
                    // No pending signup - this might be a Google sign-in for an existing user
                    // or a direct sign-in. Create the user document.
                    // Since Free plan is removed, we'll set plan to null and prompt for plan selection
                    // This ensures users must select a plan (Pro/Elite) before using the app
                    const defaultPlan: Plan | null = null;
                    
                    const newUser: User = {
                        id: fbUser.uid,
                        name: fbUser.displayName || "New User",
                        email: fbUser.email || "",
                        avatar: fbUser.photoURL || `https://picsum.photos/seed/${fbUser.uid}/100/100`,
                        bio: "Welcome to EchoFlux.ai!",
                        plan: defaultPlan,
                        role: "User",
                        userType: 'Creator', // All users are Creators now
                        signupDate: new Date().toISOString(),
                        hasCompletedOnboarding: false,
                        notifications: {
                            newMessages: true,
                            weeklySummary: false,
                            trendAlerts: false,
                        },
                        monthlyCaptionGenerationsUsed: 0,
                        monthlyImageGenerationsUsed: 0,
                        monthlyVideoGenerationsUsed: 0,
                        monthlyRepliesUsed: 0,
                        storageUsed: 0,
                        storageLimit: 100,
                        mediaLibrary: [],
                        settings: defaultSettings,
                        socialStats: generateMockSocialStats(),
                    };

                    // Remove undefined values before saving to Firestore
                    const cleanUser = removeUndefined(newUser);
                    await setDoc(ref, cleanUser);
                    
                    // Clear pendingPlan from localStorage after use
                    try {
                        if (pendingPlan) {
                            localStorage.removeItem('pendingPlan');
                        }
                    } catch {}
                    
                    setUserState(newUser);
                }
            } else {
                setUserState(null);
            }

            setIsAuthLoading(false);
        });

        return () => unsub();
    }, []);

    // SAFE updater — strips undefined before writing
    const setUser = async (update: Partial<User> | null) => {
        if (!update) {
            setUserState(null);
            return;
        }
        if (!update.id) {
            console.warn("setUser called without user.id — ignoring");
            return;
        }

        const clean = removeUndefined(update);

        // Update local
        setUserState(prev => prev ? { ...prev, ...clean } : prev);

        // Update Firestore
        try {
            const authUid = auth.currentUser?.uid || null;
            if (!authUid) {
                // Auth may not be fully ready yet (transient during sign-in). Skip write to avoid rules failures.
                console.warn("Firestore update skipped: auth.currentUser is not available yet", { targetUserId: update.id });
                return;
            }
            if (authUid !== update.id) {
                // Never attempt to write another user's doc from the client context.
                // This avoids permission errors and protects against accidental cross-user writes.
                console.warn("Firestore update skipped: auth UID mismatch", { authUid, targetUserId: update.id });
                return;
            }

            await setDoc(doc(db, 'users', update.id), clean, { merge: true });
        } catch (err) {
            console.error("Firestore update failed:", {
                err,
                authUid: auth.currentUser?.uid || null,
                targetUserId: update.id,
                keys: Object.keys(clean || {}),
            });
        }
    };

    const handleLogout = async () => {
        // Clear any signup/checkout state that should never survive a manual logout.
        // This prevents showing the plan-selector modal (pendingSignup) on next visit,
        // and avoids stale Stripe finalize attempts tied to a different user.
        if (typeof window !== 'undefined') {
            try {
                localStorage.removeItem('pendingSignup');
                localStorage.removeItem('pendingPlan');
                localStorage.removeItem('paymentAttempt');
                localStorage.removeItem('paymentAttemptPrompted');
                localStorage.removeItem('paymentAttemptPromptedAt');
                localStorage.removeItem('postCheckoutSessionId');
                localStorage.removeItem('postCheckoutFinalizeAttemptCount');
                localStorage.removeItem('postCheckoutFinalizeNextAttemptAt');
            } catch {}

            // If the user logs out while on an authenticated route, force URL back to landing.
            // (UIContext only keeps the URL in sync while authenticated.)
            try {
                const path = window.location.pathname || '/';
                const isAuthenticatedRoute = path.startsWith('/dashboard') ||
                    path.startsWith('/inbox') ||
                    path.startsWith('/analytics') ||
                    path.startsWith('/settings') ||
                    path.startsWith('/compose') ||
                    path.startsWith('/calendar') ||
                    path.startsWith('/drafts') ||
                    path.startsWith('/approvals') ||
                    path.startsWith('/team') ||
                    path.startsWith('/opportunities') ||
                    path.startsWith('/profile') ||
                    path.startsWith('/clients') ||
                    path.startsWith('/admin') ||
                    path.startsWith('/automation') ||
                    path.startsWith('/strategy') ||
                    path.startsWith('/ads') ||
                    path.startsWith('/mediaLibrary') ||
                    path.startsWith('/autopilot') ||
                    path.startsWith('/premiumcontentstudio') ||
                    path.startsWith('/onlyfansStudio');
                if (isAuthenticatedRoute) {
                    window.history.replaceState({}, '', '/');
                }
            } catch {}
        }

        await signOut(auth);
        setUserState(null);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated: !!user,
                isAuthLoading,
                setUser,
                handleLogout,
            }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
};


