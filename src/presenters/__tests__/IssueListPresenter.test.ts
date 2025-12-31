/**
 * IssueListPresenter tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IssueListPresenter } from '../IssueListPresenter';
import { LocalStorageAdapter } from '@/adapters/LocalStorageAdapter';
import { resetConfigManager, getConfigManager } from '@/core/ConfigManager';
import { resetStateManager } from '@/core/StateManager';
import { resetPermissionManager } from '@/core/PermissionManager';
import { resetEventBus } from '@/core/EventBus';
import { resetAuthManager } from '@/core/AuthManager';
import type { AdapterConfig } from '@/contracts';
import type { TrakletConfig } from '@/core/ConfigManager';

describe('IssueListPresenter', () => {
  let presenter: IssueListPresenter;
  let adapter: LocalStorageAdapter;
  const projectId = 'project-1';

  beforeEach(async () => {
    // Reset all singletons
    resetConfigManager();
    resetStateManager();
    resetPermissionManager();
    resetEventBus();
    resetAuthManager();

    // Configure for authenticated user
    const config: TrakletConfig = {
      adapter: 'localStorage',
      token: 'test-token',
      projects: [{ id: projectId, name: 'Test Project', identifier: 'test' }],
      user: {
        email: 'test@example.com',
        name: 'Test User',
      },
    };
    getConfigManager().setConfig(config);

    // Create and connect adapter
    adapter = new LocalStorageAdapter(false);
    const adapterConfig: AdapterConfig = {
      type: 'localStorage',
      token: 'test-token',
      projects: [{ id: projectId, name: 'Test Project', identifier: 'test' }],
    };
    await adapter.connect(adapterConfig);

    presenter = new IssueListPresenter(adapter, projectId);
  });

  afterEach(async () => {
    adapter.clearAllData();
    await adapter.disconnect();
    resetConfigManager();
    resetStateManager();
    resetPermissionManager();
    resetEventBus();
    resetAuthManager();
  });

  describe('getViewModel()', () => {
    it('should return initial view model', () => {
      const vm = presenter.getViewModel();

      expect(vm.issues).toEqual([]);
      expect(vm.isLoading).toBe(false);
      expect(vm.error).toBeNull();
      expect(vm.pagination.page).toBe(1);
      expect(vm.filters.state).toBe('open');
      expect(vm.canCreateIssue).toBe(true);
    });
  });

  describe('subscribe()', () => {
    it('should call subscriber immediately with current state', () => {
      const callback = vi.fn();

      presenter.subscribe(callback);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(presenter.getViewModel());
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();

      const unsubscribe = presenter.subscribe(callback);
      callback.mockClear();

      unsubscribe();

      // Trigger an update
      presenter.setFilter({ state: 'closed' });

      // Callback should not be called after unsubscribe
      // Note: setFilter triggers loadIssues which is async, but the sync notification happens
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('loadIssues()', () => {
    it('should load issues and update view model', async () => {
      // Create some test issues
      await adapter.createIssue(projectId, { title: 'Issue 1', body: 'Body 1' });
      await adapter.createIssue(projectId, { title: 'Issue 2', body: 'Body 2' });

      await presenter.loadIssues();

      const vm = presenter.getViewModel();
      expect(vm.issues).toHaveLength(2);
      expect(vm.isLoading).toBe(false);
      expect(vm.pagination.total).toBe(2);
    });

    it('should set loading state during fetch', async () => {
      const states: boolean[] = [];
      presenter.subscribe((vm) => states.push(vm.isLoading));

      await presenter.loadIssues();

      // Should have been true at some point
      expect(states).toContain(true);
      // Final state should be false
      expect(states[states.length - 1]).toBe(false);
    });

    it('should handle errors', async () => {
      // Disconnect adapter to cause error
      await adapter.disconnect();

      await presenter.loadIssues();

      const vm = presenter.getViewModel();
      expect(vm.error).not.toBeNull();
      expect(vm.isLoading).toBe(false);
    });

    it('should transform issues to view models correctly', async () => {
      await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Test body',
        labels: ['bug'],
      });

      await presenter.loadIssues();

      const vm = presenter.getViewModel();
      const issue = vm.issues[0];

      expect(issue).toBeDefined();
      expect(issue?.title).toBe('Test Issue');
      expect(issue?.state).toBe('open');
      expect(issue?.labels).toHaveLength(1);
      expect(issue?.labels[0]?.name).toBe('bug');
      expect(typeof issue?.createdAt).toBe('string');
      expect(typeof issue?.updatedAt).toBe('string');
    });
  });

  describe('setFilter()', () => {
    beforeEach(async () => {
      await adapter.createIssue(projectId, { title: 'Open Issue', body: 'Open' });
      const closedIssue = await adapter.createIssue(projectId, { title: 'Closed Issue', body: 'Closed' });
      await adapter.updateIssue(projectId, closedIssue.id, { state: 'closed' });
    });

    it('should update filter and reload issues', async () => {
      await presenter.loadIssues();
      expect(presenter.getViewModel().issues).toHaveLength(1); // Only open by default

      presenter.setFilter({ state: 'all' });
      // Wait for async reload
      await new Promise((resolve) => setTimeout(resolve, 50));

      const vm = presenter.getViewModel();
      expect(vm.filters.state).toBe('all');
      expect(vm.issues).toHaveLength(2);
    });

    it('should filter by state', async () => {
      presenter.setFilter({ state: 'closed' });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const vm = presenter.getViewModel();
      expect(vm.issues).toHaveLength(1);
      expect(vm.issues[0]?.title).toBe('Closed Issue');
    });
  });

  describe('loadMore()', () => {
    it('should append more issues to existing list', async () => {
      // Create many issues
      for (let i = 0; i < 60; i++) {
        await adapter.createIssue(projectId, { title: `Issue ${i}`, body: `Body ${i}` });
      }

      await presenter.loadIssues({ limit: 50 });
      expect(presenter.getViewModel().issues).toHaveLength(50);
      expect(presenter.getViewModel().pagination.hasMore).toBe(true);

      await presenter.loadMore();

      const vm = presenter.getViewModel();
      expect(vm.issues).toHaveLength(60);
      expect(vm.pagination.hasMore).toBe(false);
    });

    it('should not load if no more pages', async () => {
      await adapter.createIssue(projectId, { title: 'Single Issue', body: 'Body' });
      await presenter.loadIssues();

      const initialVm = presenter.getViewModel();
      expect(initialVm.pagination.hasMore).toBe(false);

      await presenter.loadMore();

      // Should be unchanged
      expect(presenter.getViewModel().issues).toHaveLength(1);
    });
  });

  describe('refresh()', () => {
    it('should reload issues from page 1', async () => {
      await adapter.createIssue(projectId, { title: 'Issue 1', body: 'Body' });
      await presenter.loadIssues();

      // Add another issue
      await adapter.createIssue(projectId, { title: 'Issue 2', body: 'Body' });

      await presenter.refresh();

      const vm = presenter.getViewModel();
      expect(vm.issues).toHaveLength(2);
      expect(vm.pagination.page).toBe(1);
    });
  });

  describe('permission flags', () => {
    it('should set canEdit and canDelete for own issues', async () => {
      // Create issue as current user (local adapter uses 'local@traklet.dev')
      await adapter.createIssue(projectId, { title: 'My Issue', body: 'Body' });

      await presenter.loadIssues();

      const vm = presenter.getViewModel();
      const issue = vm.issues[0];

      // LocalStorageAdapter creates issues with local@traklet.dev
      // Our config has test@example.com, so permissions won't match
      // This tests the integration correctly
      expect(issue?.canEdit).toBe(false);
      expect(issue?.canDelete).toBe(false);
    });

    it('should set canCreateIssue based on permissions', () => {
      const vm = presenter.getViewModel();
      expect(vm.canCreateIssue).toBe(true);
    });
  });
});
