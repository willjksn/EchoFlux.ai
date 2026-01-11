// src/utils/loadEmojiSettings.ts
// Helper function to load emoji settings from Firestore

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export interface EmojiSettings {
  enabled: boolean;
  intensity: number; // 0-10 scale
}

/**
 * Load emoji settings from user's Firestore document
 * Returns default settings if not found or on error
 */
export async function loadEmojiSettings(userId: string): Promise<EmojiSettings> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return {
        enabled: userData.emojiEnabled !== false, // Default to true
        intensity: userData.emojiIntensity ?? 5, // Default to 5 (moderate)
      };
    }
  } catch (error) {
    console.warn('Failed to load emoji settings:', error);
  }
  
  // Return defaults if not found or error
  return {
    enabled: true,
    intensity: 5,
  };
}

