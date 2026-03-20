/**
 * TestRunManager - Manages test run sessions and result tracking
 *
 * A test run is a named period of testing that groups test execution
 * results across multiple test cases. Results are stored in-memory
 * during the run and persisted as structured comments on a tracker
 * issue (or localStorage for the localStorage adapter).
 */

// ============================================
// Types
// ============================================

export type TestStatus = 'passed' | 'failed' | 'blocked' | 'skipped' | 'not-tested';

export interface TestCaseResult {
  readonly issueId: string;
  readonly issueTitle: string;
  readonly status: TestStatus;
  readonly executedAt?: string | undefined;
  readonly executedBy?: string | undefined;
  readonly notes?: string | undefined;
  readonly jamLink?: string | undefined;
}

export interface TestRun {
  readonly id: string;
  readonly name: string;
  readonly startedAt: string;
  readonly endedAt?: string | undefined;
  readonly isActive: boolean;
  readonly createdBy: string;
  readonly results: readonly TestCaseResult[];
}

export interface TestRunSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly blocked: number;
  readonly skipped: number;
  readonly notTested: number;
  readonly percentComplete: number;
}

// ============================================
// Manager
// ============================================

const STORAGE_KEY = '__traklet_test_runs__';

export class TestRunManager {
  private activeRun: TestRun | null = null;
  private history: TestRun[] = [];
  private subscribers = new Set<() => void>();

  constructor() {
    this.loadFromStorage();
  }

  // ============================================
  // Run Lifecycle
  // ============================================

  startRun(name: string, createdBy: string): TestRun {
    // Stop any active run first
    if (this.activeRun) {
      this.stopRun();
    }

    const run: TestRun = {
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      startedAt: new Date().toISOString(),
      isActive: true,
      createdBy,
      results: [],
    };

    this.activeRun = run;
    this.persist();
    this.notify();
    return run;
  }

  stopRun(): TestRun | null {
    if (!this.activeRun) return null;

    const completed: TestRun = {
      ...this.activeRun,
      endedAt: new Date().toISOString(),
      isActive: false,
    };

    this.history.unshift(completed);
    this.activeRun = null;
    this.persist();
    this.notify();
    return completed;
  }

  getActiveRun(): TestRun | null {
    return this.activeRun;
  }

  isRunActive(): boolean {
    return this.activeRun !== null;
  }

  getHistory(): readonly TestRun[] {
    return this.history;
  }

  getRun(runId: string): TestRun | null {
    if (this.activeRun?.id === runId) return this.activeRun;
    return this.history.find((r) => r.id === runId) ?? null;
  }

  // ============================================
  // Result Recording
  // ============================================

  recordResult(
    issueId: string,
    issueTitle: string,
    status: TestStatus,
    options?: {
      executedBy?: string;
      notes?: string;
      jamLink?: string;
    }
  ): void {
    if (!this.activeRun) {
      throw new Error('No active test run. Call startRun() first.');
    }

    const result: TestCaseResult = {
      issueId,
      issueTitle,
      status,
      executedAt: new Date().toISOString(),
      executedBy: options?.executedBy,
      notes: options?.notes,
      jamLink: options?.jamLink,
    };

    // Replace existing result for this issue (re-test)
    const existing = this.activeRun.results.filter((r) => r.issueId !== issueId);
    this.activeRun = {
      ...this.activeRun,
      results: [...existing, result],
    };

    this.persist();
    this.notify();
  }

  getResult(issueId: string, runId?: string): TestCaseResult | null {
    const run = runId ? this.getRun(runId) : this.activeRun;
    if (!run) return null;
    return run.results.find((r) => r.issueId === issueId) ?? null;
  }

  getStatusForIssue(issueId: string): TestStatus {
    if (!this.activeRun) return 'not-tested';
    const result = this.activeRun.results.find((r) => r.issueId === issueId);
    return result?.status ?? 'not-tested';
  }

  // ============================================
  // Summary
  // ============================================

