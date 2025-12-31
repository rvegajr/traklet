/**
 * AuthManager - Token and user identity management
 * Handles authentication token retrieval and caching
 */

import type { TrakletUser } from './ConfigManager';
import { getConfigManager } from './ConfigManager';
import { getEventBus } from './EventBus';

export interface AuthHeaders {
  readonly Authorization?: string | undefined;
  readonly 'Content-Type': string;
}

export interface TokenInfo {
  readonly token: string;
  readonly expiresAt?: Date | undefined;
  readonly scope?: string | undefined;
}

export class AuthManager {
  private cachedToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private tokenRefreshPromise: Promise<string> | null = null;

  /**
   * Get the current authentication token
   * Uses cached value if available and not expired
   */
  async getToken(): Promise<string | undefined> {
    const config = getConfigManager().getConfig();
    if (!config) return undefined;

    // Check if we have a valid cached token
    if (this.cachedToken && !this.isTokenExpired()) {
      return this.cachedToken;
    }

    // If static token is provided, use it
    if (config.token) {
      this.cachedToken = config.token;
      return config.token;
    }

    // If getToken callback is provided, use it
    if (config.getToken) {
      // Prevent concurrent token refresh calls
      if (this.tokenRefreshPromise) {
        return this.tokenRefreshPromise;
      }

      try {
        this.tokenRefreshPromise = config.getToken();
        const token = await this.tokenRefreshPromise;
        this.cachedToken = token;
        return token;
      } catch (error) {
        const eventBus = getEventBus();
        eventBus.emit('connection:error', {
          error: error instanceof Error ? error : new Error('Token retrieval failed'),
          recoverable: true,
        });
        throw error;
      } finally {
        this.tokenRefreshPromise = null;
      }
    }

    return undefined;
  }

  /**
   * Get authentication headers for API requests
   */
  async getAuthHeaders(): Promise<AuthHeaders> {
    const token = await this.getToken();
    const headers: AuthHeaders = {
      'Content-Type': 'application/json',
    };

    if (token) {
      return {
        ...headers,
        Authorization: `Bearer ${token}`,
      };
    }

    return headers;
  }

  /**
   * Get the current user identity
   */
  getCurrentUser(): TrakletUser | undefined {
    return getConfigManager().getUser();
  }

  /**
   * Check if a user is authenticated (has identity configured)
   */
  isAuthenticated(): boolean {
    return getConfigManager().hasUser();
  }

  /**
   * Check if the current session is anonymous
   */
  isAnonymous(): boolean {
    return !this.isAuthenticated();
  }

  /**
   * Set token expiry time for caching
   */
  setTokenExpiry(expiresAt: Date): void {
    this.tokenExpiry = expiresAt;
  }

  /**
   * Clear cached token (force refresh on next request)
   */
  clearTokenCache(): void {
    this.cachedToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Validate token is still valid (makes a test request)
   * Implementation depends on the adapter
   */
  async validateToken(
    validator: (token: string) => Promise<boolean>
  ): Promise<boolean> {
    const token = await this.getToken();
    if (!token) return false;

    try {
      return await validator(token);
    } catch {
      return false;
    }
  }

  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) return false;
    // Add 30 second buffer before expiry
    const bufferMs = 30 * 1000;
    return new Date().getTime() > this.tokenExpiry.getTime() - bufferMs;
  }
}

// Singleton
let globalAuthManager: AuthManager | null = null;

export function getAuthManager(): AuthManager {
  if (!globalAuthManager) {
    globalAuthManager = new AuthManager();
  }
  return globalAuthManager;
}

export function resetAuthManager(): void {
  if (globalAuthManager) {
    globalAuthManager.clearTokenCache();
  }
  globalAuthManager = null;
}
