/**
 * TestSuiteListPresenter - Presentation logic for suite-grouped test case lists
 *
 * Composes SuiteManager + DependencyResolver + TestRunManager to present
 * test cases grouped by suite with dependency-aware blocking detection.
 */

import type { IBackendAdapter } from '@/contracts';
import type { Issue } from '@/models';
import { getPermissionManager } from '@/core/PermissionManager';
import { getSuiteManager } from '@/core/SuiteManager';
import { getDependencyResolver } from '@/core/DependencyResolver';
import { getTestRunManager } from '@/core/TestRunManager';
import type {
  ITestSuiteListPresenter,
  TestSuiteListViewModel,
  SuiteViewModel,
  SuiteSummary,
  TestCaseListItemViewModel,
} from './IPresenter';

export class TestSuiteListPresenter implements ITestSuiteListPresenter {
  private viewModel: TestSuiteListViewModel;
  private suiteIssueCache: Map<string, Issue[]> = new Map();
  private subscribers: Set<(vm: TestSuiteListViewModel) => void> = new Set();
  private currentProjectId: string;

  constructor(
    private readonly adapter: IBackendAdapter,
    projectId: string
  ) {
    this.currentProjectId = projectId;
    this.viewModel = this.createInitialViewModel();
  }

  getSuiteViewModel(): TestSuiteListViewModel {
    return this.viewModel;
  }

  subscribeSuites(
    callback: (vm: TestSuiteListViewModel) => void
  ): () => void {
    this.subscribers.add(callback);
    // Immediately call with current state
    callback(this.viewModel);
    return () => this.subscribers.delete(callback);
  }

  async loadSuites(): Promise<void> {
    this.updateViewModel({ isLoading: true, error: null });

    try {
      const suiteManager = getSuiteManager();
      const suiteInfos = await suiteManager.discoverSuites(
        this.adapter as unknown as Parameters<typeof suiteManager.discoverSuites>[0],
        this.currentProjectId
      );

      const suites: SuiteViewModel[] = suiteInfos.map((info) => ({
        suiteId: info.suiteId,
        displayName: info.displayName,
        order: info.order,
        issueCount: info.issueCount,
        isExpanded: false,
        isLoading: false,
        summary: { passed: 0, failed: 0, blocked: 0, notTested: 0 },
        issues: [],
      }));

      this.updateViewModel({ suites, isLoading: false });
    } catch (error) {
      this.updateViewModel({
        isLoading: false,
        error:
          error instanceof Error ? error.message : 'Failed to discover suites',
      });
    }
  }

  toggleSuite(suiteId: string): void {
    const suite = this.viewModel.suites.find((s) => s.suiteId === suiteId);
    if (!suite) return;

    if (suite.isExpanded) {
      // Collapse: set isExpanded=false, keep cache
      this.updateSuite(suiteId, { isExpanded: false });
    } else if (this.suiteIssueCache.has(suiteId)) {
      // Re-expand from cache
      const cachedIssues = this.suiteIssueCache.get(suiteId)!;
      const dependencyResolver = getDependencyResolver();
      const testRunManager = getTestRunManager();
      const permissionManager = getPermissionManager();

      dependencyResolver.registerIssues(cachedIssues);
      const testCaseVMs = cachedIssues.map((issue) =>
        this.toTestCaseViewModel(
          issue,
          dependencyResolver,
          testRunManager,
          permissionManager
        )
      );
      const summary = this.computeSummary(testCaseVMs);
      this.updateSuite(suiteId, {
        isExpanded: true,
        issues: testCaseVMs,
        summary,
      });
    } else {
      // No cache: trigger async expansion
      void this.expandSuite(suiteId);
    }
  }

