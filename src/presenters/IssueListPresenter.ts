/**
 * IssueListPresenter - Presentation logic for the issue list view
 * Transforms domain models to view models and handles user interactions
 */

import type { IBackendAdapter } from '@/contracts';
import type { Issue, IssueQuery } from '@/models';
import { getPermissionManager } from '@/core';
import { getStateManager, getEventBus } from '@/core';
import type { IIssueListPresenter, IssueListViewModel, IssueListItemViewModel } from './IPresenter';

export class IssueListPresenter implements IIssueListPresenter {
  private viewModel: IssueListViewModel;
  private subscribers: Set<(viewModel: IssueListViewModel) => void> = new Set();
  private currentProjectId: string;

  constructor(
    private readonly adapter: IBackendAdapter,
    projectId: string
  ) {
    this.currentProjectId = projectId;
    this.viewModel = this.createInitialViewModel();
  }

  getViewModel(): IssueListViewModel {
    return this.viewModel;
  }

  subscribe(callback: (viewModel: IssueListViewModel) => void): () => void {
    this.subscribers.add(callback);
    // Immediately call with current state
    callback(this.viewModel);
    return () => this.subscribers.delete(callback);
  }

  async loadIssues(query?: IssueQuery): Promise<void> {
    this.updateViewModel({ isLoading: true, error: null });

    try {
      const result = await this.adapter.getIssues(this.currentProjectId, {
        state: this.viewModel.filters.state === 'all' ? undefined : this.viewModel.filters.state,
        labels: this.viewModel.filters.labels.length > 0 ? this.viewModel.filters.labels : undefined,
        search: this.viewModel.filters.search || undefined,
        assignee: this.viewModel.filters.assignee ?? undefined,
        page: 1,
        limit: 50,
        ...query,
      });

      const issues = result.items.map((issue) => this.toListItemViewModel(issue));

      // Extract unique assignee names from loaded issues for the filter dropdown
      const assigneeSet = new Set<string>();
      for (const issue of result.items) {
        for (const a of issue.assignees) {
          assigneeSet.add(a.name);
        }
        assigneeSet.add(issue.createdBy.name);
      }

      this.updateViewModel({
        issues,
        isLoading: false,
        availableAssignees: Array.from(assigneeSet).sort(),
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      this.updateViewModel({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load issues',
      });
    }
  }

  async loadMore(): Promise<void> {
    if (!this.viewModel.pagination.hasMore || this.viewModel.isLoading) {
      return;
    }

    this.updateViewModel({ isLoading: true });

    try {
      const nextPage = this.viewModel.pagination.page + 1;
      const result = await this.adapter.getIssues(this.currentProjectId, {
        state: this.viewModel.filters.state === 'all' ? undefined : this.viewModel.filters.state,
        labels: this.viewModel.filters.labels.length > 0 ? this.viewModel.filters.labels : undefined,
        search: this.viewModel.filters.search || undefined,
        assignee: this.viewModel.filters.assignee ?? undefined,
        page: nextPage,
        limit: this.viewModel.pagination.limit,
      });

      const newIssues = result.items.map((issue) => this.toListItemViewModel(issue));

      this.updateViewModel({
        issues: [...this.viewModel.issues, ...newIssues],
        isLoading: false,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      this.updateViewModel({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load more issues',
      });
    }
  }

  async refresh(): Promise<void> {
    await this.loadIssues({ page: 1 });
  }

  setFilter(filter: Partial<{ state: 'open' | 'closed' | 'all'; labels: string[]; search: string; assignee: string | null }>): void {
    this.updateViewModel({
      filters: {
        ...this.viewModel.filters,
        ...filter,
      },
    });

    // Reload with new filters
    void this.loadIssues({ page: 1 });
  }

  selectIssue(issueId: string): void {
    const stateManager = getStateManager();
    const issue = this.findIssueById(issueId);

    if (issue) {
      stateManager.setState({
        viewState: 'detail',
      });

      getEventBus().emit('issue:selected', {
        issue: issue as unknown as Issue
      });
    }
  }

  createIssue(): void {
    const stateManager = getStateManager();
    stateManager.setState({ viewState: 'create' });
  }

  setProjectId(projectId: string): void {
    this.currentProjectId = projectId;
    this.updateViewModel(this.createInitialViewModel());
  }

  private toListItemViewModel(issue: Issue): IssueListItemViewModel {
    const permissionManager = getPermissionManager();

    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      priority: issue.priority,
      labels: issue.labels.map((l) => ({ name: l.name, color: l.color })),
      authorName: issue.createdBy.name,
      authorAvatarUrl: issue.createdBy.avatarUrl,
      commentCount: issue.commentCount,
      createdAt: this.formatDate(issue.createdAt),
      updatedAt: this.formatRelativeDate(issue.updatedAt),
      canEdit: permissionManager.canEditIssue(issue),
      canDelete: permissionManager.canDeleteIssue(issue),
    };
  }

  private findIssueById(issueId: string): IssueListItemViewModel | undefined {
    return this.viewModel.issues.find((i) => i.id === issueId);
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  private formatRelativeDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;

    return this.formatDate(date);
  }

  private createInitialViewModel(): IssueListViewModel {
    const permissionManager = getPermissionManager();

    return {
      issues: [],
      isLoading: false,
      error: null,
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        hasMore: false,
      },
      filters: {
        state: 'open',
        labels: [],
        search: '',
        assignee: null,
      },
      availableAssignees: [],
      canCreateIssue: permissionManager.canCreateIssue(),
    };
  }

  private updateViewModel(updates: Partial<IssueListViewModel>): void {
    this.viewModel = { ...this.viewModel, ...updates };
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback(this.viewModel);
      } catch (error) {
        console.error('Error in IssueListPresenter subscriber:', error);
      }
    }
  }
}
