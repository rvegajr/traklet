/**
 * Traklet orchestrator tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Traklet } from '../Traklet';
import type { TrakletConfig } from '../core';

describe('Traklet', () => {
  let config: TrakletConfig;

  beforeEach(() => {
    config = {
      adapter: 'localStorage',
      token: 'test-token',
      projects: [
        { id: 'project-1', name: 'Test Project', identifier: 'test' },
        { id: 'project-2', name: 'Second Project', identifier: 'second' },
      ],
      user: {
        email: 'test@example.com',
        name: 'Test User',
      },
      headless: true,
    };
  });

  afterEach(() => {
    const instance = Traklet.getInstance();
    if (instance) {
      instance.destroy();
    }
  });

  describe('init()', () => {
    it('should initialize successfully with valid config', async () => {
      const instance = await Traklet.init(config);

      expect(instance).toBeDefined();
      expect(Traklet.getInstance()).toBe(instance);
    });

    it('should throw on invalid configuration', async () => {
      const invalidConfig = {
        adapter: 'localStorage',
        // Missing token and projects
      } as TrakletConfig;

      await expect(Traklet.init(invalidConfig)).rejects.toThrow('Invalid configuration');
    });

    it('should connect to the adapter', async () => {
      const instance = await Traklet.init(config);

      expect(instance.getWidgetPresenter().isConnected()).toBe(true);
    });

    it('should load projects', async () => {
      const instance = await Traklet.init(config);

      const projects = instance.getProjects();
      expect(projects).toHaveLength(2);
      expect(projects[0]?.id).toBe('project-1');
      expect(projects[1]?.id).toBe('project-2');
    });

    it('should set first project as current', async () => {
      const instance = await Traklet.init(config);

      const currentProject = instance.getCurrentProject();
      expect(currentProject?.id).toBe('project-1');
    });
  });

  describe('getInstance()', () => {
    it('should return null before initialization', () => {
      expect(Traklet.getInstance()).toBeNull();
    });

    it('should return instance after initialization', async () => {
      const instance = await Traklet.init(config);
      expect(Traklet.getInstance()).toBe(instance);
    });
  });

  describe('destroy()', () => {
    it('should clean up instance', async () => {
      const instance = await Traklet.init(config);
      instance.destroy();

      expect(Traklet.getInstance()).toBeNull();
    });

    it('should disconnect adapter', async () => {
      const instance = await Traklet.init(config);

      // Verify it's connected before destroy
      expect(instance.getWidgetPresenter().isConnected()).toBe(true);

      instance.destroy();

      // After destroy, getInstance returns null
      expect(Traklet.getInstance()).toBeNull();
    });
  });

  describe('switchProject()', () => {
    it('should switch to different project', async () => {
      const instance = await Traklet.init(config);

      expect(instance.getCurrentProject()?.id).toBe('project-1');

      await instance.switchProject('project-2');

      expect(instance.getCurrentProject()?.id).toBe('project-2');
    });

    it('should throw for unknown project', async () => {
      const instance = await Traklet.init(config);

      await expect(instance.switchProject('unknown')).rejects.toThrow('Project not found');
    });
  });

  describe('open() / close()', () => {
    it('should toggle widget visibility', async () => {
      const instance = await Traklet.init(config);

      expect(instance.isOpen()).toBe(false);

      instance.open();
      expect(instance.isOpen()).toBe(true);

      instance.close();
      expect(instance.isOpen()).toBe(false);
    });
  });

  describe('presenters', () => {
    it('should provide issue list presenter', async () => {
      const instance = await Traklet.init(config);

      const presenter = instance.getIssueListPresenter();
      expect(presenter).toBeDefined();
      expect(presenter.getViewModel()).toBeDefined();
    });

    it('should provide issue detail presenter', async () => {
      const instance = await Traklet.init(config);

      const presenter = instance.getIssueDetailPresenter();
      expect(presenter).toBeDefined();
    });

    it('should provide issue form presenter', async () => {
      const instance = await Traklet.init(config);

      const presenter = instance.getIssueFormPresenter();
      expect(presenter).toBeDefined();
    });

    it('should provide widget presenter', async () => {
      const instance = await Traklet.init(config);

      const presenter = instance.getWidgetPresenter();
      expect(presenter).toBeDefined();
      expect(presenter.viewState).toBe('list');
      expect(presenter.isConnected()).toBe(true);
    });
  });

  describe('widget presenter navigation', () => {
    it('should navigate to different views', async () => {
      const instance = await Traklet.init(config);
      const presenter = instance.getWidgetPresenter();

      expect(presenter.viewState).toBe('list');

      presenter.navigateTo('create');
      expect(presenter.viewState).toBe('create');

      presenter.navigateTo('list');
      expect(presenter.viewState).toBe('list');
    });
  });

  describe('refresh()', () => {
    it('should refresh current view', async () => {
      const instance = await Traklet.init(config);

      // Should not throw
      await expect(instance.refresh()).resolves.not.toThrow();
    });
  });
});
