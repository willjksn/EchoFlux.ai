// api/_modelRouter.ts
// Smart model routing based on task complexity and cost optimization

import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

if (!API_KEY) {
  console.warn("⚠️ GEMINI_API_KEY (or GOOGLE_API_KEY) is not set. All AI routes will fail.");
}

/**
 * Task types that determine which model to use
 */
export type TaskType = 
  | 'caption'           // Simple caption generation - use cheapest model
  | 'reply'             // Message replies - use cheapest model
  | 'categorize'        // Simple categorization - use cheapest model
  | 'hashtags'          // Hashtag suggestions - use cheapest model
  | 'analytics'         // Analytics insights - use thinking model
  | 'trends'            // Trend analysis - use thinking model
  | 'strategy'          // Content strategy - use balanced model
  | 'autopilot'         // Campaign planning - use balanced model
  | 'brand'             // Brand suggestions - use balanced model
  | 'critique'          // Content critique - use balanced model
  | 'crm-summary'       // CRM summaries - use balanced model
  | 'chatbot'           // General chatbot - use balanced model
  | 'image-prompt'      // Image prompt expansion - use balanced model
  | 'image_generation'  // Image generation (non-Gemini)
  | 'video_generation'  // Video generation (non-Gemini)
  | 'content_gap_analysis'      // Content gap analysis - use balanced model
  | 'caption_optimization'      // Caption optimization - use balanced model
  | 'performance_prediction'   // Performance prediction - use balanced model
  | 'content_repurposing'      // Content repurposing - use balanced model
  | 'sexting_session'   // Premium Content Studio: Sexting session assistant - use balanced model
  | 'member-welcome-draft'; // Automated member welcome DM drafts — stronger prose model

/**
 * Model configuration for each task type
 */
const MODEL_CONFIG: Record<TaskType, {
  model: string;
  description: string;
  costTier: 'low' | 'medium' | 'high';
}> = {
  // Low-cost tasks - use Flash Lite or Flash for speed
  'caption': {
    model: 'gemini-2.0-flash-lite',
    description: 'Fast, cheap model for caption generation',
    costTier: 'low',
  },
  'reply': {
    model: 'gemini-2.0-flash-lite',
    description: 'Fast, cheap model for message replies',
    costTier: 'low',
  },
  'categorize': {
    model: 'gemini-2.0-flash-lite',
    description: 'Fast, cheap model for message categorization',
    costTier: 'low',
  },
  'hashtags': {
    model: 'gemini-2.0-flash-lite',
    description: 'Fast, cheap model for hashtag suggestions',
    costTier: 'low',
  },
  
  // Medium-cost tasks - use Flash for balance
  'strategy': {
    model: 'gemini-2.0-flash',
    description: 'Balanced model for content strategy',
    costTier: 'medium',
  },
  'autopilot': {
    model: 'gemini-2.0-flash',
    description: 'Balanced model for campaign planning',
    costTier: 'medium',
  },
  'brand': {
    model: 'gemini-2.0-flash',
    description: 'Balanced model for brand suggestions',
    costTier: 'medium',
  },
  'critique': {
    model: 'gemini-2.0-flash',
    description: 'Balanced model for content critique',
    costTier: 'medium',
  },
  'crm-summary': {
    model: 'gemini-2.0-flash',
    description: 'Balanced model for CRM summaries',
    costTier: 'medium',
  },
  'chatbot': {
    model: 'gemini-2.0-flash',
    description: 'Balanced model for general chatbot',
    costTier: 'medium',
  },
  'image-prompt': {
    model: 'gemini-2.0-flash',
    description: 'Balanced model for image prompt expansion',
    costTier: 'medium',
  },
  'image_generation': {
    model: 'openai-image',
    description: 'Image generation (OpenAI/Replicate)',
    costTier: 'high',
  },
  'video_generation': {
    model: 'replicate-video',
    description: 'Video generation (Replicate)',
    costTier: 'high',
  },
  'content_gap_analysis': {
    model: 'gemini-2.0-flash',
    description: 'Balanced model for content gap analysis',
    costTier: 'medium',
  },
  'caption_optimization': {
    model: 'gemini-2.0-flash',
    description: 'Balanced model for caption optimization',
    costTier: 'medium',
  },
  'performance_prediction': {
    model: 'gemini-2.0-flash',
    description: 'Balanced model for performance prediction',
    costTier: 'medium',
  },
  'content_repurposing': {
    model: 'gemini-2.0-flash',
    description: 'Balanced model for content repurposing',
    costTier: 'medium',
  },
  'sexting_session': {
    model: 'gemini-2.0-flash',
    description: 'Balanced model for Premium Content Studio sexting session assistant',
    costTier: 'medium',
  },
  'member-welcome-draft': {
    model: 'gemini-2.5-flash',
    description: 'Stronger model for membership welcome DM drafts',
    costTier: 'medium',
  },
  
  // High-cost tasks - use Flash for complex reasoning (thinking-exp model not available)
  'analytics': {
    model: 'gemini-2.0-flash',
    description: 'Balanced model for analytics insights',
    costTier: 'medium',
  },
  'trends': {
    model: 'gemini-2.0-flash',
    description: 'Balanced model for trend analysis',
    costTier: 'medium',
  },
};

/**
 * Fallback order after the primary model. When 2.0 Flash / Flash-Lite are retired,
 * the next `generateContent` attempt uses 2.5, then 1.5 — no deploy required.
 */
