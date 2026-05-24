import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseAuthUser } from 'firebase/auth';
import { clearLocalPushRegistrationState } from '../../src/lib/fanPushNotifications';
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { User, SocialStats, Platform, Plan } from '../../types';
import { defaultSettings, FAN_STOREFRONT_SIGNUP_SESSION_KEY } from '../../constants';
import { fetchStaffRoleFlagsForUid } from '../../src/lib/staffRolesFirestore';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isAuthLoading: boolean;
    /** True when Auth custom claim `creatorApp` is set (or user is Admin). Gates EchoFlux creator shell on main domain. */
    creatorAppAccess: boolean;
    refreshCreatorAppAccess: () => Promise<void>;
    setUser: (user: Partial<User> | null) => Promise<void>;
    handleLogout: () => void;
}

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
    const [creatorAppAccess, setCreatorAppAccess] = useState(false);

    const applyCreatorClaimFromToken = async (fbUser: FirebaseAuthUser): Promise<boolean> => {
        const tr = await fbUser.getIdTokenResult();
        return tr.claims.creatorApp === true;
    };

    const syncCreatorAppClaimWithServer = async (fbUser: FirebaseAuthUser): Promise<boolean> => {
        try {
            const idToken = await fbUser.getIdToken();
            const resp = await fetch('/api/syncCreatorAppClaim', {
                method: 'POST',
                headers: { Authorization: `Bearer ${idToken}` },
            });
            if (resp.ok) {
                await fbUser.getIdToken(true);
            }
        } catch (e) {
            console.warn('syncCreatorAppClaim request failed:', e);
        }
        return applyCreatorClaimFromToken(fbUser);
    };

    const refreshCreatorAppAccess = async () => {
        const fbUser = auth.currentUser;
        if (!fbUser) {
            setCreatorAppAccess(false);
            return;
        }
        const u = user;
        if (u?.role === 'Admin') {
            setCreatorAppAccess(true);
            return;
        }
        if (u?.staffRoleFlags?.contentAudit || u?.staffRoleFlags?.legalDisclosureReserve) {
            setCreatorAppAccess(true);
            return;
        }
        const hasClaim = await syncCreatorAppClaimWithServer(fbUser);
        setCreatorAppAccess(hasClaim);
    };

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (fbUser) => {
            setIsAuthLoading(true);
            try {
                if (fbUser) {
                    const ref = doc(db, 'users', fbUser.uid);
                    const snap = await getDoc(ref);

                    if (snap.exists()) {
                        try {
                            sessionStorage.removeItem(FAN_STOREFRONT_SIGNUP_SESSION_KEY);
                        } catch {
                            /* ignore */
                        }
                        const loaded = snap.data() as User;

                    // Merge defaults safely
                    const mergedUser: User = {
                        ...loaded,
                        // Always trust Firebase Auth UID for path ownership checks.
                        // If stored `id` is missing/stale, downstream listeners may hit
                        // users/{wrong-id}/... and trigger permission-denied.
                        id: fbUser.uid,
                        email: loaded.email || fbUser.email || "",
                        name: loaded.name || fbUser.displayName || "User",
                        avatar: loaded.avatar || fbUser.photoURL || `https://picsum.photos/seed/${fbUser.uid}/100/100`,
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

                    let staffRoleFlags = { contentAudit: false, legalDisclosureReserve: false };
                    try {
                        staffRoleFlags = await fetchStaffRoleFlagsForUid(db, fbUser.uid);
                    } catch {
                        /* rules may deny until staff_roles doc exists */
                    }
                    mergedUser.staffRoleFlags = staffRoleFlags;

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
                                await syncCreatorAppClaimWithServer(fbUser);
                            }
                        }

                        // Expire time-boxed invite access (do not affect Stripe subscribers).
                        const shouldApplyInviteExpiry =
                          !hasStripeSubscription &&
                          typeof expiresAtIso === 'string' &&
                          expiresAtIso &&
                          (status === 'invite_grant' || status === 'creator_invite_pending');
                        if (shouldApplyInviteExpiry) {
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

                        if (mergedUser.role === 'Admin') {
                            setCreatorAppAccess(true);
                        } else if (staffRoleFlags.contentAudit || staffRoleFlags.legalDisclosureReserve) {
                            setCreatorAppAccess(true);
                        } else {
                            const hasClaim = await syncCreatorAppClaimWithServer(fbUser);
                            setCreatorAppAccess(hasClaim);
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
                            setCreatorAppAccess(false);
                            return;
                        }
                    
                        // No pending signup - main landing / OAuth may use unprovisioned state until plan checkout.
                        // Fan creator storefront signup sets FAN_STOREFRONT_SIGNUP_SESSION_KEY so we skip SaaS plan modal.
                        let fromFanStorefrontSignup = false;
                        try {
                            if (sessionStorage.getItem(FAN_STOREFRONT_SIGNUP_SESSION_KEY) === '1') {
                                sessionStorage.removeItem(FAN_STOREFRONT_SIGNUP_SESSION_KEY);
                                fromFanStorefrontSignup = true;
                            }
                        } catch {
                            /* ignore */
                        }
                        const defaultPlan: Plan | null = fromFanStorefrontSignup ? 'Free' : null;
                    
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
                            hasCompletedOnboarding: fromFanStorefrontSignup,
                            accountOrigin: fromFanStorefrontSignup ? 'fan_hub' : 'echoflux',
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
                        // Fan signup may run claimMemberUsername in parallel; it merges `username` onto this doc first.
                        // setDoc without merge would replace the whole document and wipe `username`.
                        await setDoc(ref, cleanUser, { merge: fromFanStorefrontSignup });
                    
                        // Clear pendingPlan from localStorage after use
                        try {
                            localStorage.removeItem('pendingPlan');
                        } catch {}
                    
                        setUserState(newUser);
                    }
                } else {
                    setUserState(null);
                }

            } catch (err: any) {
                console.error("Auth bootstrap failed:", err);
                if (err?.code === "permission-denied" || String(err?.message || "").includes("Missing or insufficient permissions")) {
                    console.error(
                        "Firestore permission denied during auth bootstrap. Verify Firebase env vars (VITE_FIREBASE_PROJECT_ID/authDomain/apiKey) all point to the same project and that Firestore rules are published."
                    );
                }
                setUserState(null);
                setCreatorAppAccess(false);
            } finally {
                setIsAuthLoading(false);
            }
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

            const mayChangeClaim =
                clean.hasCompletedOnboarding === true ||
                typeof clean.plan === "string" ||
                clean.role === "Admin";
            if (mayChangeClaim && auth.currentUser) {
                const u = auth.currentUser;
                if (clean.role === "Admin" || update.role === "Admin") {
                    setCreatorAppAccess(true);
                } else {
                    void (async () => {
                        const hasClaim = await syncCreatorAppClaimWithServer(u);
                        setCreatorAppAccess(hasClaim);
                    })();
                }
            }
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
                    path.startsWith('/analytics') ||
                    path.startsWith('/settings') ||
                    path.startsWith('/create-post') ||
                    path.startsWith('/write-captions') ||
                    path.startsWith('/compose') ||
                    path.startsWith('/my-schedule') ||
                    path.startsWith('/calendar') ||
                    path.startsWith('/drafts') ||
                    path.startsWith('/approvals') ||
                    path.startsWith('/team') ||
                    path.startsWith('/find-trends') ||
                    path.startsWith('/opportunities') ||
                    path.startsWith('/profile') ||
                    path.startsWith('/clients') ||
                    path.startsWith('/admin') ||
                    path.startsWith('/automation') ||
                    path.startsWith('/bio-link-page') ||
                    path.startsWith('/bio') ||
                    path === '/plan' ||
                    path.startsWith('/what-to-post') ||
                    path.startsWith('/plan-my-week') ||
                    path.startsWith('/strategy') ||
                    path.startsWith('/creator-os') ||
                    path.startsWith('/ads') ||
                    path.startsWith('/my-vault') ||
                    path.startsWith('/mediaLibrary') ||
                    path.startsWith('/autopilot') ||
                    path.startsWith('/email-center') ||
                    path.startsWith('/emailCenter') ||
                    path.startsWith('/premium-content-studio') ||
                    path.startsWith('/premiumcontentstudio') ||
                    path.startsWith('/onlyfansStudio') ||
                    path.startsWith('/premium-studio-upgrade') ||
                    path.startsWith('/studio') ||
                    path.startsWith('/fan') ||
                    path.startsWith('/fan-hub');
                if (isAuthenticatedRoute) {
                    window.history.replaceState({}, '', '/');
                }
            } catch {}
        }

        clearLocalPushRegistrationState();
        await signOut(auth);
        setUserState(null);
        setCreatorAppAccess(false);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated: !!user,
                isAuthLoading,
                creatorAppAccess,
                refreshCreatorAppAccess,
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


