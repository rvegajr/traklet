/**
 * GitHubAdapter - GitHub Issues adapter
 * Maps GitHub Issues to Traklet's unified Issue model
 * Uses GitHub REST API v3
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
  IssuePriority,
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

/** GitHub API response types */
interface GitHubUser {
  readonly login: string;
  readonly id: number;
  readonly avatar_url: string;
}

interface GitHubLabel {
  readonly id: number;
  readonly name: string;
  readonly color: string;
  readonly description: string | null;
}

interface GitHubIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
  readonly state: string;
  readonly labels: readonly GitHubLabel[];
  readonly user: GitHubUser;
  readonly assignees: readonly GitHubUser[];
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at: string | null;
  readonly comments: number;
  readonly html_url: string;
  readonly pull_request?: unknown;
}

interface GitHubComment {
  readonly id: number;
  readonly body: string;
  readonly user: GitHubUser;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Priority label prefix pattern */
const PRIORITY_LABEL_PREFIX = 'priority-';

/** Extract priority from GitHub labels */
function extractPriority(labels: readonly GitHubLabel[]): IssuePriority | undefined {
  for (const label of labels) {
    if (label.name.startsWith(PRIORITY_LABEL_PREFIX)) {
      const value = label.name.slice(PRIORITY_LABEL_PREFIX.length);
      if (value === 'critical' || value === 'high' || value === 'medium' || value === 'low') {
        return value;
      }
    }
  }
  return undefined;
}

export class GitHubAdapter
  extends BaseAdapter
  implements IIssueDeleter, ICommentManager, ILabelReader
{
  readonly type = 'github' as const;

  private baseUrl = 'https://api.github.com';
  /** Map of projectId -> { owner, repo } */
  private projectRepos = new Map<string, { owner: string; repo: string }>();

  constructor() {
    super();

    this.capabilities = {
      canDeleteIssues: false,
      hasAttachments: false,
      hasPriority: false,
      hasLabels: true,
      hasAssignees: true,
      hasComments: true,
      hasSearch: true,
      maxAttachmentSize: 0,
      allowedMimeTypes: [],
    };
  }

  // ============================================
  // Connection Lifecycle
  // ============================================

  protected async doConnect(config: AdapterConfig): Promise<ConnectionResult> {
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl.replace(/\/$/, '');
    }

    const token = config.token ?? (config.getToken ? await config.getToken() : undefined);
    if (!token) {
      return { success: false, error: 'Authentication token is required' };
    }

    const projects: Project[] = [];

    for (const projectConfig of config.projects) {
      const identifier = projectConfig.identifier ?? projectConfig.id;
      const parts = identifier.split('/');

      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return {
          success: false,
          error: `Invalid project identifier '${identifier}': must be in owner/repo format`,
        };
      }

      const [owner, repo] = parts as [string, string];

      try {
        const repoData = await this.fetchGh<{
          name: string;
          full_name: string;
          description: string | null;
          html_url: string;
        }>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
          token
        );

        this.projectRepos.set(projectConfig.id, { owner, repo });

        projects.push({
          id: projectConfig.id,
          name: repoData.name,
          description: repoData.description ?? undefined,
          url: repoData.html_url,
        });
      } catch (error) {
        return {
          success: false,
          error: `Failed to connect to project '${identifier}': ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    return { success: true, projects };
  }

  protected async doDisconnect(): Promise<void> {
    this.projectRepos.clear();
  }

  protected async doValidateToken(token: string): Promise<boolean> {
    try {
      await this.fetchGh('/user', token);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================
  // IIssueReader
  // ============================================

  async getIssues(projectId: string, query?: IssueQuery): Promise<PaginatedResult<Issue>> {
    this.ensureConnected();

    const { owner, repo } = this.getOwnerRepo(projectId);
    const token = await this.requireToken();

    const params = new URLSearchParams();

    if (query?.state) {
      params.set('state', query.state);
    }

    if (query?.labels && query.labels.length > 0) {
      params.set('labels', query.labels.join(','));
    }

    if (query?.assignee) {
      params.set('assignee', query.assignee);
    }

    if (query?.creator) {
      params.set('creator', query.creator);
    }

    const sort = query?.sort === 'priority' ? 'created' : (query?.sort ?? 'created');
    params.set('sort', sort);
    params.set('direction', query?.order ?? 'desc');

    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    params.set('per_page', String(limit));
    params.set('page', String(page));

    const ghIssues = await this.fetchGh<GitHubIssue[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${params.toString()}`,
      token
    );

    // Filter out pull requests (GitHub Issues API returns PRs too)
    const issuesOnly = ghIssues.filter((i) => !i.pull_request);

    const items = issuesOnly.map((i) => this.mapGitHubIssue(i, projectId));

    return {
      items,
      total: items.length,
      page,
      limit,
      hasMore: ghIssues.length >= limit,
    };
  }

