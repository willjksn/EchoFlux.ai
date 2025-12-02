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
    const platforms: Platform[] = ['Instagram','TikTok','X','Threads','YouTube','LinkedIn','Facebook'];
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

                    // Admins default to Creator dashboard unless they have a userType set
                    // If Admin has no userType, set it to Creator and persist to Firestore
                    if (loaded.role === 'Admin' && !loaded.userType) {
                        loaded.userType = 'Creator';
                        // Persist to Firestore
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

                    setUserState(mergedUser);

                } else {
                    // NEW user document
                    const newUser: User = {
                        id: fbUser.uid,
                        name: fbUser.displayName || "New User",
                        email: fbUser.email || "",
                        avatar: fbUser.photoURL || `https://picsum.photos/seed/${fbUser.uid}/100/100`,
                        bio: "Welcome to EngageSuite.ai!",
                        plan: "Free",
                        role: "User",
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
                        storageUsed: 0,
                        storageLimit: 100,
                        mediaLibrary: [],
                        settings: defaultSettings,
                        socialStats: generateMockSocialStats(),
                    };

                    await setDoc(ref, newUser);
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
            await setDoc(doc(db, 'users', update.id), clean, { merge: true });
        } catch (err) {
            console.error("Firestore update failed:", err);
        }
    };

    const handleLogout = async () => {
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