  getSummary(runId?: string): TestRunSummary {
    const run = runId ? this.getRun(runId) : this.activeRun;
    if (!run) {
      return { total: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, notTested: 0, percentComplete: 0 };
    }

    const results = run.results;
    const passed = results.filter((r) => r.status === 'passed').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const blocked = results.filter((r) => r.status === 'blocked').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const total = results.length;
    const tested = passed + failed + blocked + skipped;
    const notTested = total - tested;

    return {
      total,
      passed,
      failed,
      blocked,
      skipped,
      notTested,
      percentComplete: total > 0 ? Math.round((tested / total) * 100) : 0,
    };
  }

  /**
   * Get summary with total based on all test cases (not just those with results)
   */
  getSummaryWithTotal(totalTestCases: number, runId?: string): TestRunSummary {
    const run = runId ? this.getRun(runId) : this.activeRun;
    if (!run) {
      return { total: totalTestCases, passed: 0, failed: 0, blocked: 0, skipped: 0, notTested: totalTestCases, percentComplete: 0 };
    }

    const results = run.results;
    const passed = results.filter((r) => r.status === 'passed').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const blocked = results.filter((r) => r.status === 'blocked').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const tested = passed + failed + blocked + skipped;
    const notTested = totalTestCases - tested;

    return {
      total: totalTestCases,
      passed,
      failed,
      blocked,
      skipped,
      notTested,
      percentComplete: totalTestCases > 0 ? Math.round((tested / totalTestCases) * 100) : 0,
    };
  }

  // ============================================
  // Format as Markdown (for storing as comment)
  // ============================================

  formatRunAsMarkdown(runId?: string): string {
    const run = runId ? this.getRun(runId) : this.activeRun;
    if (!run) return '';

    const summary = this.getSummary(runId);
    const lines: string[] = [];

    lines.push(`## Test Run: ${run.name}`);
    lines.push('');
    lines.push(`**Started:** ${run.startedAt}`);
    if (run.endedAt) {
      lines.push(`**Ended:** ${run.endedAt}`);
    }
    lines.push(`**By:** ${run.createdBy}`);
    lines.push('');
    lines.push(`**Progress:** ${summary.percentComplete}% complete`);
    lines.push(`- Passed: ${summary.passed}`);
    lines.push(`- Failed: ${summary.failed}`);
    lines.push(`- Blocked: ${summary.blocked}`);
    lines.push(`- Skipped: ${summary.skipped}`);
    lines.push(`- Not Tested: ${summary.notTested}`);
    lines.push('');

    if (run.results.length > 0) {
      lines.push('| Test Case | Status | Tested By | Date |');
      lines.push('|-----------|--------|-----------|------|');
      for (const r of run.results) {
        const date = r.executedAt ? new Date(r.executedAt).toLocaleDateString() : '-';
        const by = r.executedBy ?? '-';
        lines.push(`| ${r.issueTitle} | ${r.status} | ${by} | ${date} |`);
      }
    }

    return lines.join('\n');
  }

  // ============================================
  // Subscriptions
  // ============================================

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify(): void {
    for (const cb of this.subscribers) {
      try { cb(); } catch { /* ignore */ }
    }
  }

  // ============================================
  // Persistence (localStorage)
  // ============================================

  private persist(): void {
    try {
      const data = {
        activeRun: this.activeRun,
        history: this.history.slice(0, 20), // Keep last 20 runs
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* localStorage unavailable */ }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const data = JSON.parse(stored) as { activeRun: TestRun | null; history: TestRun[] };
      this.activeRun = data.activeRun;
      this.history = data.history ?? [];
    } catch { /* ignore */ }
  }

  /**
   * Clear all runs (for testing)
   */
  clearAll(): void {
    this.activeRun = null;
    this.history = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    this.notify();
  }
}

// ============================================
// Singleton
// ============================================

let instance: TestRunManager | null = null;

export function getTestRunManager(): TestRunManager {
  if (!instance) {
    instance = new TestRunManager();
  }
  return instance;
}

export function resetTestRunManager(): void {
  instance?.clearAll();
  instance = null;
}
