/**
 * AuthManager tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthManager, getAuthManager, resetAuthManager } from '../AuthManager';
import { getConfigManager, resetConfigManager } from '../ConfigManager';
import { resetEventBus } from '../EventBus';
import type { TrakletConfig } from '../ConfigManager';

describe('AuthManager', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    resetConfigManager();
    resetEventBus();
    resetAuthManager();
    authManager = new AuthManager();
  });

  afterEach(() => {
    resetConfigManager();
    resetEventBus();
    resetAuthManager();
  });

  describe('getToken()', () => {
    it('should return undefined when not configured', async () => {
      const token = await authManager.getToken();
      expect(token).toBeUndefined();
    });

    it('should return static token from config', async () => {
      configureWithToken('static-token');

      const token = await authManager.getToken();
      expect(token).toBe('static-token');
    });

    it('should call getToken callback when provided', async () => {
      const getTokenFn = vi.fn().mockResolvedValue('dynamic-token');
      configureWithGetToken(getTokenFn);

      const token = await authManager.getToken();

      expect(token).toBe('dynamic-token');
      expect(getTokenFn).toHaveBeenCalledOnce();
    });

    it('should cache token from callback', async () => {
      const getTokenFn = vi.fn().mockResolvedValue('dynamic-token');
      configureWithGetToken(getTokenFn);

      await authManager.getToken();
      await authManager.getToken();
      await authManager.getToken();

      expect(getTokenFn).toHaveBeenCalledOnce();
    });

    it('should prefer static token over getToken', async () => {
      const config: TrakletConfig = {
        adapter: 'github',
        token: 'static-token',
        getToken: vi.fn().mockResolvedValue('dynamic-token'),
        projects: [{ id: 'p1', name: 'Project', identifier: 'owner/repo' }],
      };
      getConfigManager().setConfig(config);

      const token = await authManager.getToken();
      expect(token).toBe('static-token');
    });

    it('should handle concurrent getToken calls', async () => {
      let resolveToken: (value: string) => void;
      const tokenPromise = new Promise<string>((resolve) => {
        resolveToken = resolve;
      });
      const getTokenFn = vi.fn().mockReturnValue(tokenPromise);
      configureWithGetToken(getTokenFn);

      // Start multiple concurrent calls
      const promise1 = authManager.getToken();
      const promise2 = authManager.getToken();
      const promise3 = authManager.getToken();

      // Resolve the token
      resolveToken!('shared-token');

      const [token1, token2, token3] = await Promise.all([promise1, promise2, promise3]);

      expect(token1).toBe('shared-token');
      expect(token2).toBe('shared-token');
      expect(token3).toBe('shared-token');
      expect(getTokenFn).toHaveBeenCalledOnce();
    });
  });

  describe('getAuthHeaders()', () => {
    it('should return headers without Authorization when no token', async () => {
      const headers = await authManager.getAuthHeaders();

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Authorization).toBeUndefined();
    });

    it('should return headers with Bearer token', async () => {
      configureWithToken('test-token');

      const headers = await authManager.getAuthHeaders();

      expect(headers.Authorization).toBe('Bearer test-token');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('getCurrentUser()', () => {
    it('should return undefined when no user configured', () => {
      configureWithToken('test-token');

      expect(authManager.getCurrentUser()).toBeUndefined();
    });

    it('should return user from config', () => {
      const config: TrakletConfig = {
        adapter: 'github',
        token: 'test-token',
        projects: [{ id: 'p1', name: 'Project', identifier: 'owner/repo' }],
        user: {
          email: 'user@example.com',
          name: 'Test User',
        },
      };
      getConfigManager().setConfig(config);

      const user = authManager.getCurrentUser();

      expect(user?.email).toBe('user@example.com');
      expect(user?.name).toBe('Test User');
    });
  });

  describe('isAuthenticated() / isAnonymous()', () => {
    it('should be anonymous when no user configured', () => {
      configureWithToken('test-token');

      expect(authManager.isAuthenticated()).toBe(false);
      expect(authManager.isAnonymous()).toBe(true);
    });

    it('should be authenticated when user configured', () => {
      const config: TrakletConfig = {
        adapter: 'github',
        token: 'test-token',
        projects: [{ id: 'p1', name: 'Project', identifier: 'owner/repo' }],
        user: {
          email: 'user@example.com',
          name: 'Test User',
        },
      };
      getConfigManager().setConfig(config);

      expect(authManager.isAuthenticated()).toBe(true);
      expect(authManager.isAnonymous()).toBe(false);
    });
  });

  describe('clearTokenCache()', () => {
    it('should clear cached token and force refresh', async () => {
      let callCount = 0;
      const getTokenFn = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(`token-${callCount}`);
      });
      configureWithGetToken(getTokenFn);

      const token1 = await authManager.getToken();
      expect(token1).toBe('token-1');

      authManager.clearTokenCache();

      const token2 = await authManager.getToken();
      expect(token2).toBe('token-2');
      expect(getTokenFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('setTokenExpiry()', () => {
    it('should refresh token after expiry', async () => {
      let callCount = 0;
      const getTokenFn = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(`token-${callCount}`);
      });
      configureWithGetToken(getTokenFn);

      await authManager.getToken(); // token-1

      // Set expiry in the past
      authManager.setTokenExpiry(new Date(Date.now() - 60000));

      const token2 = await authManager.getToken();
      expect(token2).toBe('token-2');
    });

    it('should not refresh if token not expired', async () => {
      let callCount = 0;
      const getTokenFn = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(`token-${callCount}`);
      });
      configureWithGetToken(getTokenFn);

      await authManager.getToken();

      // Set expiry in the future
      authManager.setTokenExpiry(new Date(Date.now() + 3600000));

      const token2 = await authManager.getToken();
      expect(token2).toBe('token-1');
      expect(getTokenFn).toHaveBeenCalledOnce();
    });
  });

  describe('validateToken()', () => {
    it('should return false when no token', async () => {
      const validator = vi.fn().mockResolvedValue(true);

      const result = await authManager.validateToken(validator);

      expect(result).toBe(false);
      expect(validator).not.toHaveBeenCalled();
    });

    it('should call validator with token', async () => {
      configureWithToken('test-token');
      const validator = vi.fn().mockResolvedValue(true);

      const result = await authManager.validateToken(validator);

      expect(result).toBe(true);
      expect(validator).toHaveBeenCalledWith('test-token');
    });

    it('should return false when validator throws', async () => {
      configureWithToken('test-token');
      const validator = vi.fn().mockRejectedValue(new Error('Invalid'));

      const result = await authManager.validateToken(validator);

      expect(result).toBe(false);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const manager1 = getAuthManager();
      const manager2 = getAuthManager();
      expect(manager1).toBe(manager2);
    });

    it('should reset correctly', () => {
      const manager1 = getAuthManager();
      resetAuthManager();
      const manager2 = getAuthManager();
      expect(manager1).not.toBe(manager2);
    });
  });
});

// Test helpers
function configureWithToken(token: string): void {
  const config: TrakletConfig = {
    adapter: 'github',
    token,
    projects: [{ id: 'p1', name: 'Project', identifier: 'owner/repo' }],
  };
  getConfigManager().setConfig(config);
}

function configureWithGetToken(getToken: () => Promise<string>): void {
  const config: TrakletConfig = {
    adapter: 'github',
    getToken,
    projects: [{ id: 'p1', name: 'Project', identifier: 'owner/repo' }],
  };
  getConfigManager().setConfig(config);
}