  async expandSuite(suiteId: string): Promise<void> {
    // Set loading on this suite
    this.updateSuite(suiteId, { isLoading: true });

    try {
      const result = await this.adapter.getIssues(this.currentProjectId, {
        labels: [`suite:${suiteId}`, 'test-case'],
        limit: 100,
      });

      const issues = result.items;
      this.suiteIssueCache.set(suiteId, [...issues]);

      const dependencyResolver = getDependencyResolver();
      const testRunManager = getTestRunManager();
      const permissionManager = getPermissionManager();

      // Register issues with dependency resolver
      dependencyResolver.registerIssues(issues as Issue[]);

      const testCaseVMs = issues.map((issue) =>
        this.toTestCaseViewModel(
          issue,
          dependencyResolver,
          testRunManager,
          permissionManager
        )
      );

      const summary = this.computeSummary(testCaseVMs);

      this.updateSuite(suiteId, {
        isExpanded: true,
        isLoading: false,
        issues: testCaseVMs,
        issueCount: issues.length,
        summary,
      });
    } catch (error) {
      this.updateSuite(suiteId, { isLoading: false });
    }
  }

  setViewMode(mode: 'flat' | 'grouped'): void {
    this.updateViewModel({ viewMode: mode });
  }

  setProjectId(projectId: string): void {
    this.currentProjectId = projectId;
    this.suiteIssueCache.clear();
    getDependencyResolver().clear();
    this.updateViewModel(this.createInitialViewModel());
  }

  // ============================================
  // Private helpers
  // ============================================

  private toTestCaseViewModel(
    issue: Issue,
    dependencyResolver: ReturnType<typeof getDependencyResolver>,
    testRunManager: ReturnType<typeof getTestRunManager>,
    permissionManager: ReturnType<typeof getPermissionManager>
  ): TestCaseListItemViewModel {
    const testCaseId = dependencyResolver.extractTestCaseId(issue.title) ?? '';
    const prerequisiteIds = dependencyResolver.parsePrerequisites(issue.body);
    const blockingInfo = dependencyResolver.getBlockingInfo(
      issue.id,
      testRunManager
    );
    const testStatus = testRunManager.getStatusForIssue(issue.id);

    return {
      // IssueListItemViewModel fields
      id: issue.id,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      priority: issue.priority,
      labels: issue.labels.map((l) => ({ name: l.name, color: l.color })),
      authorName: issue.createdBy?.name ?? 'Unknown',
      commentCount: issue.commentCount ?? 0,
      createdAt: this.formatDate(issue.createdAt),
      updatedAt: this.formatDate(issue.updatedAt),
      canEdit: permissionManager.canEditIssue(issue),
      canDelete: permissionManager.canDeleteIssue(issue),
      // TestCaseListItemViewModel fields
      testCaseId,
      testStatus,
      isBlocked: blockingInfo.isBlocked,
      blockedBy: blockingInfo.blockedBy,
      prerequisiteIds,
    };
  }

  private computeSummary(
    issues: readonly TestCaseListItemViewModel[]
  ): SuiteSummary {
    let passed = 0;
    let failed = 0;
    let blocked = 0;
    let notTested = 0;

    for (const issue of issues) {
      if (issue.isBlocked) {
        blocked++;
      } else if (issue.testStatus === 'passed') {
        passed++;
      } else if (issue.testStatus === 'failed') {
        failed++;
      } else {
        notTested++;
      }
    }

    return { passed, failed, blocked, notTested };
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  private createInitialViewModel(): TestSuiteListViewModel {
    return {
      suites: [],
      isLoading: false,
      error: null,
      viewMode: 'grouped',
    };
  }

  private updateSuite(
    suiteId: string,
    updates: Partial<SuiteViewModel>
  ): void {
    const suites = this.viewModel.suites.map((s) =>
      s.suiteId === suiteId ? { ...s, ...updates } : s
    );
    this.updateViewModel({ suites });
  }

  private updateViewModel(updates: Partial<TestSuiteListViewModel>): void {
    this.viewModel = { ...this.viewModel, ...updates };
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback(this.viewModel);
      } catch (error) {
        console.error('Error in TestSuiteListPresenter subscriber:', error);
      }
    }
  }
}
