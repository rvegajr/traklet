/**
 * ConfigManager tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConfigManager,
  getConfigManager,
  resetConfigManager,
} from '../ConfigManager';
import type { TrakletConfig } from '../ConfigManager';

describe('ConfigManager', () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    configManager = new ConfigManager();
  });

  describe('setConfig()', () => {
    it('should accept valid configuration', () => {
      const config = createValidConfig();

      const result = configManager.setConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.config).toEqual(config);
    });

    it('should reject configuration without token or getToken', () => {
      const config: TrakletConfig = {
        adapter: 'github',
        projects: [{ id: 'p1', name: 'Project', identifier: 'owner/repo' }],
      };

      const result = configManager.setConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('token'))).toBe(true);
    });

    it('should accept configuration with getToken instead of token', () => {
      const config: TrakletConfig = {
        adapter: 'github',
        getToken: async () => 'dynamic-token',
        projects: [{ id: 'p1', name: 'Project', identifier: 'owner/repo' }],
      };

      const result = configManager.setConfig(config);

      expect(result.valid).toBe(true);
    });

    it('should reject REST adapter without baseUrl', () => {
      const config: TrakletConfig = {
        adapter: 'rest',
        token: 'test-token',
        projects: [{ id: 'p1', name: 'Project', identifier: 'project-1' }],
      };

      const result = configManager.setConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('baseUrl'))).toBe(true);
    });

    it('should accept REST adapter with baseUrl', () => {
      const config: TrakletConfig = {
        adapter: 'rest',
        token: 'test-token',
        baseUrl: 'https://api.example.com',
        projects: [{ id: 'p1', name: 'Project', identifier: 'project-1' }],
      };

      const result = configManager.setConfig(config);

      expect(result.valid).toBe(true);
    });

    it('should reject empty projects array', () => {
      const config: TrakletConfig = {
        adapter: 'github',
        token: 'test-token',
        projects: [],
      };

      const result = configManager.setConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('project'))).toBe(true);
    });

    it('should reject invalid user email', () => {
      const config: TrakletConfig = {
        adapter: 'github',
        token: 'test-token',
        projects: [{ id: 'p1', name: 'Project', identifier: 'owner/repo' }],
        user: {
          email: 'not-an-email',
          name: 'Test User',
        },
      };

      const result = configManager.setConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('email'))).toBe(true);
    });

    it('should accept valid user configuration', () => {
      const config: TrakletConfig = {
        adapter: 'github',
        token: 'test-token',
        projects: [{ id: 'p1', name: 'Project', identifier: 'owner/repo' }],
        user: {
          email: 'user@example.com',
          name: 'Test User',
          avatar: 'https://example.com/avatar.png',
          username: 'testuser',
        },
      };

      const result = configManager.setConfig(config);

      expect(result.valid).toBe(true);
    });

    it('should validate permission config', () => {
      const config: TrakletConfig = {
        adapter: 'github',
        token: 'test-token',
        projects: [{ id: 'p1', name: 'Project', identifier: 'owner/repo' }],
        permissions: {
          anonymousMode: 'view_create',
        },
      };

      const result = configManager.setConfig(config);

      expect(result.valid).toBe(true);
    });

    it('should validate theme config', () => {
      const config: TrakletConfig = {
        adapter: 'github',
        token: 'test-token',
        projects: [{ id: 'p1', name: 'Project', identifier: 'owner/repo' }],
        theme: {
          preset: 'dark',
          customProperties: {
            '--traklet-primary': '#ff0000',
          },
        },
      };

      const result = configManager.setConfig(config);

      expect(result.valid).toBe(true);
    });
  });

  describe('getConfig()', () => {
    it('should return null before configuration', () => {
      expect(configManager.getConfig()).toBeNull();
    });

    it('should return config after setConfig', () => {
      const config = createValidConfig();
      configManager.setConfig(config);

      expect(configManager.getConfig()).toEqual(config);
    });
  });

  describe('get()', () => {
    it('should return default value when not configured', () => {
      const result = configManager.get('adapter', 'github');
      expect(result).toBe('github');
    });

    it('should return configured value', () => {
      configManager.setConfig(createValidConfig());

      const result = configManager.get('adapter', 'rest');
      expect(result).toBe('github');
    });
  });

  describe('hasUser()', () => {
    it('should return false when user not configured', () => {
      configManager.setConfig(createValidConfig());
      expect(configManager.hasUser()).toBe(false);
    });

    it('should return true when user is configured', () => {
      configManager.setConfig({
        ...createValidConfig(),
        user: { email: 'user@example.com', name: 'User' },
      });
      expect(configManager.hasUser()).toBe(true);
    });
  });

  describe('getUser()', () => {
    it('should return undefined when not configured', () => {
      configManager.setConfig(createValidConfig());
      expect(configManager.getUser()).toBeUndefined();
    });

    it('should return user when configured', () => {
      const user = { email: 'user@example.com', name: 'User' };
      configManager.setConfig({ ...createValidConfig(), user });

      expect(configManager.getUser()).toEqual(user);
    });
  });

  describe('getAnonymousMode()', () => {
    it('should return undefined when not configured', () => {
      configManager.setConfig(createValidConfig());
      expect(configManager.getAnonymousMode()).toBeUndefined();
    });

    it('should return mode when configured', () => {
      configManager.setConfig({
        ...createValidConfig(),
        permissions: { anonymousMode: 'view_create' },
      });

      expect(configManager.getAnonymousMode()).toBe('view_create');
    });
  });

  describe('isOfflineEnabled()', () => {
    it('should default to true', () => {
      configManager.setConfig(createValidConfig());
      expect(configManager.isOfflineEnabled()).toBe(true);
    });

    it('should respect explicit setting', () => {
      configManager.setConfig({ ...createValidConfig(), offlineEnabled: false });
      expect(configManager.isOfflineEnabled()).toBe(false);
    });
  });

  describe('isDebugEnabled()', () => {
    it('should default to false', () => {
      configManager.setConfig(createValidConfig());
      expect(configManager.isDebugEnabled()).toBe(false);
    });

    it('should respect explicit setting', () => {
      configManager.setConfig({ ...createValidConfig(), debug: true });
      expect(configManager.isDebugEnabled()).toBe(true);
    });
  });

  describe('getProjects()', () => {
    it('should return empty array when not configured', () => {
      expect(configManager.getProjects()).toEqual([]);
    });

    it('should return configured projects', () => {
      const config = createValidConfig();
      configManager.setConfig(config);

      expect(configManager.getProjects()).toEqual(config.projects);
    });
  });

  describe('getTheme()', () => {
    it('should return default theme when not configured', () => {
      configManager.setConfig(createValidConfig());

      const theme = configManager.getTheme();
      expect(theme.preset).toBe('auto');
    });

    it('should return configured theme', () => {
      configManager.setConfig({
        ...createValidConfig(),
        theme: { preset: 'dark' },
      });

      const theme = configManager.getTheme();
      expect(theme.preset).toBe('dark');
    });
  });

  describe('getPosition()', () => {
    it('should return default position when not configured', () => {
      configManager.setConfig(createValidConfig());

      const position = configManager.getPosition();
      expect(position.placement).toBe('bottom-right');
    });

    it('should return configured position', () => {
      configManager.setConfig({
        ...createValidConfig(),
        position: { placement: 'top-left', offsetX: 10 },
      });

      const position = configManager.getPosition();
      expect(position.placement).toBe('top-left');
      expect(position.offsetX).toBe(10);
    });
  });

  describe('clear()', () => {
    it('should clear configuration', () => {
      configManager.setConfig(createValidConfig());
      configManager.clear();

      expect(configManager.getConfig()).toBeNull();
    });
  });

  describe('singleton', () => {
    beforeEach(() => {
      resetConfigManager();
    });

    it('should return same instance', () => {
      const manager1 = getConfigManager();
      const manager2 = getConfigManager();
      expect(manager1).toBe(manager2);
    });

    it('should reset instance correctly', () => {
      const manager1 = getConfigManager();
      manager1.setConfig(createValidConfig());

      resetConfigManager();

      const manager2 = getConfigManager();
      expect(manager2.getConfig()).toBeNull();
    });
  });
});

// Test helpers
function createValidConfig(): TrakletConfig {
  return {
    adapter: 'github',
    token: 'test-token',
    projects: [
      {
        id: 'project-1',
        name: 'Test Project',
        identifier: 'owner/repo',
      },
    ],
  };
}
