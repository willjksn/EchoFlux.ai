// api/_geminiShared.ts
import { createGeminiModelWithFallbacks } from "./_modelRouter.js";

const DEFAULT_MODEL = "gemini-2.0-flash";

/** Same Gemini fallback chain as `getModelForTask` (2.0 → 2.5 → 1.5). */
export function getModel(modelName: string = DEFAULT_MODEL) {
  return createGeminiModelWithFallbacks(modelName.trim() || DEFAULT_MODEL);
}

export function parseJSON(text: string) {
  const clean = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  return JSON.parse(clean || "null");
}

