import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TestRunManager,
  getTestRunManager,
  resetTestRunManager,
} from '../TestRunManager';
import type { TestStatus } from '../TestRunManager';

describe('TestRunManager', () => {
  let manager: TestRunManager;

  beforeEach(() => {
    resetTestRunManager();
    manager = getTestRunManager();
  });

  afterEach(() => {
    resetTestRunManager();
  });

  describe('Run Lifecycle', () => {
    it('should start a new run', () => {
      const run = manager.startRun('Sprint 12 QA', 'tester@sji.com');

      expect(run.id).toBeDefined();
      expect(run.name).toBe('Sprint 12 QA');
      expect(run.isActive).toBe(true);
      expect(run.createdBy).toBe('tester@sji.com');
      expect(run.results).toHaveLength(0);
      expect(run.startedAt).toBeDefined();
    });

    it('should report active run', () => {
      expect(manager.isRunActive()).toBe(false);
      manager.startRun('Test', 'user@test.com');
      expect(manager.isRunActive()).toBe(true);
    });

    it('should get active run', () => {
      const run = manager.startRun('Test', 'user@test.com');
      expect(manager.getActiveRun()).toEqual(run);
    });

    it('should stop a run', () => {
      manager.startRun('Test', 'user@test.com');
      const stopped = manager.stopRun();

      expect(stopped).not.toBeNull();
      expect(stopped!.isActive).toBe(false);
      expect(stopped!.endedAt).toBeDefined();
      expect(manager.isRunActive()).toBe(false);
      expect(manager.getActiveRun()).toBeNull();
    });

    it('should add stopped run to history', () => {
      manager.startRun('Run 1', 'user@test.com');
      manager.stopRun();

      expect(manager.getHistory()).toHaveLength(1);
      expect(manager.getHistory()[0]!.name).toBe('Run 1');
    });

    it('should stop previous run when starting new one', () => {
      manager.startRun('Run 1', 'user@test.com');
      manager.startRun('Run 2', 'user@test.com');

      expect(manager.getActiveRun()!.name).toBe('Run 2');
      expect(manager.getHistory()).toHaveLength(1);
      expect(manager.getHistory()[0]!.name).toBe('Run 1');
    });

    it('should return null when stopping with no active run', () => {
      expect(manager.stopRun()).toBeNull();
    });

    it('should get run by ID', () => {
      const run = manager.startRun('Test', 'user@test.com');
      expect(manager.getRun(run.id)).toEqual(run);
    });

    it('should get historical run by ID', () => {
      manager.startRun('Run 1', 'user@test.com');
      const stopped = manager.stopRun()!;
      expect(manager.getRun(stopped.id)!.name).toBe('Run 1');
    });
  });

  describe('Result Recording', () => {
    beforeEach(() => {
      manager.startRun('Test Run', 'tester@test.com');
    });

    it('should record a test result', () => {
      manager.recordResult('issue-1', 'Login Test', 'passed');

      const result = manager.getResult('issue-1');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('passed');
      expect(result!.issueTitle).toBe('Login Test');
      expect(result!.executedAt).toBeDefined();
    });

    it('should record result with options', () => {
      manager.recordResult('issue-1', 'Login Test', 'failed', {
        executedBy: 'tester@test.com',
        notes: 'Button not responding',
        jamLink: 'https://jam.dev/c/abc123',
      });

      const result = manager.getResult('issue-1');
      expect(result!.executedBy).toBe('tester@test.com');
      expect(result!.notes).toBe('Button not responding');
      expect(result!.jamLink).toBe('https://jam.dev/c/abc123');
    });

    it('should replace existing result on re-test', () => {
      manager.recordResult('issue-1', 'Login Test', 'failed');
      manager.recordResult('issue-1', 'Login Test', 'passed');

      const run = manager.getActiveRun()!;
      const results = run.results.filter((r) => r.issueId === 'issue-1');
      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe('passed');
    });

    it('should throw when no active run', () => {
      manager.stopRun();
      expect(() => manager.recordResult('x', 'X', 'passed')).toThrow('No active test run');
    });

    it('should get status for issue', () => {
      manager.recordResult('issue-1', 'Test', 'passed');
      expect(manager.getStatusForIssue('issue-1')).toBe('passed');
    });

    it('should return not-tested for unrecorded issue', () => {
      expect(manager.getStatusForIssue('unknown')).toBe('not-tested');
    });

    it('should return not-tested when no active run', () => {
      manager.stopRun();
      expect(manager.getStatusForIssue('issue-1')).toBe('not-tested');
    });
  });

  describe('Summary', () => {
    beforeEach(() => {
      manager.startRun('Test Run', 'tester@test.com');
    });

    it('should return correct summary counts', () => {
      manager.recordResult('1', 'T1', 'passed');
      manager.recordResult('2', 'T2', 'passed');
      manager.recordResult('3', 'T3', 'failed');
      manager.recordResult('4', 'T4', 'blocked');
      manager.recordResult('5', 'T5', 'skipped');

      const summary = manager.getSummary();
      expect(summary.total).toBe(5);
      expect(summary.passed).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.blocked).toBe(1);
      expect(summary.skipped).toBe(1);
    });

    it('should calculate percent complete', () => {
      manager.recordResult('1', 'T1', 'passed');
      manager.recordResult('2', 'T2', 'failed');

      const summary = manager.getSummaryWithTotal(4);
      expect(summary.percentComplete).toBe(50);
      expect(summary.notTested).toBe(2);
    });

    it('should return zero summary when no run', () => {
      manager.stopRun();
      const summary = manager.getSummary();
      expect(summary.total).toBe(0);
    });

    it('should get summary for historical run', () => {
      manager.recordResult('1', 'T1', 'passed');
      const stopped = manager.stopRun()!;

      const summary = manager.getSummary(stopped.id);
      expect(summary.passed).toBe(1);
    });
  });

  describe('Markdown Formatting', () => {
    it('should format run as markdown table', () => {
      manager.startRun('Sprint 12', 'qa@test.com');
      manager.recordResult('1', 'Login Test', 'passed', { executedBy: 'qa@test.com' });
      manager.recordResult('2', 'Export Test', 'failed', { executedBy: 'qa@test.com' });

      const md = manager.formatRunAsMarkdown();
      expect(md).toContain('## Test Run: Sprint 12');
      expect(md).toContain('Passed: 1');
      expect(md).toContain('Failed: 1');
      expect(md).toContain('Login Test');
      expect(md).toContain('Export Test');
      expect(md).toContain('| Test Case | Status |');
    });

    it('should return empty string for no run', () => {
      expect(manager.formatRunAsMarkdown()).toBe('');
    });
  });

  describe('Subscriptions', () => {
    it('should notify on start', () => {
      let called = false;
      manager.subscribe(() => { called = true; });
      manager.startRun('Test', 'user@test.com');
      expect(called).toBe(true);
    });

    it('should notify on stop', () => {
      manager.startRun('Test', 'user@test.com');
      let called = false;
      manager.subscribe(() => { called = true; });
      manager.stopRun();
      expect(called).toBe(true);
    });

    it('should notify on record result', () => {
      manager.startRun('Test', 'user@test.com');
      let count = 0;
      manager.subscribe(() => { count++; });
      manager.recordResult('1', 'T1', 'passed');
      expect(count).toBe(1);
    });

    it('should unsubscribe', () => {
      let called = false;
      const unsub = manager.subscribe(() => { called = true; });
      unsub();
      manager.startRun('Test', 'user@test.com');
      expect(called).toBe(false);
    });
  });

  describe('Data Management', () => {
    it('should maintain run data in memory across method calls', () => {
      manager.startRun('Persisted', 'user@test.com');
      manager.recordResult('1', 'Test', 'passed');

      // Same instance should have the data
      expect(manager.getActiveRun()!.name).toBe('Persisted');
      expect(manager.getResult('1')!.status).toBe('passed');
    });

    it('should maintain history after multiple runs', () => {
      manager.startRun('Run 1', 'user@test.com');
      manager.recordResult('1', 'T1', 'passed');
      manager.stopRun();

      manager.startRun('Run 2', 'user@test.com');
      manager.recordResult('2', 'T2', 'failed');
      manager.stopRun();

      expect(manager.getHistory()).toHaveLength(2);
      expect(manager.getHistory()[0]!.name).toBe('Run 2'); // Most recent first
      expect(manager.getHistory()[1]!.name).toBe('Run 1');
    });

    it('should clear all data', () => {
      manager.startRun('Run', 'user@test.com');
      manager.recordResult('1', 'Test', 'passed');
      manager.clearAll();

      expect(manager.getActiveRun()).toBeNull();
      expect(manager.getHistory()).toHaveLength(0);
    });
  });

  describe('Singleton', () => {
    it('should return same instance', () => {
      const a = getTestRunManager();
      const b = getTestRunManager();
      expect(a).toBe(b);
    });

    it('should reset instance', () => {
      const a = getTestRunManager();
      resetTestRunManager();
      const b = getTestRunManager();
      expect(a).not.toBe(b);
    });
  });
});