const FALLBACK_MODELS: Record<string, string[]> = {
  'gemini-2.0-flash-lite': ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'],
  'gemini-2.5-flash-lite': ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'],
  'gemini-2.0-flash': ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  'gemini-2.5-flash': ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  'gemini-1.5-pro': ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'],
  'gemini-1.5-flash': ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.5-flash'],
};

export function buildGeminiModelChain(primary: string): string[] {
  if (!primary.startsWith('gemini-')) {
    return [primary];
  }
  const rest = FALLBACK_MODELS[primary];
  const chain = rest ? [primary, ...rest] : [primary];
  const seen = new Set<string>();
  return chain.filter((m) => {
    if (seen.has(m)) return false;
    seen.add(m);
    return true;
  });
}

type GenerateContentArgs = Parameters<GenerativeModel['generateContent']>;

export type GeminiWithFallbacks = Pick<GenerativeModel, 'generateContent'>;

/**
 * Returns a model-like object whose `generateContent` tries the primary Gemini model,
 * then each fallback on failure (e.g. 404 after deprecation, quota, transient errors).
 */
export function createGeminiModelWithFallbacks(
  primaryModelName: string,
  tracking?: { userId: string; taskType: TaskType; costTier: 'low' | 'medium' | 'high' }
): GeminiWithFallbacks {
  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  const chain = buildGeminiModelChain(primaryModelName);

  return {
    async generateContent(...args: GenerateContentArgs) {
      let lastErr: unknown;
      for (let i = 0; i < chain.length; i++) {
        const modelName = chain[i];
        try {
          const m = genAI.getGenerativeModel({ model: modelName });
          const result = await m.generateContent(...args);
          if (tracking?.userId) {
            import('./trackModelUsage.js').then(({ trackModelUsage }) => {
              trackModelUsage({
                userId: tracking.userId,
                taskType: tracking.taskType,
                modelName,
                costTier: tracking.costTier,
                success: true,
              }).catch(() => {});
            });
          }
          return result;
        } catch (e) {
          lastErr = e;
          const next = chain[i + 1];
          if (next) {
            console.warn(
              `[Gemini] "${modelName}" failed; retrying with "${next}" (${e instanceof Error ? e.message : String(e)})`
            );
          }
        }
      }
      throw lastErr;
    },
  };
}

/**
 * Get the appropriate model for a task type
 * `generateContent` automatically falls back to Gemini 2.5 / 1.5 if the primary fails.
 */
export async function getModelForTask(
  taskType: TaskType, 
  userId?: string,
  _fallbackLegacyParam: boolean = false
): Promise<GeminiWithFallbacks> {
  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }

  const config = MODEL_CONFIG[taskType] || MODEL_CONFIG['chatbot'];
  const modelName = config.model;
  const costTier = config.costTier;

  if (!modelName.startsWith('gemini-')) {
    throw new Error(`getModelForTask: non-Gemini model "${modelName}" for task ${taskType}`);
  }

  return createGeminiModelWithFallbacks(modelName, userId ? { userId, taskType, costTier } : undefined);
}

/**
 * Get model name for a task (useful for logging/monitoring)
 */
export function getModelNameForTask(taskType: TaskType): string {
  const config = MODEL_CONFIG[taskType] || MODEL_CONFIG['chatbot'];
  return config.model;
}

/**
 * Get cost tier for a task (useful for usage tracking)
 */
export function getCostTierForTask(taskType: TaskType): 'low' | 'medium' | 'high' {
  const config = MODEL_CONFIG[taskType] || MODEL_CONFIG['chatbot'];
  return config.costTier;
}

const DEFAULT_LEGACY_MODEL = 'gemini-2.0-flash';

/**
 * Legacy function — same fallback chain as task routing (2.0 → 2.5 → 1.5).
 */
export function getModel(modelName?: string): GeminiWithFallbacks {
  const primary = modelName?.trim() || DEFAULT_LEGACY_MODEL;
  return createGeminiModelWithFallbacks(primary);
}

/**
 * Helper to determine task type from context (optional, for auto-routing)
 */
export function inferTaskType(context: {
  endpoint?: string;
  prompt?: string;
  task?: string;
}): TaskType {
  // Infer from endpoint path
  if (context.endpoint) {
    if (context.endpoint.includes('caption')) return 'caption';
    if (context.endpoint.includes('reply')) return 'reply';
    if (context.endpoint.includes('categorize')) return 'categorize';
    if (context.endpoint.includes('analytics')) return 'analytics';
    if (context.endpoint.includes('trend')) return 'trends';
    if (context.endpoint.includes('autopilot')) return 'autopilot';
    if (context.endpoint.includes('strategy')) return 'strategy';
    if (context.endpoint.includes('brand')) return 'brand';
    if (context.endpoint.includes('critique')) return 'critique';
    if (context.endpoint.includes('crm')) return 'crm-summary';
    if (context.endpoint.includes('image')) return 'image-prompt';
  }
  
  // Infer from task field
  if (context.task) {
    const taskLower = context.task.toLowerCase();
    if (['caption', 'captions'].some(t => taskLower.includes(t))) return 'caption';
    if (['reply', 'replies'].some(t => taskLower.includes(t))) return 'reply';
    if (['analytics', 'analysis'].some(t => taskLower.includes(t))) return 'analytics';
    if (['trend', 'trends'].some(t => taskLower.includes(t))) return 'trends';
  }
  
  // Default to chatbot for general queries
  return 'chatbot';
}

