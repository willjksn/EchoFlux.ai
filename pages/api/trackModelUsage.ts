// api/trackModelUsage.ts
// Track AI model usage for analytics and cost monitoring

import { getAdminDb } from './_firebaseAdmin.js';
import type { TaskType } from './_modelRouter.js';

export interface ModelUsageLog {
  id?: string;
  userId: string;
  taskType: TaskType;
  modelName: string;
  costTier: 'low' | 'medium' | 'high';
  timestamp: string; // ISO timestamp
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number; // Estimated cost in USD
  success: boolean;
  error?: string;
}

/**
 * Track a model usage event
 */
export async function trackModelUsage(log: Omit<ModelUsageLog, 'id' | 'timestamp'>): Promise<void> {
  try {
    const usageLog: Omit<ModelUsageLog, 'id'> = {
      ...log,
      timestamp: new Date().toISOString(),
    };

    await getAdminDb().collection('model_usage_logs').add(usageLog);
  } catch (error) {
    // Don't throw - tracking failures shouldn't break the app
    console.error('Failed to track model usage:', error);
  }
}

/**
 * Calculate estimated cost based on model and tokens
 * These are approximate costs per 1M tokens (as of 2024)
 */
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gemini-2.0-flash-lite': { input: 0.0375, output: 0.15 }, // ~50% of Flash
  'gemini-2.0-flash': { input: 0.075, output: 0.30 },
  'gemini-2.0-flash-thinking-exp': { input: 0.50, output: 1.50 }, // Approximate
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
};

export function estimateCost(modelName: string, inputTokens: number = 0, outputTokens: number = 0): number {
  const costs = MODEL_COSTS[modelName] || MODEL_COSTS['gemini-2.0-flash'];
  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;
  return inputCost + outputCost;
}

