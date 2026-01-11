// api/_emojiHelper.ts
// Helper function to get emoji settings and generate emoji usage instructions

export interface EmojiSettings {
  enabled: boolean;
  intensity: number; // 0-10 scale
}

/**
 * Get emoji usage instructions for AI prompts based on settings
 */
export function getEmojiInstructions(settings: EmojiSettings | null | undefined): string {
  if (!settings || !settings.enabled || settings.intensity === 0) {
    return 'Do NOT use any emojis in the generated content.';
  }

  const intensity = settings.intensity ?? 5;
  
  if (intensity <= 3) {
    return 'Use emojis sparingly (0-1 per message/item, only when very appropriate and natural). Choose emojis that enhance the message without being distracting.';
  } else if (intensity <= 7) {
    return 'Use emojis moderately (1-2 per message/item when appropriate for the tone). Choose emojis that match the content tone and enhance engagement naturally.';
  } else {
    return 'Use emojis liberally (2-3 per message/item to make content playful and engaging). Choose emojis that match the tone and add personality to the content.';
  }
}

/**
 * Get emoji examples based on tone
 */
export function getEmojiExamplesForTone(tone?: string): string {
  if (!tone) return '😊😘💕✨';
  
  const toneLower = tone.toLowerCase();
  if (toneLower.includes('explicit') || toneLower.includes('raw')) {
    return '🔥💦😈';
  } else if (toneLower.includes('teasing') || toneLower.includes('flirty')) {
    return '😏😉💋';
  } else if (toneLower.includes('playful') || toneLower.includes('fun')) {
    return '😊😘😍';
  } else if (toneLower.includes('intimate') || toneLower.includes('romantic')) {
    return '💕❤️💖';
  } else if (toneLower.includes('confident') || toneLower.includes('bold')) {
    return '💪🔥✨';
  }
  return '😊😘💕✨';
}

