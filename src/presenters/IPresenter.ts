/**
 * Base Presenter Interfaces
 * Defines the skin-agnostic presentation layer contracts
 */

import type { Project, IssueQuery } from '@/models';

/**
 * View model for displaying an issue in a list
 */
export interface IssueListItemViewModel {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly state: 'open' | 'closed';
  readonly priority?: 'low' | 'medium' | 'high' | 'critical' | undefined;
  readonly labels: readonly { name: string; color: string }[];
  readonly authorName: string;
  readonly authorAvatarUrl?: string | undefined;
  readonly commentCount: number;
  readonly createdAt: string; // Formatted date string
  readonly updatedAt: string; // Formatted date string

  // Permission flags
  readonly canEdit: boolean;
  readonly canDelete: boolean;
}

/**
 * View model for displaying issue details
 */
export interface IssueDetailViewModel {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly bodyHtml?: string | undefined; // Rendered markdown
  readonly state: 'open' | 'closed';
  readonly priority?: 'low' | 'medium' | 'high' | 'critical' | undefined;
  readonly labels: readonly { id: string; name: string; color: string }[];
  readonly author: {
    readonly id: string;
    readonly name: string;
    readonly avatarUrl?: string | undefined;
  };
  readonly assignees: readonly {
    readonly id: string;
    readonly name: string;
    readonly avatarUrl?: string | undefined;
  }[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt?: string | undefined;
  readonly attachments: readonly {
    readonly id: string;
    readonly filename: string;
    readonly url: string;
    readonly thumbnailUrl?: string | undefined;
    readonly isImage: boolean;
  }[];

  // Permission flags
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canAddComment: boolean;
}

/**
 * View model for a comment
 */
export interface CommentViewModel {
  readonly id: string;
  readonly body: string;
  readonly bodyHtml?: string | undefined;
  readonly author: {
    readonly id: string;
    readonly name: string;
    readonly avatarUrl?: string | undefined;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isEdited: boolean;

  // Permission flags
  readonly canEdit: boolean;
  readonly canDelete: boolean;
}

/**
 * View model for the issue list view
 */
export interface IssueListViewModel {
  readonly issues: readonly IssueListItemViewModel[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly hasMore: boolean;
  };
  readonly filters: {
    readonly state: 'open' | 'closed' | 'all';
    readonly labels: readonly string[];
    readonly search: string;
  };
  readonly canCreateIssue: boolean;
}

/**
 * View model for the create/edit issue form
 */
export interface IssueFormViewModel {
  readonly isEditing: boolean;
  readonly issue?: {
    readonly id: string;
    readonly title: string;
    readonly body: string;
    readonly labels: readonly string[];
    readonly priority?: 'low' | 'medium' | 'high' | 'critical' | undefined;
  } | undefined;
  readonly availableLabels: readonly { id: string; name: string; color: string }[];
  readonly isSubmitting: boolean;
  readonly errors: Readonly<Record<string, string>>;
}

/**
 * Presenter interface for the issue list view
 */
export interface IIssueListPresenter {
  /**
   * Get the current view model
   */
  getViewModel(): IssueListViewModel;

  /**
   * Subscribe to view model changes
   */
  subscribe(callback: (viewModel: IssueListViewModel) => void): () => void;

  /**
   * Load issues with optional query
   */
  loadIssues(query?: IssueQuery): Promise<void>;

  /**
   * Load next page of issues
   */
  loadMore(): Promise<void>;

  /**
   * Refresh the current list
   */
  refresh(): Promise<void>;

  /**
   * Update filters
   */
  setFilter(filter: Partial<{ state: 'open' | 'closed' | 'all'; labels: string[]; search: string }>): void;

  /**
   * Select an issue (navigate to detail)
   */
  selectIssue(issueId: string): void;

  /**
   * Navigate to create issue
   */
  createIssue(): void;
}

/**
 * Presenter interface for the issue detail view
 */
export interface IIssueDetailPresenter {
  /**
   * Get the current view model
   */
  getViewModel(): IssueDetailViewModel | null;

  /**
   * Get comments view model
   */
  getComments(): readonly CommentViewModel[];

  /**
   * Subscribe to view model changes
   */
  subscribe(callback: (viewModel: IssueDetailViewModel | null, comments: readonly CommentViewModel[]) => void): () => void;

  /**
   * Load issue details
   */
  loadIssue(issueId: string): Promise<void>;

  /**
   * Load comments for the issue
   */
  loadComments(): Promise<void>;

  /**
   * Close the issue
   */
  closeIssue(): Promise<void>;

  /**
   * Reopen the issue
   */
  reopenIssue(): Promise<void>;

  /**
   * Delete the issue
   */
  deleteIssue(): Promise<void>;

  /**
   * Add a comment
   */
  addComment(body: string): Promise<void>;

  /**
   * Edit a comment
   */
  editComment(commentId: string, body: string): Promise<void>;

  /**
   * Delete a comment
   */
  deleteComment(commentId: string): Promise<void>;

  /**
   * Navigate to edit issue
   */
  editIssue(): void;

  /**
   * Go back to list
   */
  goBack(): void;
}

/**
 * Presenter interface for issue create/edit form
 */
export interface IIssueFormPresenter {
  /**
   * Get the current view model
   */
  getViewModel(): IssueFormViewModel;

  /**
   * Subscribe to view model changes
   */
  subscribe(callback: (viewModel: IssueFormViewModel) => void): () => void;

  /**
   * Initialize for creating a new issue
   */
  initCreate(): Promise<void>;

  /**
   * Initialize for editing an existing issue
   */
  initEdit(issueId: string): Promise<void>;

  /**
   * Update form field
   */
  updateField(field: 'title' | 'body' | 'labels' | 'priority', value: unknown): void;

  /**
   * Validate the form
   */
  validate(): boolean;

  /**
   * Submit the form
   */
  submit(): Promise<void>;

  /**
   * Cancel and go back
   */
  cancel(): void;
}

/**
 * Main widget presenter interface
 */
export interface IWidgetPresenter {
  /**
   * Current view state
   */
  readonly viewState: 'list' | 'detail' | 'create' | 'edit';

  /**
   * Subscribe to view state changes
   */
  subscribeToViewState(callback: (state: 'list' | 'detail' | 'create' | 'edit') => void): () => void;

  /**
   * Get the current project
   */
  getCurrentProject(): Project | null;

  /**
   * Get available projects
   */
  getProjects(): readonly Project[];

  /**
   * Switch to a different project
   */
  switchProject(projectId: string): Promise<void>;

  /**
   * Navigate to a view
   */
  navigateTo(view: 'list' | 'detail' | 'create' | 'edit', params?: { issueId?: string }): void;

  /**
   * Get connection status
   */
  isConnected(): boolean;

  /**
   * Get online status
   */
  isOnline(): boolean;

  /**
   * Get pending operations count (offline queue)
   */
  getPendingOperationsCount(): number;
}
