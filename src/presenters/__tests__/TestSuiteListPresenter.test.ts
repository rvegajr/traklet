/**
 * TestSuiteListPresenter tests
 * TDD: RED phase - these tests define the expected behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestSuiteListPresenter } from '../TestSuiteListPresenter';
import { LocalStorageAdapter } from '@/adapters/LocalStorageAdapter';
import { resetConfigManager, getConfigManager } from '@/core/ConfigManager';
import { resetStateManager } from '@/core/StateManager';
import { resetPermissionManager } from '@/core/PermissionManager';
import { resetEventBus } from '@/core/EventBus';
import { resetAuthManager } from '@/core/AuthManager';
import { resetSuiteManager, getSuiteManager } from '@/core/SuiteManager';
import { resetDependencyResolver, getDependencyResolver } from '@/core/DependencyResolver';
import { resetTestRunManager, getTestRunManager } from '@/core/TestRunManager';
import type { AdapterConfig } from '@/contracts';
import type { TrakletConfig } from '@/core/ConfigManager';
import type { SuiteInfo } from '@/core/SuiteManager';
import type { TestSuiteListViewModel } from '../IPresenter';

describe('TestSuiteListPresenter', () => {
  let presenter: TestSuiteListPresenter;
  let adapter: LocalStorageAdapter;
  const projectId = 'project-1';

  beforeEach(async () => {
    // Reset all singletons
    resetConfigManager();
    resetStateManager();
    resetPermissionManager();
    resetEventBus();
    resetAuthManager();
    resetSuiteManager();
    resetDependencyResolver();
    resetTestRunManager();

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

    presenter = new TestSuiteListPresenter(adapter, projectId);
  });

  afterEach(async () => {
    adapter.clearAllData();
    await adapter.disconnect();
    resetConfigManager();
    resetStateManager();
    resetPermissionManager();
    resetEventBus();
    resetAuthManager();
    resetSuiteManager();
    resetDependencyResolver();
    resetTestRunManager();
  });

  describe('getSuiteViewModel()', () => {
    it('should return initial view model with empty suites', () => {
      const vm = presenter.getSuiteViewModel();

      expect(vm.suites).toEqual([]);
      expect(vm.isLoading).toBe(false);
      expect(vm.error).toBeNull();
      expect(vm.viewMode).toBe('grouped');
    });
  });

  describe('subscribeSuites()', () => {
    it('should call subscriber immediately with current state', () => {
      const callback = vi.fn();

      presenter.subscribeSuites(callback);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(presenter.getSuiteViewModel());
    });

    it('should return unsubscribe function that stops notifications', () => {
      const callback = vi.fn();

      const unsubscribe = presenter.subscribeSuites(callback);
      callback.mockClear();

      unsubscribe();

      // Trigger a change
      presenter.setViewMode('flat');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should notify multiple subscribers', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      presenter.subscribeSuites(callback1);
      presenter.subscribeSuites(callback2);
      callback1.mockClear();
      callback2.mockClear();

      presenter.setViewMode('flat');

      expect(callback1).toHaveBeenCalledOnce();
      expect(callback2).toHaveBeenCalledOnce();
    });
  });

  describe('loadSuites()', () => {
    it('should discover suites and create collapsed SuiteViewModels', async () => {
      // Mock the SuiteManager to return known suites
      const suiteManager = getSuiteManager();
      const mockSuites: SuiteInfo[] = [
        { suiteId: 'auth', displayName: 'Authentication', order: 0, issueCount: 3 },
        { suiteId: 'dashboard', displayName: 'Dashboard', order: 2, issueCount: 5 },
      ];
      vi.spyOn(suiteManager, 'discoverSuites').mockResolvedValue(mockSuites);

      await presenter.loadSuites();

      const vm = presenter.getSuiteViewModel();
      expect(vm.suites).toHaveLength(2);
      expect(vm.isLoading).toBe(false);
      expect(vm.error).toBeNull();

      // First suite
      expect(vm.suites[0]!.suiteId).toBe('auth');
      expect(vm.suites[0]!.displayName).toBe('Authentication');
      expect(vm.suites[0]!.order).toBe(0);
      expect(vm.suites[0]!.issueCount).toBe(3);
      expect(vm.suites[0]!.isExpanded).toBe(false);
      expect(vm.suites[0]!.isLoading).toBe(false);
      expect(vm.suites[0]!.issues).toEqual([]);

      // Second suite
      expect(vm.suites[1]!.suiteId).toBe('dashboard');
      expect(vm.suites[1]!.displayName).toBe('Dashboard');
      expect(vm.suites[1]!.order).toBe(2);
      expect(vm.suites[1]!.issueCount).toBe(5);
    });

    it('should notify subscribers during loading', async () => {
      const suiteManager = getSuiteManager();
      vi.spyOn(suiteManager, 'discoverSuites').mockResolvedValue([]);

      const states: boolean[] = [];
      presenter.subscribeSuites((vm) => states.push(vm.isLoading));

      await presenter.loadSuites();

      // Should have been true during loading, then false
      expect(states).toContain(true);
      expect(states[states.length - 1]).toBe(false);
    });

    it('should handle errors during suite discovery', async () => {
      const suiteManager = getSuiteManager();
      vi.spyOn(suiteManager, 'discoverSuites').mockRejectedValue(
        new Error('Discovery failed')
      );

      await presenter.loadSuites();

      const vm = presenter.getSuiteViewModel();
      expect(vm.error).toBe('Discovery failed');
      expect(vm.isLoading).toBe(false);
      expect(vm.suites).toEqual([]);
    });

    it('should create suite summaries with zero counts when collapsed', async () => {
      const suiteManager = getSuiteManager();
      vi.spyOn(suiteManager, 'discoverSuites').mockResolvedValue([
        { suiteId: 'auth', displayName: 'Authentication', order: 0, issueCount: 2 },
      ]);

      await presenter.loadSuites();

      const suite = presenter.getSuiteViewModel().suites[0]!;
      expect(suite.summary).toEqual({
        passed: 0,
        failed: 0,
        blocked: 0,
        notTested: 0,
      });
    });
  });

  describe('expandSuite()', () => {
    beforeEach(async () => {
      // Set up suites
      const suiteManager = getSuiteManager();
      vi.spyOn(suiteManager, 'discoverSuites').mockResolvedValue([
        { suiteId: 'auth', displayName: 'Authentication', order: 0, issueCount: 2 },
        { suiteId: 'dashboard', displayName: 'Dashboard', order: 2, issueCount: 1 },
      ]);
      await presenter.loadSuites();
    });

    it('should load issues and set isExpanded=true', async () => {
      // Create test issues that match the suite label
      await adapter.createIssue(projectId, {
        title: 'TC-001: Login test',
        body: 'Test body',
        labels: ['suite:auth', 'test-case'],
      });
      await adapter.createIssue(projectId, {
        title: 'TC-002: Logout test',
        body: 'Test body',
        labels: ['suite:auth', 'test-case'],
      });

      // Need to add suite labels to the adapter. Since LocalStorageAdapter has
      // no createLabel, we spy on getIssues to return what we need.
      const originalGetIssues = adapter.getIssues.bind(adapter);
      vi.spyOn(adapter, 'getIssues').mockImplementation(async (pid, query) => {
        // For suite expansion queries, filter by the labels
        if (
          query?.labels?.includes('suite:auth') &&
          query?.labels?.includes('test-case')
        ) {
          // Get all issues and filter manually
          const all = await originalGetIssues(pid, { limit: 100 });
          const filtered = all.items.filter((issue) =>
            issue.title.startsWith('TC-')
          );
          return {
            items: filtered,
            total: filtered.length,
            page: 1,
            limit: 100,
            hasMore: false,
          };
        }
        return originalGetIssues(pid, query);
      });

      await presenter.expandSuite('auth');

      const vm = presenter.getSuiteViewModel();
      const authSuite = vm.suites.find((s) => s.suiteId === 'auth')!;

      expect(authSuite.isExpanded).toBe(true);
      expect(authSuite.isLoading).toBe(false);
      expect(authSuite.issues).toHaveLength(2);
    });

    it('should map issues to TestCaseListItemViewModels with correct fields', async () => {
      await adapter.createIssue(projectId, {
        title: 'TC-001: Login test',
        body: 'Test body with no prerequisites',
        labels: ['suite:auth', 'test-case'],
      });

      const originalGetIssues = adapter.getIssues.bind(adapter);
      vi.spyOn(adapter, 'getIssues').mockImplementation(async (pid, query) => {
        if (
          query?.labels?.includes('suite:auth') &&
          query?.labels?.includes('test-case')
        ) {
          const all = await originalGetIssues(pid, { limit: 100 });
          const filtered = all.items.filter((issue) =>
            issue.title.startsWith('TC-')
          );
          return {
            items: filtered,
            total: filtered.length,
            page: 1,
            limit: 100,
            hasMore: false,
          };
        }
        return originalGetIssues(pid, query);
      });

      await presenter.expandSuite('auth');

      const authSuite = presenter
        .getSuiteViewModel()
        .suites.find((s) => s.suiteId === 'auth')!;
      const tc = authSuite.issues[0]!;

      expect(tc.testCaseId).toBe('TC-001');
      expect(tc.title).toBe('TC-001: Login test');
      expect(tc.testStatus).toBe('not-tested');
      expect(tc.isBlocked).toBe(false);
      expect(tc.blockedBy).toEqual([]);
      expect(tc.prerequisiteIds).toEqual([]);
      expect(tc.state).toBe('open');
      expect(typeof tc.createdAt).toBe('string');
      expect(typeof tc.updatedAt).toBe('string');
    });

    it('should extract prerequisiteIds from issue body', async () => {
      const body = [
        'Some test description',
        '{traklet:section:prerequisites}',
        'Depends on (TC-001) and (TC-002)',
        '{/traklet:section:prerequisites}',
      ].join('\n');

      await adapter.createIssue(projectId, {
        title: 'TC-003: Dashboard access',
        body,
        labels: ['suite:auth', 'test-case'],
      });

      const originalGetIssues = adapter.getIssues.bind(adapter);
      vi.spyOn(adapter, 'getIssues').mockImplementation(async (pid, query) => {
        if (
          query?.labels?.includes('suite:auth') &&
          query?.labels?.includes('test-case')
        ) {
          const all = await originalGetIssues(pid, { limit: 100 });
          const filtered = all.items.filter((issue) =>
            issue.title.startsWith('TC-')
          );
          return {
            items: filtered,
            total: filtered.length,
            page: 1,
            limit: 100,
            hasMore: false,
          };
        }
        return originalGetIssues(pid, query);
      });

      await presenter.expandSuite('auth');

      const authSuite = presenter
        .getSuiteViewModel()
        .suites.find((s) => s.suiteId === 'auth')!;
      const tc = authSuite.issues[0]!;

      expect(tc.prerequisiteIds).toContain('TC-001');
      expect(tc.prerequisiteIds).toContain('TC-002');
      expect(tc.prerequisiteIds).toHaveLength(2);
    });

    it('should set isLoading=true on the suite during expansion', async () => {
      const suiteLoadingStates: boolean[] = [];
      presenter.subscribeSuites((vm) => {
        const authSuite = vm.suites.find((s) => s.suiteId === 'auth');
        if (authSuite) {
          suiteLoadingStates.push(authSuite.isLoading);
        }
      });

      vi.spyOn(adapter, 'getIssues').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 100,
        hasMore: false,
      });

      await presenter.expandSuite('auth');

      // Should have been true then false
      expect(suiteLoadingStates).toContain(true);
      expect(suiteLoadingStates[suiteLoadingStates.length - 1]).toBe(false);
    });
  });

  describe('toggleSuite()', () => {
    beforeEach(async () => {
      const suiteManager = getSuiteManager();
      vi.spyOn(suiteManager, 'discoverSuites').mockResolvedValue([
        { suiteId: 'auth', displayName: 'Authentication', order: 0, issueCount: 2 },
      ]);
      await presenter.loadSuites();
    });

    it('should collapse an expanded suite', async () => {
      // First expand
      vi.spyOn(adapter, 'getIssues').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 100,
        hasMore: false,
      });

      await presenter.expandSuite('auth');
      expect(
        presenter.getSuiteViewModel().suites.find((s) => s.suiteId === 'auth')!
          .isExpanded
      ).toBe(true);

      // Now toggle to collapse
      presenter.toggleSuite('auth');

      expect(
        presenter.getSuiteViewModel().suites.find((s) => s.suiteId === 'auth')!
          .isExpanded
      ).toBe(false);
    });

    it('should re-expand from cache without re-fetching', async () => {
      await adapter.createIssue(projectId, {
        title: 'TC-001: Login test',
        body: 'Test body',
      });

      const getIssuesSpy = vi.spyOn(adapter, 'getIssues').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 100,
        hasMore: false,
      });

      // Expand
      await presenter.expandSuite('auth');
      const callCountAfterExpand = getIssuesSpy.mock.calls.length;

      // Collapse
      presenter.toggleSuite('auth');

      // Re-expand (should use cache)
      presenter.toggleSuite('auth');

      // Should not have fetched again
      expect(getIssuesSpy.mock.calls.length).toBe(callCountAfterExpand);

      const authSuite = presenter
        .getSuiteViewModel()
        .suites.find((s) => s.suiteId === 'auth')!;
      expect(authSuite.isExpanded).toBe(true);
    });

    it('should call expandSuite if no cache exists', async () => {
      const getIssuesSpy = vi.spyOn(adapter, 'getIssues').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 100,
        hasMore: false,
      });

      // Toggle a suite that was never expanded
      presenter.toggleSuite('auth');

      // Should have called getIssues to fetch
      // Wait for async expansion
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(getIssuesSpy).toHaveBeenCalled();
    });
  });

  describe('setViewMode()', () => {
    it('should toggle between flat and grouped', () => {
      expect(presenter.getSuiteViewModel().viewMode).toBe('grouped');

      presenter.setViewMode('flat');
      expect(presenter.getSuiteViewModel().viewMode).toBe('flat');

      presenter.setViewMode('grouped');
      expect(presenter.getSuiteViewModel().viewMode).toBe('grouped');
    });

    it('should notify subscribers on mode change', () => {
      const callback = vi.fn();
      presenter.subscribeSuites(callback);
      callback.mockClear();

      presenter.setViewMode('flat');

      expect(callback).toHaveBeenCalledOnce();
      const vm = callback.mock.calls[0]![0] as TestSuiteListViewModel;
      expect(vm.viewMode).toBe('flat');
    });
  });

  describe('blocking detection', () => {
    it('should mark issue as blocked when prerequisite has failed status', async () => {
      const suiteManager = getSuiteManager();
      vi.spyOn(suiteManager, 'discoverSuites').mockResolvedValue([
        { suiteId: 'auth', displayName: 'Authentication', order: 0, issueCount: 2 },
      ]);
      await presenter.loadSuites();

      // Create two issues: TC-001 (no deps) and TC-002 (depends on TC-001)
      const issue1 = await adapter.createIssue(projectId, {
        title: 'TC-001: Login test',
        body: 'Basic login test',
      });

      const body2 = [
        'Advanced auth test',
        '{traklet:section:prerequisites}',
        'Requires (TC-001)',
        '{/traklet:section:prerequisites}',
      ].join('\n');
      const issue2 = await adapter.createIssue(projectId, {
        title: 'TC-002: Advanced auth',
        body: body2,
      });

      // Set up a test run where TC-001 failed
      const testRunManager = getTestRunManager();
      testRunManager.startRun('UAT Run 1', 'tester@example.com');
      testRunManager.recordResult(issue1.id, issue1.title, 'failed');

      const originalGetIssues = adapter.getIssues.bind(adapter);
      vi.spyOn(adapter, 'getIssues').mockImplementation(async (pid, query) => {
        if (
          query?.labels?.includes('suite:auth') &&
          query?.labels?.includes('test-case')
        ) {
          // Return both issues
          return {
            items: [issue1, issue2],
            total: 2,
            page: 1,
            limit: 100,
            hasMore: false,
          };
        }
        return originalGetIssues(pid, query);
      });

      await presenter.expandSuite('auth');

      const authSuite = presenter
        .getSuiteViewModel()
        .suites.find((s) => s.suiteId === 'auth')!;

      const tc1 = authSuite.issues.find((i) => i.testCaseId === 'TC-001')!;
      const tc2 = authSuite.issues.find((i) => i.testCaseId === 'TC-002')!;

      expect(tc1.testStatus).toBe('failed');
      expect(tc1.isBlocked).toBe(false);

      expect(tc2.isBlocked).toBe(true);
      expect(tc2.blockedBy).toContain('TC-001');
    });

    it('should not mark as blocked when prerequisite has passed', async () => {
      const suiteManager = getSuiteManager();
      vi.spyOn(suiteManager, 'discoverSuites').mockResolvedValue([
        { suiteId: 'auth', displayName: 'Authentication', order: 0, issueCount: 2 },
      ]);
      await presenter.loadSuites();

      const issue1 = await adapter.createIssue(projectId, {
        title: 'TC-001: Login test',
        body: 'Basic login test',
      });

      const body2 = [
        'Advanced auth test',
        '{traklet:section:prerequisites}',
        'Requires (TC-001)',
        '{/traklet:section:prerequisites}',
      ].join('\n');
      const issue2 = await adapter.createIssue(projectId, {
        title: 'TC-002: Advanced auth',
        body: body2,
      });

      const testRunManager = getTestRunManager();
      testRunManager.startRun('UAT Run 1', 'tester@example.com');
      testRunManager.recordResult(issue1.id, issue1.title, 'passed');

      vi.spyOn(adapter, 'getIssues').mockResolvedValue({
        items: [issue1, issue2],
        total: 2,
        page: 1,
        limit: 100,
        hasMore: false,
      });

      await presenter.expandSuite('auth');

      const authSuite = presenter
        .getSuiteViewModel()
        .suites.find((s) => s.suiteId === 'auth')!;
      const tc2 = authSuite.issues.find((i) => i.testCaseId === 'TC-002')!;

      expect(tc2.isBlocked).toBe(false);
      expect(tc2.blockedBy).toEqual([]);
    });
  });

  describe('suite summary', () => {
    it('should correctly count passed/failed/blocked/notTested', async () => {
      const suiteManager = getSuiteManager();
      vi.spyOn(suiteManager, 'discoverSuites').mockResolvedValue([
        { suiteId: 'auth', displayName: 'Authentication', order: 0, issueCount: 4 },
      ]);
      await presenter.loadSuites();

      // Create 4 issues
      const issue1 = await adapter.createIssue(projectId, {
        title: 'TC-001: Login test',
        body: 'Test 1',
      });
      const issue2 = await adapter.createIssue(projectId, {
        title: 'TC-002: Logout test',
        body: 'Test 2',
      });
      // TC-003 depends on TC-002 (which will fail => TC-003 is blocked)
      const body3 = [
        'Test 3',
        '{traklet:section:prerequisites}',
        'Requires (TC-002)',
        '{/traklet:section:prerequisites}',
      ].join('\n');
      const issue3 = await adapter.createIssue(projectId, {
        title: 'TC-003: Protected route',
        body: body3,
      });
      const issue4 = await adapter.createIssue(projectId, {
        title: 'TC-004: Untested case',
        body: 'Test 4',
      });

      // Set up test run
      const testRunManager = getTestRunManager();
      testRunManager.startRun('UAT Run', 'tester@example.com');
      testRunManager.recordResult(issue1.id, issue1.title, 'passed');
      testRunManager.recordResult(issue2.id, issue2.title, 'failed');
      // issue3 has no result but is blocked
      // issue4 has no result and is not blocked

      vi.spyOn(adapter, 'getIssues').mockResolvedValue({
        items: [issue1, issue2, issue3, issue4],
        total: 4,
        page: 1,
        limit: 100,
        hasMore: false,
      });

      await presenter.expandSuite('auth');

      const authSuite = presenter
        .getSuiteViewModel()
        .suites.find((s) => s.suiteId === 'auth')!;

      expect(authSuite.summary.passed).toBe(1);
      expect(authSuite.summary.failed).toBe(1);
      expect(authSuite.summary.blocked).toBe(1);
      expect(authSuite.summary.notTested).toBe(1);
    });
  });

  describe('setProjectId()', () => {
    it('should clear suites and caches', async () => {
      const suiteManager = getSuiteManager();
      vi.spyOn(suiteManager, 'discoverSuites').mockResolvedValue([
        { suiteId: 'auth', displayName: 'Authentication', order: 0, issueCount: 2 },
      ]);
      await presenter.loadSuites();

      expect(presenter.getSuiteViewModel().suites).toHaveLength(1);

      presenter.setProjectId('project-2');

      const vm = presenter.getSuiteViewModel();
      expect(vm.suites).toEqual([]);
      expect(vm.isLoading).toBe(false);
      expect(vm.error).toBeNull();
    });

    it('should notify subscribers after clearing', async () => {
      const suiteManager = getSuiteManager();
      vi.spyOn(suiteManager, 'discoverSuites').mockResolvedValue([
        { suiteId: 'auth', displayName: 'Authentication', order: 0, issueCount: 2 },
      ]);
      await presenter.loadSuites();

      const callback = vi.fn();
      presenter.subscribeSuites(callback);
      callback.mockClear();

      presenter.setProjectId('project-2');

      expect(callback).toHaveBeenCalledOnce();
      const vm = callback.mock.calls[0]![0] as TestSuiteListViewModel;
      expect(vm.suites).toEqual([]);
    });
  });
});
