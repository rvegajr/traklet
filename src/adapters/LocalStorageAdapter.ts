/**
 * LocalStorageAdapter - In-memory/localStorage adapter for development and testing
 * Implements full CRUD operations without any backend dependency
 */

import { BaseAdapter } from './BaseAdapter';
import type {
  AdapterConfig,
  ConnectionResult,
  IIssueDeleter,
  ICommentManager,
  ILabelReader,
} from '@/contracts';
import type {
  Issue,
  IssueQuery,
  PaginatedResult,
  CreateIssueDTO,
  UpdateIssueDTO,
  Comment,
  CreateCommentDTO,
  UpdateCommentDTO,
  Label,
  User,
  Project,
} from '@/models';

interface StoredData {
  issues: Map<string, Map<string, Issue>>;
  comments: Map<string, Comment[]>;
  labels: Map<string, Label[]>;
  issueCounter: Map<string, number>;
}

export class LocalStorageAdapter
  extends BaseAdapter
  implements IIssueDeleter, ICommentManager, ILabelReader
{
  readonly type = 'localStorage' as const;

  private data: StoredData = {
    issues: new Map(),
    comments: new Map(),
    labels: new Map(),
    issueCounter: new Map(),
  };

  private storageKey = 'traklet_data';
  private useLocalStorage: boolean;

  constructor(useLocalStorage = false) {
    super();
    this.useLocalStorage = useLocalStorage;

    this.capabilities = {
      canDeleteIssues: true,
      hasAttachments: false,
      hasPriority: true,
      hasLabels: true,
      hasAssignees: true,
      hasComments: true,
      hasSearch: true,
      maxAttachmentSize: 0,
      allowedMimeTypes: [],
    };
  }

  protected async doConnect(config: AdapterConfig): Promise<ConnectionResult> {
    // Initialize storage for each project
    for (const project of config.projects) {
      if (!this.data.issues.has(project.id)) {
        this.data.issues.set(project.id, new Map());
        this.data.issueCounter.set(project.id, 0);
        this.data.labels.set(project.id, this.getDefaultLabels());
      }
    }

    // Load from localStorage if enabled
    if (this.useLocalStorage && typeof localStorage !== 'undefined') {
      this.loadFromStorage();
    }

    const projects: Project[] = config.projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
    }));

    return {
      success: true,
      projects,
    };
  }

  protected async doDisconnect(): Promise<void> {
    // Save to localStorage before disconnect
    if (this.useLocalStorage && typeof localStorage !== 'undefined') {
      this.saveToStorage();
    }
  }

  protected async doValidateToken(_token: string): Promise<boolean> {
    // LocalStorage adapter doesn't validate tokens
    return true;
  }

  // IIssueReader implementation

  async getIssues(projectId: string, query?: IssueQuery): Promise<PaginatedResult<Issue>> {
    this.ensureConnected();

    const projectIssues = this.data.issues.get(projectId);
    if (!projectIssues) {
      return { items: [], total: 0, page: 1, limit: 50, hasMore: false };
    }

    let issues = Array.from(projectIssues.values());

    // Apply filters
    if (query?.state && query.state !== 'open' && query.state !== 'closed') {
      // 'all' or undefined - no filter
    } else if (query?.state) {
      issues = issues.filter((i) => i.state === query.state);
    }

    if (query?.labels && query.labels.length > 0) {
      issues = issues.filter((issue) =>
        query.labels?.some((label) => issue.labels.some((l) => l.name === label))
      );
    }

    if (query?.assignee) {
      issues = issues.filter((issue) =>
        issue.assignees.some(
          (a) => a.id === query.assignee || a.email === query.assignee
        )
      );
    }

    if (query?.creator) {
      issues = issues.filter(
        (issue) =>
          issue.createdBy.id === query.creator ||
          issue.createdBy.email === query.creator
      );
    }

    if (query?.search) {
      const searchLower = query.search.toLowerCase();
      issues = issues.filter(
        (issue) =>
          issue.title.toLowerCase().includes(searchLower) ||
          issue.body.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    const sortField = query?.sort ?? 'created';
    const sortOrder = query?.order ?? 'desc';

    issues.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'created':
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
        case 'updated':
          comparison = a.updatedAt.getTime() - b.updatedAt.getTime();
          break;
        case 'priority':
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          const aPriority = a.priority ? priorityOrder[a.priority] : 0;
          const bPriority = b.priority ? priorityOrder[b.priority] : 0;
          comparison = aPriority - bPriority;
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Apply pagination
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const start = (page - 1) * limit;
    const paginatedIssues = issues.slice(start, start + limit);

    return {
      items: paginatedIssues,
      total: issues.length,
      page,
      limit,
      hasMore: start + limit < issues.length,
    };
  }

  async getIssue(projectId: string, issueId: string): Promise<Issue> {
    this.ensureConnected();

    const projectIssues = this.data.issues.get(projectId);
    const issue = projectIssues?.get(issueId);

    if (!issue) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    return issue;
  }

  async issueExists(projectId: string, issueId: string): Promise<boolean> {
    this.ensureConnected();

    const projectIssues = this.data.issues.get(projectId);
    return projectIssues?.has(issueId) ?? false;
  }

  // IIssueWriter implementation

  async createIssue(projectId: string, dto: CreateIssueDTO): Promise<Issue> {
    this.ensureConnected();
    this.getProjectConfig(projectId);

    let projectIssues = this.data.issues.get(projectId);
    if (!projectIssues) {
      projectIssues = new Map();
      this.data.issues.set(projectId, projectIssues);
    }

    const counter = (this.data.issueCounter.get(projectId) ?? 0) + 1;
    this.data.issueCounter.set(projectId, counter);

    const now = new Date();
    const issueId = `issue-${projectId}-${counter}`;

    const labels = this.resolveLabels(projectId, dto.labels ?? []);
    const currentUser = this.getCurrentUser();

    const issue: Issue = {
      id: issueId,
      number: counter,
      title: dto.title,
      body: dto.body,
      state: 'open',
      priority: dto.priority,
      labels,
      createdBy: currentUser,
      assignees: [],
      createdAt: now,
      updatedAt: now,
      attachments: [],
      commentCount: 0,
      projectId,
    };

    projectIssues.set(issueId, issue);
    this.data.comments.set(issueId, []);

    this.persistIfEnabled();

    return issue;
  }

  async updateIssue(
    projectId: string,
    issueId: string,
    dto: UpdateIssueDTO
  ): Promise<Issue> {
    this.ensureConnected();

    const projectIssues = this.data.issues.get(projectId);
    const existing = projectIssues?.get(issueId);

    if (!existing) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    const now = new Date();
    const labels = dto.labels
      ? this.resolveLabels(projectId, dto.labels)
      : existing.labels;

    const updated: Issue = {
      ...existing,
      title: dto.title ?? existing.title,
      body: dto.body ?? existing.body,
      state: dto.state ?? existing.state,
      priority: dto.priority ?? existing.priority,
      labels,
      updatedAt: now,
      closedAt: dto.state === 'closed' && existing.state !== 'closed' ? now : existing.closedAt,
    };

    projectIssues?.set(issueId, updated);
    this.persistIfEnabled();

    return updated;
  }

  // IIssueDeleter implementation

  async deleteIssue(projectId: string, issueId: string): Promise<void> {
    this.ensureConnected();

    const projectIssues = this.data.issues.get(projectId);
    if (!projectIssues?.has(issueId)) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    projectIssues.delete(issueId);
    this.data.comments.delete(issueId);
    this.persistIfEnabled();
  }

  // ICommentManager implementation

  async getComments(_projectId: string, issueId: string): Promise<readonly Comment[]> {
    this.ensureConnected();
    return this.data.comments.get(issueId) ?? [];
  }

  async addComment(
    projectId: string,
    issueId: string,
    dto: CreateCommentDTO
  ): Promise<Comment> {
    this.ensureConnected();

    const projectIssues = this.data.issues.get(projectId);
    const issue = projectIssues?.get(issueId);

    if (!issue) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    const comments = this.data.comments.get(issueId) ?? [];
    const now = new Date();
    const commentId = `comment-${issueId}-${comments.length + 1}`;

    const comment: Comment = {
      id: commentId,
      body: dto.body,
      author: this.getCurrentUser(),
      createdAt: now,
      updatedAt: now,
      attachments: [],
    };

    comments.push(comment);
    this.data.comments.set(issueId, comments);

    // Update comment count
    const updatedIssue: Issue = {
      ...issue,
      commentCount: comments.length,
      updatedAt: now,
    };
    projectIssues?.set(issueId, updatedIssue);

    this.persistIfEnabled();

    return comment;
  }

  async updateComment(
    _projectId: string,
    issueId: string,
    commentId: string,
    dto: UpdateCommentDTO
  ): Promise<Comment> {
    this.ensureConnected();

    const comments = this.data.comments.get(issueId);
    const index = comments?.findIndex((c) => c.id === commentId) ?? -1;

    if (!comments || index === -1) {
      throw new Error(`Comment not found: ${commentId}`);
    }

    const existing = comments[index];
    if (!existing) {
      throw new Error(`Comment not found: ${commentId}`);
    }

    const updated: Comment = {
      ...existing,
      body: dto.body,
      updatedAt: new Date(),
    };

    comments[index] = updated;
    this.persistIfEnabled();

    return updated;
  }

  async deleteComment(_projectId: string, issueId: string, commentId: string): Promise<void> {
    this.ensureConnected();

    const comments = this.data.comments.get(issueId);
    if (!comments) {
      throw new Error(`Comments not found for issue: ${issueId}`);
    }

    const index = comments.findIndex((c) => c.id === commentId);
    if (index === -1) {
      throw new Error(`Comment not found: ${commentId}`);
    }

    comments.splice(index, 1);
    this.persistIfEnabled();
  }

  // ILabelReader implementation

  async getLabels(projectId: string): Promise<readonly Label[]> {
    this.ensureConnected();
    return this.data.labels.get(projectId) ?? [];
  }

  // Helper methods

  private getCurrentUser(): User {
    return {
      id: 'local-user',
      name: 'Local User',
      email: 'local@traklet.dev',
    };
  }

  private getDefaultLabels(): Label[] {
    return [
      { id: 'label-bug', name: 'bug', color: '#d73a4a', description: 'Something is broken' },
      { id: 'label-feature', name: 'feature', color: '#0075ca', description: 'New feature request' },
      { id: 'label-enhancement', name: 'enhancement', color: '#a2eeef', description: 'Improvement' },
      { id: 'label-priority-high', name: 'priority-high', color: '#ff0000', description: 'High priority' },
      { id: 'label-priority-low', name: 'priority-low', color: '#008000', description: 'Low priority' },
    ];
  }

  private resolveLabels(projectId: string, labelNames: readonly string[]): Label[] {
    const projectLabels = this.data.labels.get(projectId) ?? [];
    return labelNames
      .map((name) => projectLabels.find((l) => l.name === name))
      .filter((l): l is Label => l !== undefined);
  }

  private persistIfEnabled(): void {
    if (this.useLocalStorage && typeof localStorage !== 'undefined') {
      this.saveToStorage();
    }
  }

  private saveToStorage(): void {
    const serializable = {
      issues: Object.fromEntries(
        Array.from(this.data.issues.entries()).map(([projectId, issues]) => [
          projectId,
          Object.fromEntries(
            Array.from(issues.entries()).map(([id, issue]) => [
              id,
              {
                ...issue,
                createdAt: issue.createdAt.toISOString(),
                updatedAt: issue.updatedAt.toISOString(),
                closedAt: issue.closedAt?.toISOString(),
              },
            ])
          ),
        ])
      ),
      comments: Object.fromEntries(
        Array.from(this.data.comments.entries()).map(([issueId, comments]) => [
          issueId,
          comments.map((c) => ({
            ...c,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
          })),
        ])
      ),
      labels: Object.fromEntries(this.data.labels.entries()),
      issueCounter: Object.fromEntries(this.data.issueCounter.entries()),
    };

    localStorage.setItem(this.storageKey, JSON.stringify(serializable));
  }

  private loadFromStorage(): void {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);

      // Restore issues
      if (parsed.issues) {
        for (const [projectId, issues] of Object.entries(parsed.issues)) {
          const issueMap = new Map<string, Issue>();
          for (const [id, issue] of Object.entries(issues as Record<string, unknown>)) {
            const typedIssue = issue as Issue & {
              createdAt: string;
              updatedAt: string;
              closedAt?: string;
            };
            issueMap.set(id, {
              ...typedIssue,
              createdAt: new Date(typedIssue.createdAt),
              updatedAt: new Date(typedIssue.updatedAt),
              closedAt: typedIssue.closedAt ? new Date(typedIssue.closedAt) : undefined,
            } as Issue);
          }
          this.data.issues.set(projectId, issueMap);
        }
      }

      // Restore comments
      if (parsed.comments) {
        for (const [issueId, comments] of Object.entries(parsed.comments)) {
          this.data.comments.set(
            issueId,
            (comments as Array<Comment & { createdAt: string; updatedAt: string }>).map((c) => ({
              ...c,
              createdAt: new Date(c.createdAt),
              updatedAt: new Date(c.updatedAt),
            }))
          );
        }
      }

      // Restore labels
      if (parsed.labels) {
        for (const [projectId, labels] of Object.entries(parsed.labels)) {
          this.data.labels.set(projectId, labels as Label[]);
        }
      }

      // Restore counters
      if (parsed.issueCounter) {
        for (const [projectId, counter] of Object.entries(parsed.issueCounter)) {
          this.data.issueCounter.set(projectId, counter as number);
        }
      }
    } catch {
      // Ignore parse errors, start fresh
    }
  }

  /**
   * Clear all data (useful for testing)
   */
  clearAllData(): void {
    this.data = {
      issues: new Map(),
      comments: new Map(),
      labels: new Map(),
      issueCounter: new Map(),
    };

    if (this.useLocalStorage && typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.storageKey);
    }
  }
}
