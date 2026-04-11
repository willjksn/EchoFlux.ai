// api/_errorHandler.ts
// Shared error handling utilities for API endpoints

import type { VercelResponse } from "@vercel/node";

/**
 * Wraps an API handler with comprehensive error handling
 * Returns JSON with success: false. Status stays 200 for backward compatibility with clients that only read the body.
 * Production responses avoid leaking internal error messages in `note`.
 */
export function withErrorHandling(
  handler: (req: any, res: VercelResponse) => Promise<void>
) {
  return async (req: any, res: VercelResponse) => {
    try {
      await handler(req, res);
    } catch (err: any) {
      console.error("Unhandled API error:", err);
      if (process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview") {
        console.error("Error stack:", err?.stack);
      }

      // If response already sent, don't try to send again
      if (res.headersSent) {
        return;
      }

      const dev = process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview";
      return res.status(200).json({
        success: false,
        error: "Internal server error",
        note: dev
          ? err?.message || "An unexpected error occurred. Please try again."
          : "An unexpected error occurred. Please try again.",
        details: dev
          ? {
              message: err?.message,
              stack: err?.stack,
              name: err?.name,
            }
          : undefined,
      });
    }
  };
}

/**
 * Checks if API keys are configured
 */
export function checkApiKeys(): { hasKey: boolean; error?: string } {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    return {
      hasKey: false,
      error: "GEMINI_API_KEY or GOOGLE_API_KEY is missing. Configure it in your environment to enable AI features.",
    };
  }
  return { hasKey: true };
}

/**
 * Safely imports verifyAuth with error handling
 */
export async function getVerifyAuth() {
  try {
    const module = await import("./verifyAuth.js");
    return module.verifyAuth;
  } catch (importError: any) {
    console.error("Failed to import verifyAuth:", importError);
    throw new Error(`Failed to load authentication module: ${importError?.message || String(importError)}`);
  }
}

/**
 * Safely imports getModelForTask with error handling
 */
export async function getModelRouter() {
  try {
    const module = await import("./_modelRouter.js");
    return module.getModelForTask;
  } catch (importError: any) {
    console.error("Failed to import _modelRouter:", importError);
    throw new Error(`Failed to load model router module: ${importError?.message || String(importError)}`);
  }
}

