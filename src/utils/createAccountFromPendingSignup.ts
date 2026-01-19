// Utility function to create Firebase account from pending signup data
import { createUserWithEmailAndPassword, updateProfile, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { User, Plan, Platform, SocialStats } from '../../types';
import { defaultSettings } from '../../constants';

interface PendingSignupData {
  email: string;
  password: string;
  fullName: string;
  inviteCode?: string;
  selectedPlan: string | null;
  billingCycle?: 'monthly' | 'annually';
  timestamp: number;
  isGoogleSignup?: boolean;
  googleUid?: string;
  googlePhotoURL?: string | null;
}

export async function createAccountFromPendingSignup(): Promise<{ success: boolean; error?: string }> {
  try {
    // Get pending signup data from localStorage
    const pendingSignupStr = localStorage.getItem('pendingSignup');
    if (!pendingSignupStr) {
      return { success: false, error: 'No pending signup found' };
    }

    const pendingSignup: PendingSignupData = JSON.parse(pendingSignupStr);

    // Check if data is too old (more than 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (pendingSignup.timestamp < oneHourAgo) {
      localStorage.removeItem('pendingSignup');
      return { success: false, error: 'Signup session expired. Please try again.' };
    }

    let currentUser = auth.currentUser;
    
    const selectedPlan = pendingSignup.selectedPlan as Plan;
    const needsPayment = !!selectedPlan && selectedPlan !== 'Free';
    // For paid plans, don't set plan yet - wait for payment confirmation
    // This prevents accounts from being finalized with Free plan if payment is canceled
    const effectivePlan: Plan | null = needsPayment ? null : (selectedPlan || 'Free');

    // Handle Google signup differently
    if (pendingSignup.isGoogleSignup) {
      // For Google signup, the user is already authenticated in Firebase Auth
      // We just need to ensure they're still signed in (they should be)
      if (!currentUser) {
        // If somehow they're not signed in, sign them in with Google
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        currentUser = result.user;
      }
      
      // Check if user document already exists (shouldn't, but check anyway)
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        // Create the user document manually since AuthContext won't do it (pendingSignup exists)
        // We'll clear pendingSignup after creating the document
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
        
        const newUser: User = {
          id: currentUser.uid,
          name: pendingSignup.fullName || currentUser.displayName || "New User",
          email: currentUser.email || pendingSignup.email || "",
          avatar: pendingSignup.googlePhotoURL || currentUser.photoURL || `https://picsum.photos/seed/${currentUser.uid}/100/100`,
          bio: "Welcome to EchoFlux.ai!",
          plan: effectivePlan, // null for paid plans until payment confirmed
          role: "User",
          userType: 'Creator',
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
        
        // Remove undefined values before saving
        const removeUndefined = (obj: any): any => {
          if (!obj || typeof obj !== "object") return obj;
          const clean: any = {};
          for (const key in obj) {
            const value = obj[key];
            if (value !== undefined) clean[key] = removeUndefined(value);
          }
          return clean;
        };
        
        const cleanUser = removeUndefined(newUser);
        await setDoc(userRef, cleanUser);
      }
    } else {
      // Regular email/password signup - create Firebase account
      try {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          pendingSignup.email,
          pendingSignup.password
        );

        // Update profile with full name
        await updateProfile(userCredential.user, {
          displayName: pendingSignup.fullName || 'New User',
        });
        
        currentUser = userCredential.user;
        
        // Create Firestore user document immediately
        // This ensures the document exists before we clear pendingSignup and reload
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
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
          
        const newUser: User = {
            id: currentUser.uid,
            name: pendingSignup.fullName || currentUser.displayName || "New User",
            email: currentUser.email || pendingSignup.email || "",
            avatar: currentUser.photoURL || `https://picsum.photos/seed/${currentUser.uid}/100/100`,
            bio: "Welcome to EchoFlux.ai!",
          plan: effectivePlan, // null for paid plans until payment confirmed
            role: "User",
            userType: 'Creator',
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
          
          const removeUndefined = (obj: any): any => {
            if (!obj || typeof obj !== "object") return obj;
            const clean: any = {};
            for (const key in obj) {
              const value = obj[key];
              if (value !== undefined) clean[key] = removeUndefined(value);
            }
            return clean;
          };
          
          const cleanUser = removeUndefined(newUser);
          await setDoc(userRef, cleanUser);
        }
      } catch (createError: any) {
        // If email is already in use, try to sign in instead
        if (createError.code === 'auth/email-already-in-use') {
          try {
            // Attempt to sign in with the provided credentials
            const signInCredential = await signInWithEmailAndPassword(
              auth,
              pendingSignup.email,
              pendingSignup.password
            );
            currentUser = signInCredential.user;
            
            // Update profile with full name if it's different
            if (pendingSignup.fullName && currentUser.displayName !== pendingSignup.fullName) {
              try {
                await updateProfile(currentUser, {
                  displayName: pendingSignup.fullName,
                });
              } catch (updateError) {
                // Profile update failed, but sign-in succeeded - continue
                console.warn('Failed to update profile:', updateError);
              }
            }
            
            // Check if user document exists, create if it doesn't
            const userRef = doc(db, 'users', currentUser.uid);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
              // User exists in Auth but not in Firestore - create the document
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
              
              const newUser: User = {
                id: currentUser.uid,
                name: pendingSignup.fullName || currentUser.displayName || "New User",
                email: currentUser.email || pendingSignup.email || "",
                avatar: currentUser.photoURL || `https://picsum.photos/seed/${currentUser.uid}/100/100`,
                bio: "Welcome to EchoFlux.ai!",
                plan: effectivePlan, // null for paid plans until payment confirmed
                role: "User",
                userType: 'Creator',
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
              
              const removeUndefined = (obj: any): any => {
                if (!obj || typeof obj !== "object") return obj;
                const clean: any = {};
                for (const key in obj) {
                  const value = obj[key];
                  if (value !== undefined) clean[key] = removeUndefined(value);
                }
                return clean;
              };
              
              const cleanUser = removeUndefined(newUser);
              await setDoc(userRef, cleanUser);
            }
          } catch (signInError: any) {
            // Sign-in failed - wrong password or other issue
            throw {
              code: 'auth/email-already-in-use',
              message: 'This email is already registered. Please sign in with your existing password.',
              originalError: signInError
            };
          }
        } else {
          // Re-throw other errors
          throw createError;
        }
      }
    }

    // Mark invite code as used (if provided)
    if (pendingSignup.inviteCode && currentUser) {
      try {
        const token = await currentUser.getIdToken();
        await fetch('/api/useInviteCode', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ inviteCode: pendingSignup.inviteCode }),
        });
      } catch (inviteError) {
        console.error('Failed to mark invite code as used:', inviteError);
        // Don't fail account creation if invite marking fails - log it
      }
    }

    // For paid plans, clear pendingSignup so AuthContext can hydrate the user.
    // Keep a paymentAttempt so checkout can resume after reload.
    const isPaidPlan = needsPayment;
    
    if (!isPaidPlan) {
      // Free plan - clear pendingSignup immediately since no payment needed
      localStorage.removeItem('pendingSignup');
    } else {
      // Paid plan - store payment attempt info so checkout can resume
      localStorage.setItem('paymentAttempt', JSON.stringify({
        email: pendingSignup.email,
        plan: selectedPlan,
        billingCycle: pendingSignup.billingCycle === 'annually' ? 'annually' : 'monthly',
        timestamp: Date.now(),
        accountCreated: true,
        resumeCheckout: true,
      }));
      // Clear pendingSignup so AuthContext can create the user document
      localStorage.removeItem('pendingSignup');
    }

    return { success: true };
  } catch (error: any) {
    // Only log non-email-already-in-use errors to avoid console spam
    // The email-already-in-use case is now handled gracefully by signing in
    if (error.code !== 'auth/email-already-in-use') {
      console.error('Error creating account from pending signup:', error);
    }
    
    // Handle specific Firebase errors
    let errorMessage = 'Failed to create account. Please try again.';
    if (error.code === 'auth/email-already-in-use') {
      // This should rarely happen now since we try to sign in, but handle it just in case
      errorMessage = error.message || 'This email is already registered. Please sign in instead.';
      localStorage.removeItem('pendingSignup');
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'Password is too weak. Please use a stronger password.';
    } else if (error.code === 'auth/popup-closed-by-user') {
      errorMessage = 'Sign-in popup was closed. Please try again.';
    } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
      errorMessage = 'This email is already registered, but the password is incorrect. Please sign in with your existing password.';
      localStorage.removeItem('pendingSignup');
    } else if (error.message) {
      errorMessage = error.message;
    }

    return { success: false, error: errorMessage };
  }
}

