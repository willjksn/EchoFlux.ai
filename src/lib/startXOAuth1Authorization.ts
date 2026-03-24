import { auth } from '../../firebaseConfig';

/**
 * Starts X OAuth 1.0a (media upload) after OAuth 2.0 completes. Redirects the window on success; throws on failure.
 */
export async function startXOAuth1Authorization(): Promise<void> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
  if (!token) {
    throw new Error('User must be logged in');
  }

  const response = await fetch('/api/oauth/x/authorize-oauth1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let errorData: Record<string, unknown> = {};
    try {
      errorData = (await response.json()) as Record<string, unknown>;
    } catch {
      const text = await response.text().catch(() => 'Unknown error');
      errorData = { error: 'Failed to connect OAuth 1.0a', details: text };
    }

    let errorMessage = String(errorData.error || 'Failed to connect OAuth 1.0a');
    let errorDetails = String(errorData.details || errorData.twitterError || '');

    if (errorData.help) {
      errorDetails = errorDetails ? `${errorDetails}. ${errorData.help}` : String(errorData.help);
    }

    if (
      errorDetails.includes('callback URL') ||
      errorDetails.includes('Callback URI') ||
      errorDetails.includes('callback') ||
      errorMessage.includes('callback')
    ) {
      errorMessage = 'OAuth 1.0a Callback URL Not Registered';
      let troubleshootingMsg = `The callback URL "${(errorData.callbackUrl as string) || 'https://echoflux.ai/api/oauth/x/callback-oauth1'}" is not recognized by X.\n\n`;
      troubleshootingMsg +=
        'Common causes:\n• URL registered in OAuth 2.0 section instead of OAuth 1.0a section\n• OAuth 1.0a not enabled in Developer Portal\n• URL format mismatch (trailing slash, case sensitivity, etc.)\n• Changes not propagated yet (wait 2-3 minutes after saving)\n\n';
      troubleshootingMsg +=
        'Troubleshooting: X Developer Portal → User authentication settings → enable OAuth 1.0a → add the callback URL exactly as shown above.';
      errorDetails = troubleshootingMsg;
    } else if (errorDetails.includes('OAuth 1.0a not enabled')) {
      errorMessage = 'OAuth 1.0a Not Enabled';
      errorDetails =
        'OAuth 1.0a must be enabled in your X Developer Portal. Go to your X App settings → User authentication settings and enable "OAuth 1.0a" authentication.';
    }

    const fullMessage = errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage;
    throw new Error(fullMessage);
  }

  const data = (await response.json()) as { authUrl?: string };
  if (!data.authUrl || typeof data.authUrl !== 'string') {
    throw new Error('Invalid authorization URL');
  }

  window.location.href = data.authUrl;
}
