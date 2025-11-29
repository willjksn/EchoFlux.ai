/**
 * Social Media OAuth Service
 * Handles OAuth flows and token management for social media platforms
 */

import { Platform, SocialAccount } from '../../types';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number; // seconds until expiration
  tokenType?: string;
}

/**
 * Base class for social media OAuth implementations
 */
export abstract class SocialMediaOAuth {
  protected platform: Platform;
  protected config: OAuthConfig;

  constructor(platform: Platform, config: OAuthConfig) {
    this.platform = platform;
    this.config = config;
  }

  /**
   * Get the OAuth authorization URL for the platform
   */
  abstract getAuthorizationUrl(state: string): string;

  /**
   * Exchange authorization code for access token
   */
  abstract exchangeCodeForToken(code: string): Promise<OAuthTokenResponse>;

  /**
   * Refresh an expired access token
   */
  abstract refreshToken(refreshToken: string): Promise<OAuthTokenResponse>;

  /**
   * Get user profile information from the platform
   */
  abstract getUserProfile(accessToken: string): Promise<{
    accountId: string;
    accountName: string;
    accountUsername: string;
  }>;

  /**
   * Check if a token is expired
   */
  isTokenExpired(expiresAt?: string): boolean {
    if (!expiresAt) return false;
    const expiration = new Date(expiresAt);
    return expiration < new Date();
  }
}

/**
 * Instagram OAuth Implementation
 * Uses Instagram Basic Display API
 */
export class InstagramOAuth extends SocialMediaOAuth {
  private readonly AUTH_URL = 'https://api.instagram.com/oauth/authorize';
  private readonly TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
  private readonly API_BASE = 'https://graph.instagram.com';

  constructor(config: OAuthConfig) {
    super('Instagram', config);
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(','),
      response_type: 'code',
      state: state,
    });
    return `${this.AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    // This should be called server-side due to client secret
    // For now, return a placeholder structure
    throw new Error('exchangeCodeForToken must be called server-side');
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    // This should be called server-side
    throw new Error('refreshToken must be called server-side');
  }

  async getUserProfile(accessToken: string): Promise<{
    accountId: string;
    accountName: string;
    accountUsername: string;
  }> {
    // This should be called server-side
    throw new Error('getUserProfile must be called server-side');
  }
}

/**
 * Helper function to get OAuth handler for a platform
 */
export function getOAuthHandler(
  platform: Platform,
  config: OAuthConfig
): SocialMediaOAuth {
  switch (platform) {
    case 'Instagram':
      return new InstagramOAuth(config);
    // Add other platforms here
    default:
      throw new Error(`OAuth not implemented for platform: ${platform}`);
  }
}

