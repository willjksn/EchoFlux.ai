import React, { createContext, useState, useEffect, useContext, ReactNode } from "react";
import {
    onAuthStateChanged,
    signOut,
    getRedirectResult,
    GoogleAuthProvider,
    User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";
import { User, SocialStats, Platform } from "../../types";
import { defaultSettings } from "../../constants";

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isAuthLoading: boolean;
    setUser: (user: User) => void;
    handleLogout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Generate fake follower stats for new users
const generateMockSocialStats = (): Record<Platform, SocialStats> => {
    const stats: any = {};
    const platforms: Platform[] = [
        "Instagram",
        "TikTok",
        "X",
        "Threads",
        "YouTube",
        "LinkedIn",
        "Facebook",
    ];

    platforms.forEach((p) => {
        stats[p] = {
            followers: Math.floor(Math.random() * 15000) + 100,
            following: Math.floor(Math.random() * 1000) + 10,
        };
    });

    return stats;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUserState] = useState<User | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    // 🔥 Handle Google Redirect BEFORE onAuthStateChanged runs
    useEffect(() => {
        const handleRedirect = async () => {
            try {
                const result = await getRedirectResult(auth);

                if (result?.user) {
                    console.log("Google redirect login successful:", result.user);

                    await result.user.getIdToken(true); // refresh token

                    // Firestore creation happens inside onAuthStateChanged below
                }
            } catch (error) {
                console.error("Google redirect error:", error);
            }
        };

        handleRedirect();
    }, []);

    // 🔥 Master authentication listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                setUserState(null);
                setIsAuthLoading(false);
                return;
            }

            try {
                const userDocRef = doc(db, "users", firebaseUser.uid);
                const snap = await getDoc(userDocRef);

                if (snap.exists()) {
                    const userData = snap.data() as User;

                    // merge settings and defaults
                    userData.settings = {
                        ...defaultSettings,
                        ...(userData.settings || {}),
                        tone: {
                            ...defaultSettings.tone,
                            ...(userData.settings?.tone || {}),
                        },
                        connectedAccounts: {
                            ...defaultSettings.connectedAccounts,
                            ...(userData.settings?.connectedAccounts || {}),
                        },
                    };

                    if (!userData.socialStats) {
                        userData.socialStats = generateMockSocialStats();
                    }

                    setUserState(userData);
                } else {
                    // Create new Firestore user entry
                    const newUser: User = {
                        id: firebaseUser.uid,
                        name: firebaseUser.displayName || "New User",
                        email: firebaseUser.email || "",
                        avatar:
                            firebaseUser.photoURL ||
                            `https://picsum.photos/seed/${firebaseUser.uid}/100/100`,
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

                    await setDoc(userDocRef, newUser);
                    setUserState(newUser);
                }
            } catch (err) {
                console.error("Error loading auth user:", err);
                setUserState(null);
            }

            setIsAuthLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const setUser = (updatedUser: User) => {
        if (updatedUser?.id) {
            setDoc(doc(db, "users", updatedUser.id), updatedUser, { merge: true }).catch((err) =>
                console.error("Failed to update Firestore user:", err)
            );
        }
        setUserState(updatedUser);
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
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
};
