/**
 * Input Sanitization Utility
 * Sanitizes user inputs before processing to prevent:
 * - Prompt injection attacks
 * - XSS vulnerabilities
 * - Malformed data
 * - Excessive input lengths
 */

/**
 * Sanitizes a string input by:
 * - Trimming whitespace
 * - Removing potentially dangerous characters
 * - Limiting length
 * - Normalizing whitespace
 */
export function sanitizeInput(
  input: string | undefined | null,
  maxLength: number = 10000
): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    // Remove null bytes and control characters (except newlines and tabs)
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize multiple spaces to single space
    .replace(/\s+/g, ' ')
    // Normalize multiple newlines to max 2 consecutive
    .replace(/\n{3,}/g, '\n\n')
    // Limit length
    .slice(0, maxLength)
    .trim();
}

/**
 * Sanitizes text that will be sent to AI models
 * More permissive than general sanitization (allows more characters)
 */
export function sanitizeForAI(
  input: string | undefined | null,
  maxLength: number = 50000
): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    // Remove null bytes and dangerous control characters
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // Limit length
    .slice(0, maxLength)
    .trim();
}

/**
 * Sanitizes text that will be stored in database
 */
export function sanitizeForStorage(
  input: string | undefined | null,
  maxLength: number = 50000
): string {
  return sanitizeForAI(input, maxLength);
}

/**
 * Validates that input is not empty after sanitization
 */
export function isValidInput(input: string | undefined | null): boolean {
  if (!input) return false;
  const sanitized = sanitizeInput(input);
  return sanitized.length > 0;
}