  async getIssue(projectId: string, issueId: string): Promise<Issue> {
    this.ensureConnected();

    const { owner, repo } = this.getOwnerRepo(projectId);
    const token = await this.requireToken();

    const ghIssue = await this.fetchGh<GitHubIssue>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueId}`,
      token
    );

    return this.mapGitHubIssue(ghIssue, projectId);
  }

  async issueExists(projectId: string, issueId: string): Promise<boolean> {
    try {
      await this.getIssue(projectId, issueId);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================
  // IIssueWriter
  // ============================================

  async createIssue(projectId: string, dto: CreateIssueDTO): Promise<Issue> {
    this.ensureConnected();

    const { owner, repo } = this.getOwnerRepo(projectId);
    const token = await this.requireToken();

    const body: Record<string, unknown> = {
      title: dto.title,
      body: dto.body,
    };

    if (dto.labels && dto.labels.length > 0) {
      body['labels'] = dto.labels;
    }

    if (dto.assignees && dto.assignees.length > 0) {
      body['assignees'] = dto.assignees;
    }

    const ghIssue = await this.fetchGh<GitHubIssue>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
      token,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    return this.mapGitHubIssue(ghIssue, projectId);
  }

  async updateIssue(projectId: string, issueId: string, dto: UpdateIssueDTO): Promise<Issue> {
    this.ensureConnected();

    const { owner, repo } = this.getOwnerRepo(projectId);
    const token = await this.requireToken();

    const body: Record<string, unknown> = {};

    if (dto.title !== undefined) body['title'] = dto.title;
    if (dto.body !== undefined) body['body'] = dto.body;
    if (dto.state !== undefined) body['state'] = dto.state;
    if (dto.labels !== undefined) body['labels'] = dto.labels;
    if (dto.assignees !== undefined) body['assignees'] = dto.assignees;

    if (Object.keys(body).length === 0) {
      return this.getIssue(projectId, issueId);
    }

    const ghIssue = await this.fetchGh<GitHubIssue>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueId}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      }
    );

    return this.mapGitHubIssue(ghIssue, projectId);
  }

  // ============================================
  // IIssueDeleter (GitHub can't delete, so we close)
  // ============================================

  async deleteIssue(projectId: string, issueId: string): Promise<void> {
    this.ensureConnected();

    const { owner, repo } = this.getOwnerRepo(projectId);
    const token = await this.requireToken();

    await this.fetchGh(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueId}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' }),
      }
    );
  }

  // ============================================
  // ICommentManager
  // ============================================

  async getComments(projectId: string, issueId: string): Promise<readonly Comment[]> {
    this.ensureConnected();

    const { owner, repo } = this.getOwnerRepo(projectId);
    const token = await this.requireToken();

    const ghComments = await this.fetchGh<GitHubComment[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueId}/comments`,
      token
    );

    return ghComments.map((c) => this.mapGitHubComment(c));
  }

  async addComment(projectId: string, issueId: string, dto: CreateCommentDTO): Promise<Comment> {
    this.ensureConnected();

    const { owner, repo } = this.getOwnerRepo(projectId);
    const token = await this.requireToken();

    const ghComment = await this.fetchGh<GitHubComment>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueId}/comments`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ body: dto.body }),
      }
    );

    return this.mapGitHubComment(ghComment);
  }

  async updateComment(
    projectId: string,
    _issueId: string,
    commentId: string,
    dto: UpdateCommentDTO
  ): Promise<Comment> {
    this.ensureConnected();

    const { owner, repo } = this.getOwnerRepo(projectId);
    const token = await this.requireToken();

    const ghComment = await this.fetchGh<GitHubComment>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/comments/${commentId}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify({ body: dto.body }),
      }
    );

    return this.mapGitHubComment(ghComment);
  }

  async deleteComment(projectId: string, _issueId: string, commentId: string): Promise<void> {
    this.ensureConnected();

    const { owner, repo } = this.getOwnerRepo(projectId);
    const token = await this.requireToken();

    await this.fetchGh(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/comments/${commentId}`,
      token,
      { method: 'DELETE' }
    );
  }

  // ============================================
  // ILabelReader
  // ============================================

  async getLabels(projectId: string): Promise<readonly Label[]> {
    this.ensureConnected();

    const { owner, repo } = this.getOwnerRepo(projectId);
    const token = await this.requireToken();

    const ghLabels = await this.fetchGh<GitHubLabel[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`,
      token
    );

    return ghLabels.map((l) => ({
      id: String(l.id),
      name: l.name,
      color: `#${l.color}`,
      description: l.description ?? undefined,
    }));
  }

  // ============================================
  // Private Helpers
  // ============================================

  private getOwnerRepo(projectId: string): { owner: string; repo: string } {
    this.ensureConnected();
    const entry = this.projectRepos.get(projectId);
    if (!entry) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return entry;
  }

  private async requireToken(): Promise<string> {
    const token = await this.getToken();
    if (!token) {
      throw new Error('Authentication token is not available');
    }
    return token;
  }

  private async fetchGh<T>(
    path: string,
    token: string,
    init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      ...(init?.headers ?? {}),
    };

    if (init?.method === 'POST' || init?.method === 'PATCH') {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`
      );
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  private mapGitHubIssue(ghIssue: GitHubIssue, projectId: string): Issue {
    return {
      id: String(ghIssue.number),
      number: ghIssue.number,
      title: ghIssue.title,
      body: ghIssue.body ?? '',
      state: ghIssue.state === 'open' ? 'open' : 'closed',
      priority: extractPriority(ghIssue.labels),
      labels: ghIssue.labels.map((l) => ({
        id: String(l.id),
        name: l.name,
        color: `#${l.color}`,
        description: l.description ?? undefined,
      })),
      createdBy: this.mapGitHubUser(ghIssue.user),
      assignees: ghIssue.assignees.map((u) => this.mapGitHubUser(u)),
      createdAt: new Date(ghIssue.created_at),
      updatedAt: new Date(ghIssue.updated_at),
      closedAt: ghIssue.closed_at ? new Date(ghIssue.closed_at) : undefined,
      attachments: [],
      commentCount: ghIssue.comments,
      projectId,
      metadata: {
        htmlUrl: ghIssue.html_url,
      },
    };
  }

  private mapGitHubUser(user: GitHubUser): User {
    return {
      id: String(user.id),
      name: user.login,
      username: user.login,
      avatarUrl: user.avatar_url,
      email: undefined,
    };
  }

  private mapGitHubComment(comment: GitHubComment): Comment {
    return {
      id: String(comment.id),
      body: comment.body,
      author: this.mapGitHubUser(comment.user),
      createdAt: new Date(comment.created_at),
      updatedAt: new Date(comment.updated_at),
      attachments: [],
    };
  }
}
