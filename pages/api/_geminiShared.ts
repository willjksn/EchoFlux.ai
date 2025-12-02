// api/_geminiShared.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

if (!API_KEY) {
  console.warn("⚠️ GEMINI_API_KEY (or GOOGLE_API_KEY) is not set. All AI routes will fail.");
}

// Default to a safe, supported model.
const DEFAULT_MODEL = "gemini-2.0-flash";

export function getModel(modelName: string = DEFAULT_MODEL) {
  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  return genAI.getGenerativeModel({
    model: modelName || DEFAULT_MODEL,
  });
}

export function parseJSON(text: string) {
  const clean = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  return JSON.parse(clean || "null");
}

