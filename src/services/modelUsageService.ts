// src/services/modelUsageService.ts
// Service for fetching model usage analytics

import { auth } from "../../firebaseConfig";

async function callFunction(path: string, params?: Record<string, any>) {
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken(true)
    : null;

  const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(`/api/${path}${queryString}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API ${path} failed: ${res.status} - ${errorText}`);
  }

  return res.json();
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

