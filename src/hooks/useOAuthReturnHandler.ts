import { useEffect, useRef } from 'react';
import type { Platform, SocialAccount } from '../../types';
import { startXOAuth1Authorization } from '../lib/startXOAuth1Authorization';

type Args = {
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  socialAccounts: Record<Platform, SocialAccount | null> | undefined;
  isAuthLoading: boolean;
  /** Fan-only shells (storefront / witme discover / apply) skip creator OAuth return handling. */
  skip?: boolean;
};

/**
 * Handles OAuth return query params on any route. Must run app-wide: UIContext rewrites /?oauth_* → /dashboard
 * and strips the query unless preserved; Settings is often not mounted when users return from Meta/X.
 */
export function useOAuthReturnHandler({
  showToast,
  socialAccounts,
  isAuthLoading,
  skip = false,
}: Args): void {
  const handledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (skip) return;
    if (typeof window === 'undefined') return;
    if (isAuthLoading) return;

    const search = window.location.search;
    if (!search || !/[?&](oauth_success|error|connected)=/.test(search)) return;

    const key = `${window.location.pathname}${search}`;
    if (handledKeyRef.current === key) return;
    handledKeyRef.current = key;

    const params = new URLSearchParams(search);
    const oauthSuccess = params.get('oauth_success');
    const connectedLegacy = params.get('connected');
    const oauthError = params.get('error');
    const platform = params.get('platform');
    const messageParam = params.get('message');
    const errorDetails = params.get('details');

    const stripParams = () => {
      window.history.replaceState({}, '', window.location.pathname);
    };

    if (!oauthSuccess && connectedLegacy === 'meta' && !oauthError) {
      showToast(messageParam || 'Facebook and Instagram connection updated.', 'success');
      stripParams();
      window.location.reload();
      return;
    }

    if (oauthSuccess) {
      const oauthType = params.get('type');
      const accountName = params.get('account');
      const successPlatform = oauthSuccess;
      const platformName = successPlatform.charAt(0).toUpperCase() + successPlatform.slice(1);
      const safeX = socialAccounts?.X;
      const hasXOAuth1 = !!(
        safeX &&
        (safeX as { oauthToken?: string }).oauthToken &&
        (safeX as { oauthTokenSecret?: string }).oauthTokenSecret
      );

      if (successPlatform === 'x' && oauthType !== 'oauth1' && !hasXOAuth1) {
        const successMessage = accountName
          ? `${platformName} account (${accountName}) connected. Completing media permissions...`
          : `${platformName} account connected. Completing media permissions...`;
        showToast(successMessage, 'success');
        stripParams();
        startXOAuth1Authorization().catch((error: unknown) => {
          const msg =
            error instanceof Error
              ? error.message
              : 'Failed to connect OAuth 1.0a. Please try again.';
          let errorMsg = msg;
          if (
            errorMsg.includes('callback URL') ||
            errorMsg.includes('callback') ||
            errorMsg.includes('Callback')
          ) {
            errorMsg =
              'OAuth 1.0a callback not approved. In X Developer Portal → App → Settings → App details, add BOTH callback URLs: (1) https://echoflux.ai/api/oauth/x/callback (2) https://echoflux.ai/api/oauth/x/callback-oauth1';
          }
          showToast(errorMsg, 'error');
        });
        return;
      }

      if (oauthType === 'oauth1') {
        showToast('X media permissions enabled! You can now upload images and videos.', 'success');
      } else {
        const metaMsg =
          messageParam && oauthSuccess !== 'x' ? messageParam : null;
        const successMessage = metaMsg
          ? metaMsg
          : accountName
            ? `${platformName} account (${accountName}) connected successfully!`
            : `${platformName} account connected successfully!`;
        showToast(successMessage, 'success');
      }
      stripParams();
      window.location.reload();
      return;
    }

    if (oauthError) {
      let errorMsg = '';

      if (oauthError === 'no_instagram_account') {
        errorMsg =
          'No Instagram Business Account found. Your Instagram account must be converted to a Business or Creator account and connected to a Facebook Page. See instructions in Settings.';
      } else if (oauthError === 'no_pages') {
        errorMsg =
          'Facebook returned no Pages you manage. Use a Facebook login that is an admin of the Page linked to your Instagram Professional account, or create a Page and connect Instagram in Meta Business Suite.';
      } else if (oauthError === 'token_exchange_failed') {
        errorMsg = `Token exchange failed. ${errorDetails ? errorDetails.substring(0, 100) : 'Please try again.'}`;
      } else if (oauthError === 'pages_fetch_failed') {
        errorMsg = 'Failed to fetch Facebook Pages. Make sure you have at least one Facebook Page.';
      } else if (oauthError === 'oauth_not_configured') {
        const platformName = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'OAuth';
        errorMsg = `${platformName} OAuth is not configured. Please contact support or check your environment variables.`;
      } else if (oauthError === 'not_authenticated') {
        errorMsg =
          'Could not link this Facebook login to your EchoFlux account. Close extra browser tabs, sign in to EchoFlux again, then connect from Settings → Connections (do not open the Meta login URL in a separate tab).';
      } else if (messageParam) {
        errorMsg = messageParam;
      } else {
        errorMsg = `Failed to connect ${platform || 'account'}. Please try again.`;
      }

      showToast(errorMsg, 'error');
      stripParams();
    }
  }, [showToast, socialAccounts, isAuthLoading, skip]);
}
