/**
 * Input Validation Utilities
 * Provides common validation functions for user inputs
 */

/**
 * Validates and sanitizes text input
 */
export function validateTextInput(
  text: string | undefined | null,
  options: {
    maxLength?: number;
    minLength?: number;
    required?: boolean;
    allowEmpty?: boolean;
  } = {}
): { isValid: boolean; error?: string; sanitized?: string } {
  const {
    maxLength = 100000, // Default 100KB of text
    minLength = 0,
    required = false,
    allowEmpty = true,
  } = options;

  // Check if required
  if (required && (!text || text.trim().length === 0)) {
    return { isValid: false, error: 'This field is required' };
  }

  // Allow empty if not required
  if (!text || text.trim().length === 0) {
    if (allowEmpty) {
      return { isValid: true, sanitized: '' };
    }
    return { isValid: false, error: 'This field cannot be empty' };
  }

  // Check type
  if (typeof text !== 'string') {
    return { isValid: false, error: 'Invalid input type' };
  }

  // Check length
  if (text.length > maxLength) {
    return {
      isValid: false,
      error: `Text is too long. Maximum length is ${maxLength} characters.`,
    };
  }

  if (text.length < minLength) {
    return {
      isValid: false,
      error: `Text is too short. Minimum length is ${minLength} characters.`,
    };
  }

  // Basic sanitization - remove null bytes and control characters (except newlines/tabs)
  const sanitized = text
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except \n, \t
    .trim();

  return { isValid: true, sanitized };
}

/**
 * Validates URL
 */
export function validateUrl(
  url: string | undefined | null,
  options: { allowedProtocols?: string[]; required?: boolean } = {}
): { isValid: boolean; error?: string; sanitized?: string } {
  const { allowedProtocols = ['http:', 'https:'], required = false } = options;

  if (required && !url) {
    return { isValid: false, error: 'URL is required' };
  }

  if (!url || url.trim().length === 0) {
    return { isValid: true, sanitized: '' };
  }

  try {
    const parsed = new URL(url);
    
    // Check protocol
    if (!allowedProtocols.includes(parsed.protocol)) {
      return {
        isValid: false,
        error: `Invalid URL protocol. Allowed: ${allowedProtocols.join(', ')}`,
      };
    }

    // Basic validation
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return { isValid: false, error: 'Invalid URL format' };
    }

    return { isValid: true, sanitized: parsed.toString() };
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validates email address
 */
export function validateEmail(email: string | undefined | null): {
  isValid: boolean;
  error?: string;
  sanitized?: string;
} {
  if (!email || email.trim().length === 0) {
    return { isValid: false, error: 'Email is required' };
  }

  // Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Invalid email format' };
  }

  // Check length
  if (email.length > 254) {
    return { isValid: false, error: 'Email is too long' };
  }

  const sanitized = email.trim().toLowerCase();
  return { isValid: true, sanitized };
}

/**
 * Validates file type
 */
export function validateFileType(
  file: File,
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']
): { isValid: boolean; error?: string } {
  if (!file.type || !allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
    };
  }

  return { isValid: true };
}

/**
 * Validates file size
 */
export function validateFileSize(
  file: File,
  maxSizeBytes: number = 50 * 1024 * 1024 // 50MB default
): { isValid: boolean; error?: string } {
  if (file.size > maxSizeBytes) {
    const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(2);
    return {
      isValid: false,
      error: `File is too large. Maximum size is ${maxSizeMB} MB`,
    };
  }

  return { isValid: true };
}

/**
 * Validates array input
 */
export function validateArray<T>(
  arr: any,
  options: {
    minLength?: number;
    maxLength?: number;
    required?: boolean;
    itemValidator?: (item: any) => { isValid: boolean; error?: string };
  } = {}
): { isValid: boolean; error?: string; sanitized?: T[] } {
  const {
    minLength = 0,
    maxLength = 1000,
    required = false,
    itemValidator,
  } = options;

  if (required && (!arr || !Array.isArray(arr))) {
    return { isValid: false, error: 'Array is required' };
  }

  if (!arr || !Array.isArray(arr)) {
    return { isValid: true, sanitized: [] };
  }

  if (arr.length < minLength) {
    return {
      isValid: false,
      error: `Array must have at least ${minLength} items`,
    };
  }

  if (arr.length > maxLength) {
    return {
      isValid: false,
      error: `Array cannot have more than ${maxLength} items`,
    };
  }

  // Validate items if validator provided
  if (itemValidator) {
    for (let i = 0; i < arr.length; i++) {
      const result = itemValidator(arr[i]);
      if (!result.isValid) {
        return {
          isValid: false,
          error: `Item at index ${i}: ${result.error}`,
        };
      }
    }
  }

  return { isValid: true, sanitized: arr as T[] };
}

/**
 * Sanitizes HTML to prevent XSS
 * Basic implementation - for production, use a library like DOMPurify
 */
export function sanitizeHtml(html: string): string {
  // Remove script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

