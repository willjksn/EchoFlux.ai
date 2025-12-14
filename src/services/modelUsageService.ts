// src/services/modelUsageService.ts
// Service for fetching model usage analytics

import { auth } from "../../firebaseConfig";

async function callFunction(path: string, params?: Record<string, any>) {
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken(true)
    : null;

  const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
  
  try {
    const res = await fetch(`/api/${path}${queryString}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!res.ok) {
      const errorText = await res.text();
      // Don't throw for 403 errors - they're expected for non-admin users
      if (res.status === 403) {
        console.warn(`API ${path} requires admin access`);
        throw new Error(`Admin access required`);
      }
      throw new Error(`API ${path} failed: ${res.status} - ${errorText}`);
    }

    return res.json();
  } catch (error: any) {
    // Handle network errors gracefully
    if (error.name === 'AbortError' || error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      console.warn(`API ${path} failed: Network error or timeout`);
      throw new Error(`Network error: Unable to reach API. Please check your connection.`);
    }
    throw error;
  }
}

export interface ModelUsageStats {
  totalRequests: number;
  totalCost: number;
  requestsByModel: Record<string, number>;
  requestsByTask: Record<string, number>;
  requestsByCostTier: {
    low: number;
    medium: number;
    high: number;
  };
  requestsByDay: Array<{ date: string; count: number; cost: number }>;
  topUsers: Array<{ userId: string; userName: string; requests: number; cost: number }>;
  errorRate: number;
  averageCostPerRequest: number;
}

export async function getModelUsageAnalytics(days: number = 30): Promise<ModelUsageStats> {
  return await callFunction("getModelUsageAnalytics", { days: days.toString() });
}

