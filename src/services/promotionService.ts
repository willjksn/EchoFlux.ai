// src/services/promotionService.ts
// Service functions for promotion validation and application

const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';

export interface PromotionValidationResult {
  valid: boolean;
  promotion?: {
    id: string;
    code: string;
    name: string;
    type: 'percentage' | 'fixed' | 'free';
  };
  originalPrice?: number;
  discountedPrice?: number;
  discountAmount?: number;
  expiresAt?: string;
  freeDays?: number;
  discountDurationDays?: number;
  error?: string;
}

export async function validatePromotion(
  code: string,
  plan: string,
  price: number
): Promise<PromotionValidationResult> {
  try {
    const response = await fetch(`${API_BASE}/api/validatePromotion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`,
      },
      body: JSON.stringify({ code, plan, price }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        valid: false,
        error: data.error || 'Failed to validate promotion',
      };
    }

    return data;
  } catch (error: any) {
    console.error('Error validating promotion:', error);
    return {
      valid: false,
      error: error.message || 'Failed to validate promotion',
    };
  }
}

export async function applyPromotion(
  promotionId: string,
  plan: string,
  originalPrice: number,
  discountedPrice: number,
  discountAmount: number,
  expiresAt?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/api/applyPromotion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`,
      },
      body: JSON.stringify({
        promotionId,
        plan,
        originalPrice,
        discountedPrice,
        discountAmount,
        expiresAt,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to apply promotion',
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error applying promotion:', error);
    return {
      success: false,
      error: error.message || 'Failed to apply promotion',
    };
  }
}

async function getAuthToken(): Promise<string> {
  // Get Firebase auth token
  const { auth } = await import('../../firebaseConfig');
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return await user.getIdToken(true);
}

