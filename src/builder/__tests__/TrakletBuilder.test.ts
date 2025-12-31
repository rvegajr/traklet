/**
 * TrakletBuilder tests
 * Comprehensive tests for the wizard-driven configuration builder
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrakletBuilder, validateConfig } from '../TrakletBuilder';

describe('TrakletBuilder', () => {
  describe('create', () => {
    it('should create a new builder instance', () => {
      const builder = TrakletBuilder.create();
      expect(builder).toBeInstanceOf(TrakletBuilder);
    });
  });

  describe('adapter selection', () => {
    it('should configure localStorage adapter', () => {
      const builder = TrakletBuilder.create().useLocalStorage().addProject('test', 'Test');

      const config = builder.getConfig();
      expect(config.adapter).toBe('localStorage');
    });

    it('should configure GitHub adapter with token', () => {
      const builder = TrakletBuilder.create()
        .useGitHub({ token: 'ghp_test_token' })
        .addProject('owner/repo', 'Test');

      const config = builder.getConfig();
      expect(config.adapter).toBe('github');
      expect(config.token).toBe('ghp_test_token');
    });

    it('should configure GitHub adapter with getToken function', () => {
      const getToken = vi.fn().mockResolvedValue('dynamic_token');
      const builder = TrakletBuilder.create().useGitHub({ getToken }).addProject('owner/repo', 'Test');

      const config = builder.getConfig();
      expect(config.adapter).toBe('github');
      expect(config.getToken).toBe(getToken);
    });

    it('should configure Azure DevOps adapter', () => {
      const builder = TrakletBuilder.create()
        .useAzureDevOps({ organization: 'my-org', token: 'pat_token' })
        .addProject('my-project', 'Test');

      const config = builder.getConfig();
      expect(config.adapter).toBe('azure-devops');
      expect(config.baseUrl).toBe('https://dev.azure.com/my-org');
      expect(config.token).toBe('pat_token');
    });

    it('should configure REST adapter', () => {
      const builder = TrakletBuilder.create()
        .useRest({ baseUrl: 'https://api.example.com', token: 'bearer_token' })
        .addProject('project-1', 'Test');

      const config = builder.getConfig();
      expect(config.adapter).toBe('rest');
      expect(config.baseUrl).toBe('https://api.example.com');
      expect(config.token).toBe('bearer_token');
    });
  });

  describe('project configuration', () => {
    it('should add a single project', () => {
      const builder = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('my-project', 'My Project', 'Description');

      const config = builder.getConfig();
      expect(config.projects).toHaveLength(1);
      expect(config.projects[0]).toEqual({
        id: 'my-project',
        name: 'My Project',
        description: 'Description',
      });
    });

    it('should add multiple projects', () => {
      const builder = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('project-1', 'Project 1')
        .addProject('project-2', 'Project 2');

      const config = builder.getConfig();
      expect(config.projects).toHaveLength(2);
    });

    it('should add projects in bulk', () => {
      const projects = [
        { id: 'p1', name: 'Project 1' },
        { id: 'p2', name: 'Project 2' },
        { id: 'p3', name: 'Project 3' },
      ];

      const builder = TrakletBuilder.create().useLocalStorage().addProjects(projects);

      const config = builder.getConfig();
      expect(config.projects).toHaveLength(3);
    });
  });

  describe('user and permissions', () => {
    it('should configure user', () => {
      const builder = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test')
        .withUser({
          id: 'user-123',
          email: 'user@example.com',
          displayName: 'John Doe',
        });

      const config = builder.getConfig();
      expect(config.user?.email).toBe('user@example.com');
      expect(config.user?.displayName).toBe('John Doe');
      expect(config.user?.id).toBe('user-123');
    });

    it('should configure permissions for create', () => {
      const builder = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test')
        .withPermissions({
          canCreate: true,
        });

      const config = builder.getConfig();
      expect(config.permissions?.anonymousMode).toBe('view_create');
    });

    it('should configure permissions for view only', () => {
      const builder = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test')
        .withPermissions({
          canCreate: false,
        });

      const config = builder.getConfig();
      expect(config.permissions?.anonymousMode).toBe('view_only');
    });

    it('should configure anonymous mode with create permission', () => {
      const builder = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test')
        .anonymousMode(true);

      const config = builder.getConfig();
      expect(config.permissions?.anonymousMode).toBe('view_create');
    });

    it('should configure anonymous mode without create permission', () => {
      const builder = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test')
        .anonymousMode(false);

      const config = builder.getConfig();
      expect(config.permissions?.anonymousMode).toBe('view_only');
    });
  });

  describe('UI customization', () => {
    it('should configure position', () => {
      const builder = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test')
        .atPosition('top-left');

      const config = builder.getConfig();
      expect(config.position).toBe('top-left');
    });

    it('should configure custom theme', () => {
      const builder = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test')
        .withTheme({
          primary: '#6366f1',
          bg: '#ffffff',
        });

      const config = builder.getConfig();
      expect(config.theme?.customProperties?.['--traklet-primary']).toBe('#6366f1');
      expect(config.theme?.customProperties?.['--traklet-bg']).toBe('#ffffff');
    });

    it('should apply dark theme preset', () => {
      const builder = TrakletBuilder.create().useLocalStorage().addProject('test', 'Test').darkTheme();

      const config = builder.getConfig();
      expect(config.theme?.preset).toBe('dark');
    });
  });

  describe('offline configuration', () => {
    it('should enable offline support with defaults', () => {
      const builder = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test')
        .withOfflineSupport();

      const config = builder.getConfig();
      expect(config.offlineEnabled).toBe(true);
    });

    it('should configure custom offline options', () => {
      const builder = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test')
        .withOfflineSupport({
          enabled: true,
        });

      const config = builder.getConfig();
      expect(config.offlineEnabled).toBe(true);
    });

    it('should disable offline support', () => {
      const builder = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test')
        .disableOffline();

      const config = builder.getConfig();
      expect(config.offlineEnabled).toBe(false);
    });
  });

  describe('validation', () => {
    it('should fail validation without adapter', () => {
      const builder = TrakletBuilder.create().addProject('test', 'Test');

      const result = builder.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'No adapter selected. Use useLocalStorage(), useGitHub(), useAzureDevOps(), or useRest().'
      );
    });

    it('should fail validation without projects', () => {
      const builder = TrakletBuilder.create().useLocalStorage();

      const result = builder.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'No projects configured. Use addProject() to add at least one project.'
      );
    });

    it('should fail validation with empty project ID', () => {
      const builder = TrakletBuilder.create().useLocalStorage().addProject('', 'Test');

      const result = builder.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Project ID is required'))).toBe(true);
    });

    it('should fail validation with empty project name', () => {
      const builder = TrakletBuilder.create().useLocalStorage().addProject('test', '');

      const result = builder.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Project name is required'))).toBe(true);
    });

    it('should warn about missing authentication for remote adapters', () => {
      const builder = TrakletBuilder.create().useGitHub({}).addProject('owner/repo', 'Test');

      const result = builder.validate();
      expect(result.warnings).toContain(
        'github adapter requires authentication. Set token or getToken.'
      );
    });

    it('should not warn about authentication for localStorage', () => {
      const builder = TrakletBuilder.create().useLocalStorage().addProject('test', 'Test');

      const result = builder.validate();
      expect(result.warnings).toHaveLength(0);
    });

    it('should pass validation with valid configuration', () => {
      const builder = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test')
        .withUser({ id: 'user-1', email: 'test@example.com' })
        .atPosition('bottom-right');

      const result = builder.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation with invalid email', () => {
      const builder = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test')
        .withUser({ id: 'user-1', email: 'invalid-email' });

      const result = builder.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid email'))).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return valid configuration', () => {
      const config = TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test Project')
        .getConfig();

      expect(config.adapter).toBe('localStorage');
      expect(config.projects).toHaveLength(1);
      expect(config.projects[0].id).toBe('test');
    });

    it('should throw on invalid configuration', () => {
      expect(() => {
        TrakletBuilder.create().getConfig();
      }).toThrow('Invalid configuration');
    });
  });

  describe('build', () => {
    it('should build instance with localStorage adapter', async () => {
      const instance = await TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test Project')
        .build();

      expect(instance).toBeDefined();
      expect(instance.getProjects()).toHaveLength(1);

      instance.destroy();
    });

    it('should throw on invalid configuration during build', async () => {
      await expect(TrakletBuilder.create().build()).rejects.toThrow('Invalid configuration');
    });
  });

  describe('buildWithOptions', () => {
    it('should return validation errors without throwing', async () => {
      const result = await TrakletBuilder.create().buildWithOptions();

      expect(result.validation.valid).toBe(false);
      expect(result.instance).toBeUndefined();
    });

    it('should perform dry run without initializing', async () => {
      const result = await TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test')
        .buildWithOptions({ dryRun: true });

      expect(result.validation.valid).toBe(true);
      expect(result.config.adapter).toBe('localStorage');
      expect(result.instance).toBeUndefined();
    });

    it('should initialize when not dry run', async () => {
      const result = await TrakletBuilder.create()
        .useLocalStorage()
        .addProject('test', 'Test')
        .buildWithOptions({ dryRun: false });

      expect(result.validation.valid).toBe(true);
      expect(result.instance).toBeDefined();

      result.instance?.destroy();
    });
  });

  describe('fluent API chaining', () => {
    it('should support full chain of configuration', async () => {
      const instance = await TrakletBuilder.create()
        .useLocalStorage()
        .addProject('project-1', 'Project One')
        .addProject('project-2', 'Project Two')
        .withUser({
          id: 'user-123',
          email: 'user@example.com',
          displayName: 'Test User',
        })
        .withPermissions({
          canCreate: true,
        })
        .atPosition('bottom-left')
        .withTheme({ primary: '#4f46e5' })
        .withOfflineSupport()
        .build();

      expect(instance.getProjects()).toHaveLength(2);

      instance.destroy();
    });
  });
});

describe('validateConfig', () => {
  it('should validate valid configuration', () => {
    const result = validateConfig({
      adapter: 'localStorage',
      projects: [{ id: 'test', name: 'Test' }],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid adapter type', () => {
    const result = validateConfig({
      adapter: 'invalid-adapter',
      projects: [{ id: 'test', name: 'Test' }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('adapter'))).toBe(true);
  });

  it('should reject empty projects array', () => {
    const result = validateConfig({
      adapter: 'localStorage',
      projects: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('At least one project is required'))).toBe(true);
  });

  it('should warn about missing authentication', () => {
    const result = validateConfig({
      adapter: 'github',
      projects: [{ id: 'owner/repo', name: 'Test' }],
    });

    expect(result.warnings.some((w) => w.includes('requires authentication'))).toBe(true);
  });

  it('should validate nested user object', () => {
    const result = validateConfig({
      adapter: 'localStorage',
      projects: [{ id: 'test', name: 'Test' }],
      user: { id: '', email: 'invalid' },
    });

    expect(result.valid).toBe(false);
  });

  it('should accept valid position values', () => {
    const result = validateConfig({
      adapter: 'localStorage',
      projects: [{ id: 'test', name: 'Test' }],
      position: 'top-right',
    });

    expect(result.valid).toBe(true);
  });

  it('should reject invalid position values', () => {
    const result = validateConfig({
      adapter: 'localStorage',
      projects: [{ id: 'test', name: 'Test' }],
      position: 'center',
    });

    expect(result.valid).toBe(false);
  });
});
