import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DependencyResolver,
  getDependencyResolver,
  resetDependencyResolver,
} from '../DependencyResolver';
import { TestRunManager, resetTestRunManager } from '../TestRunManager';
import type { Issue } from '@/models';

// ============================================
// Helpers
// ============================================

function makeIssue(overrides: Partial<Issue> & { id: string; title: string }): Issue {
  return {
    number: 1,
    body: '',
    state: 'open',
    labels: [],
    createdBy: { id: 'u1', name: 'Test User' },
    assignees: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    attachments: [],
    commentCount: 0,
    projectId: 'proj-1',
    ...overrides,
  };
}

function makeBodyWithPrerequisites(prereqs: string): string {
  return [
    '{traklet:section:prerequisites}',
    '## Prerequisites',
    prereqs,
    '{/traklet:section:prerequisites}',
  ].join('\n');
}

function makeBodyWithHiddenSpanPrerequisites(prereqs: string): string {
  return [
    '<span style="display:none">{traklet:section:prerequisites}</span>',
    '## Prerequisites',
    prereqs,
    '<span style="display:none">{/traklet:section:prerequisites}</span>',
  ].join('\n');
}

describe('DependencyResolver', () => {
  let resolver: DependencyResolver;
  let testRunManager: TestRunManager;

  beforeEach(() => {
    resetDependencyResolver();
    resolver = getDependencyResolver();
    resetTestRunManager();
    testRunManager = new TestRunManager();
  });

  afterEach(() => {
    resetDependencyResolver();
    resetTestRunManager();
  });

  // ============================================
  // extractTestCaseId
  // ============================================

  describe('extractTestCaseId', () => {
    it('should extract TC-001 from "TC-001: Login test"', () => {
      expect(resolver.extractTestCaseId('TC-001: Login test')).toBe('TC-001');
    });

    it('should return null for "Regular issue title"', () => {
      expect(resolver.extractTestCaseId('Regular issue title')).toBeNull();
    });

    it('should handle TC-9999: format', () => {
      expect(resolver.extractTestCaseId('TC-9999: Large number')).toBe('TC-9999');
    });

    it('should return null for title with TC in the middle', () => {
      expect(resolver.extractTestCaseId('Fix TC-001 bug')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(resolver.extractTestCaseId('')).toBeNull();
    });
  });

  // ============================================
  // parsePrerequisites
  // ============================================

  describe('parsePrerequisites', () => {
    it('should extract TC-IDs from body with curly-brace markers', () => {
      const body = makeBodyWithPrerequisites(
        'Requires (TC-001) login to be passing'
      );
      expect(resolver.parsePrerequisites(body)).toEqual(['TC-001']);
    });

    it('should extract TC-IDs from body with hidden span markers', () => {
      const body = makeBodyWithHiddenSpanPrerequisites(
        'Depends on (TC-002) and (TC-005)'
      );
      expect(resolver.parsePrerequisites(body)).toEqual(['TC-002', 'TC-005']);
    });

    it('should return empty array when no prerequisites section exists', () => {
      const body = '## Steps\n1. Do something\n2. Check result';
      expect(resolver.parsePrerequisites(body)).toEqual([]);
    });

    it('should handle multiple prerequisites "(TC-001) and (TC-003)"', () => {
      const body = makeBodyWithPrerequisites(
        'Must complete (TC-001) and (TC-003) first'
      );
      expect(resolver.parsePrerequisites(body)).toEqual(['TC-001', 'TC-003']);
    });

    it('should extract bold **TC-xxx** references', () => {
      const body = makeBodyWithPrerequisites(
        'Requires **TC-010** to pass first'
      );
      expect(resolver.parsePrerequisites(body)).toEqual(['TC-010']);
    });

    it('should extract both (TC-xxx) and **TC-xxx** references', () => {
      const body = makeBodyWithPrerequisites(
        'Requires (TC-001) and **TC-002** to pass'
      );
      const result = resolver.parsePrerequisites(body);
      expect(result).toContain('TC-001');
      expect(result).toContain('TC-002');
    });

    it('should deduplicate TC-IDs', () => {
      const body = makeBodyWithPrerequisites(
        'Requires (TC-001) first, also depends on (TC-001)'
      );
      expect(resolver.parsePrerequisites(body)).toEqual(['TC-001']);
    });

    it('should return empty array for empty body', () => {
      expect(resolver.parsePrerequisites('')).toEqual([]);
    });
  });

  // ============================================
  // registerIssues
  // ============================================

  describe('registerIssues', () => {
    it('should register issues and map TC-ID to issue ID', () => {
      const issues = [
        makeIssue({ id: 'issue-1', title: 'TC-001: Login test' }),
        makeIssue({ id: 'issue-2', title: 'TC-002: Dashboard test' }),
      ];

      resolver.registerIssues(issues);

      expect(resolver.resolveTestCaseId('TC-001')).toBe('issue-1');
      expect(resolver.resolveTestCaseId('TC-002')).toBe('issue-2');
    });

    it('should skip issues without TC-ID in title', () => {
      const issues = [
        makeIssue({ id: 'issue-1', title: 'TC-001: Login test' }),
        makeIssue({ id: 'issue-2', title: 'Bug: Something broken' }),
      ];

      resolver.registerIssues(issues);

      expect(resolver.getRegisteredIds()).toEqual(['TC-001']);
    });

    it('should merge incrementally on second call', () => {
      resolver.registerIssues([
        makeIssue({ id: 'issue-1', title: 'TC-001: Login test' }),
      ]);
      resolver.registerIssues([
        makeIssue({ id: 'issue-2', title: 'TC-002: Dashboard test' }),
      ]);

      expect(resolver.getRegisteredIds()).toContain('TC-001');
      expect(resolver.getRegisteredIds()).toContain('TC-002');
      expect(resolver.resolveTestCaseId('TC-001')).toBe('issue-1');
      expect(resolver.resolveTestCaseId('TC-002')).toBe('issue-2');
    });
  });

  // ============================================
  // resolveTestCaseId
  // ============================================

  describe('resolveTestCaseId', () => {
    it('should resolve registered TC-ID to issue ID', () => {
      resolver.registerIssues([
        makeIssue({ id: 'issue-5', title: 'TC-005: Checkout flow' }),
      ]);
      expect(resolver.resolveTestCaseId('TC-005')).toBe('issue-5');
    });

    it('should return undefined for unregistered TC-ID', () => {
      expect(resolver.resolveTestCaseId('TC-999')).toBeUndefined();
    });
  });

  // ============================================
  // isBlocked
  // ============================================

  describe('isBlocked', () => {
    it('should return false when issue has no prerequisites', () => {
      const issue = makeIssue({ id: 'issue-1', title: 'TC-001: No deps', body: '' });
      resolver.registerIssues([issue]);

      expect(resolver.isBlocked('issue-1', testRunManager)).toBe(false);
    });

    it('should return false when prerequisites are all passed or not-tested', () => {
      const prereqIssue = makeIssue({ id: 'issue-1', title: 'TC-001: Login' });
      const depIssue = makeIssue({
        id: 'issue-2',
        title: 'TC-002: Dashboard',
        body: makeBodyWithPrerequisites('Requires (TC-001)'),
      });

      resolver.registerIssues([prereqIssue, depIssue]);

      testRunManager.startRun('Test Run', 'tester@test.com');
      testRunManager.recordResult('issue-1', 'TC-001: Login', 'passed');

      expect(resolver.isBlocked('issue-2', testRunManager)).toBe(false);
    });

    it('should return true when any prerequisite has failed status', () => {
      const prereqIssue = makeIssue({ id: 'issue-1', title: 'TC-001: Login' });
      const depIssue = makeIssue({
        id: 'issue-2',
        title: 'TC-002: Dashboard',
        body: makeBodyWithPrerequisites('Requires (TC-001)'),
      });

      resolver.registerIssues([prereqIssue, depIssue]);

      testRunManager.startRun('Test Run', 'tester@test.com');
      testRunManager.recordResult('issue-1', 'TC-001: Login', 'failed');

      expect(resolver.isBlocked('issue-2', testRunManager)).toBe(true);
    });

    it('should return false when prerequisite status is not-tested', () => {
      const prereqIssue = makeIssue({ id: 'issue-1', title: 'TC-001: Login' });
      const depIssue = makeIssue({
        id: 'issue-2',
        title: 'TC-002: Dashboard',
        body: makeBodyWithPrerequisites('Requires (TC-001)'),
      });

      resolver.registerIssues([prereqIssue, depIssue]);
      // No test run started, so status is 'not-tested'

      expect(resolver.isBlocked('issue-2', testRunManager)).toBe(false);
    });

    it('should return false when prerequisite TC-ID is not registered', () => {
      const depIssue = makeIssue({
        id: 'issue-2',
        title: 'TC-002: Dashboard',
        body: makeBodyWithPrerequisites('Requires (TC-999)'),
      });

      resolver.registerIssues([depIssue]);

      expect(resolver.isBlocked('issue-2', testRunManager)).toBe(false);
    });

    it('should return false for unregistered issue ID', () => {
      expect(resolver.isBlocked('nonexistent', testRunManager)).toBe(false);
    });
  });

  // ============================================
  // getBlockingInfo
  // ============================================

  describe('getBlockingInfo', () => {
    it('should return full DependencyInfo with resolved prerequisites', () => {
      const prereq1 = makeIssue({ id: 'issue-1', title: 'TC-001: Login' });
      const prereq2 = makeIssue({ id: 'issue-3', title: 'TC-003: Auth' });
      const depIssue = makeIssue({
        id: 'issue-2',
        title: 'TC-002: Dashboard',
        body: makeBodyWithPrerequisites('Requires (TC-001) and (TC-003)'),
      });

      resolver.registerIssues([prereq1, prereq2, depIssue]);

      testRunManager.startRun('Test Run', 'tester@test.com');
      testRunManager.recordResult('issue-1', 'TC-001: Login', 'passed');
      testRunManager.recordResult('issue-3', 'TC-003: Auth', 'failed');

      const info = resolver.getBlockingInfo('issue-2', testRunManager);

      expect(info.issueId).toBe('issue-2');
      expect(info.testCaseId).toBe('TC-002');
      expect(info.isBlocked).toBe(true);
      expect(info.blockedBy).toEqual(['TC-003']);
      expect(info.prerequisites).toHaveLength(2);

      const passedPrereq = info.prerequisites.find((p) => p.testCaseId === 'TC-001');
      expect(passedPrereq).toBeDefined();
      expect(passedPrereq!.issueId).toBe('issue-1');
      expect(passedPrereq!.title).toBe('TC-001: Login');
      expect(passedPrereq!.status).toBe('passed');

      const failedPrereq = info.prerequisites.find((p) => p.testCaseId === 'TC-003');
      expect(failedPrereq).toBeDefined();
      expect(failedPrereq!.issueId).toBe('issue-3');
      expect(failedPrereq!.title).toBe('TC-003: Auth');
      expect(failedPrereq!.status).toBe('failed');
    });

    it('should return non-blocked info when no prerequisites', () => {
      const issue = makeIssue({ id: 'issue-1', title: 'TC-001: Login', body: '' });
      resolver.registerIssues([issue]);

      const info = resolver.getBlockingInfo('issue-1', testRunManager);

      expect(info.issueId).toBe('issue-1');
      expect(info.testCaseId).toBe('TC-001');
      expect(info.isBlocked).toBe(false);
      expect(info.blockedBy).toEqual([]);
      expect(info.prerequisites).toEqual([]);
    });

    it('should handle unregistered prerequisite TC-IDs gracefully', () => {
      const depIssue = makeIssue({
        id: 'issue-2',
        title: 'TC-002: Dashboard',
        body: makeBodyWithPrerequisites('Requires (TC-999)'),
      });

      resolver.registerIssues([depIssue]);

      const info = resolver.getBlockingInfo('issue-2', testRunManager);

      expect(info.isBlocked).toBe(false);
      expect(info.prerequisites).toHaveLength(0);
      expect(info.blockedBy).toEqual([]);
    });
  });

  // ============================================
  // clear
  // ============================================

  describe('clear', () => {
    it('should clear all registered data', () => {
      resolver.registerIssues([
        makeIssue({ id: 'issue-1', title: 'TC-001: Login' }),
        makeIssue({ id: 'issue-2', title: 'TC-002: Dashboard' }),
      ]);

      resolver.clear();

      expect(resolver.getRegisteredIds()).toEqual([]);
      expect(resolver.resolveTestCaseId('TC-001')).toBeUndefined();
    });
  });

  // ============================================
  // Singleton
  // ============================================

  describe('Singleton', () => {
    it('getDependencyResolver returns same instance', () => {
      const a = getDependencyResolver();
      const b = getDependencyResolver();
      expect(a).toBe(b);
    });

    it('resetDependencyResolver creates new instance', () => {
      const a = getDependencyResolver();
      const b = resetDependencyResolver();
      expect(a).not.toBe(b);
    });
  });
});
