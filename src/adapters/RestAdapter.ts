/**
 * RestAdapter - Generic REST API adapter
 * Works with any REST API that follows Traklet's URL conventions.
 * Minimal mapping needed since the API is assumed to return Traklet-shaped models.
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
} from '@/models';

/** Raw issue from the REST API (dates as strings) */
interface RawIssue {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly state: 'open' | 'closed';
  readonly priority?: string;
  readonly labels: readonly Label[];
  readonly createdBy: { readonly id: string; readonly name: string; readonly email?: string };
  readonly assignees: readonly { readonly id: string; readonly name: string; readonly email?: string }[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt?: string;
  readonly attachments: readonly unknown[];
  readonly commentCount: number;
  readonly projectId: string;
  readonly metadata?: Record<string, unknown>;
}

/** Raw comment from the REST API (dates as strings) */
interface RawComment {
  readonly id: string;
  readonly body: string;
  readonly author: { readonly id: string; readonly name: string; readonly email?: string };
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attachments: readonly unknown[];
}

export class RestAdapter
  extends BaseAdapter
  implements IIssueDeleter, ICommentManager, ILabelReader
{
  readonly type = 'rest' as const;

  private apiBaseUrl = '';
  private customHeaders: Record<string, string> = {};

  constructor() {
    super();

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

  // ============================================
  // Connection Lifecycle
  // ============================================

  protected async doConnect(config: AdapterConfig): Promise<ConnectionResult> {
    if (!config.baseUrl) {
      return { success: false, error: 'baseUrl is required for REST adapter' };
    }

    const token = config.token ?? (config.getToken ? await config.getToken() : undefined);
    if (!token) {
      return { success: false, error: 'Authentication token is required' };
    }

    this.apiBaseUrl = config.baseUrl.replace(/\/$/, '');

    // Read custom headers from options
    if (config.options?.['headers'] && typeof config.options['headers'] === 'object') {
      this.customHeaders = config.options['headers'] as Record<string, string>;
    }

    // Validate connection by fetching each configured project
    const projects: { id: string; name: string; description?: string; url?: string }[] = [];

    for (const projectConfig of config.projects) {
      const projectId = projectConfig.identifier ?? projectConfig.id;

      try {
        const response = await this.fetchRest<{ id: string; name: string; description?: string }>(
          `/projects/${encodeURIComponent(projectId)}`,
          token
        );

        projects.push({
          id: projectConfig.id,
          name: response.name,
          ...(response.description !== undefined ? { description: response.description } : {}),
          url: `${this.apiBaseUrl}/projects/${encodeURIComponent(projectId)}`,
        });
      } catch (error) {
        return {
          success: false,
          error: `Failed to connect to project '${projectId}': ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    return { success: true, projects };
  }

  protected async doDisconnect(): Promise<void> {
    this.apiBaseUrl = '';
    this.customHeaders = {};
  }

  protected async doValidateToken(token: string): Promise<boolean> {
    try {
      // Try a simple authenticated request
      const projectId = this.config?.projects[0]?.identifier ?? this.config?.projects[0]?.id;
      const path = projectId
        ? `/projects/${encodeURIComponent(projectId)}`
        : '/health';
      await this.fetchRest(path, token);
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
    this.getProjectConfig(projectId);
    const token = await this.requireToken();

    const params = new URLSearchParams();
    if (query?.state) params.set('state', query.state);
    if (query?.labels && query.labels.length > 0) params.set('labels', query.labels.join(','));
    if (query?.assignee) params.set('assignee', query.assignee);
    if (query?.search) params.set('search', query.search);
    if (query?.sort) params.set('sort', query.sort);
    if (query?.order) params.set('order', query.order);
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));

    const qs = params.toString();
    const path = `/projects/${encodeURIComponent(projectId)}/issues${qs ? `?${qs}` : ''}`;

    const result = await this.fetchRest<{
      items: readonly RawIssue[];
      total: number;
      page: number;
      limit: number;
      hasMore: boolean;
    }>(path, token);

    return {
      items: result.items.map((raw) => this.mapRawIssue(raw)),
      total: result.total,
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore,
    };
  }

  async getIssue(projectId: string, issueId: string): Promise<Issue> {
    this.ensureConnected();
    this.getProjectConfig(projectId);
    const token = await this.requireToken();

    const raw = await this.fetchRest<RawIssue>(
      `/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}`,
      token
    );

    return this.mapRawIssue(raw);
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
    this.getProjectConfig(projectId);
    const token = await this.requireToken();

    const payload: Record<string, unknown> = {
      title: dto.title,
      body: dto.body,
    };

    if (dto.labels && dto.labels.length > 0) {
      payload['labels'] = dto.labels;
    }

    if (dto.assignees && dto.assignees.length > 0) {
      payload['assignees'] = dto.assignees;
    }

    if (dto.priority) {
      payload['priority'] = dto.priority;
    }

    const raw = await this.fetchRest<RawIssue>(
      `/projects/${encodeURIComponent(projectId)}/issues`,
      token,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );

    return this.mapRawIssue(raw);
  }

  async updateIssue(projectId: string, issueId: string, dto: UpdateIssueDTO): Promise<Issue> {
    this.ensureConnected();
    this.getProjectConfig(projectId);
    const token = await this.requireToken();

    const payload: Record<string, unknown> = {};

    if (dto.title !== undefined) payload['title'] = dto.title;
    if (dto.body !== undefined) payload['body'] = dto.body;
    if (dto.state !== undefined) payload['state'] = dto.state;
    if (dto.labels !== undefined) payload['labels'] = dto.labels;
    if (dto.assignees !== undefined) payload['assignees'] = dto.assignees;
    if (dto.priority !== undefined) payload['priority'] = dto.priority;

    if (Object.keys(payload).length === 0) {
      return this.getIssue(projectId, issueId);
    }

    const raw = await this.fetchRest<RawIssue>(
      `/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );

    return this.mapRawIssue(raw);
  }

  // ============================================
  // IIssueDeleter
  // ============================================

  async deleteIssue(projectId: string, issueId: string): Promise<void> {
    this.ensureConnected();
    this.getProjectConfig(projectId);
    const token = await this.requireToken();

    await this.fetchRest(
      `/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}`,
      token,
      { method: 'DELETE' }
    );
  }

  // ============================================
  // ICommentManager
  // ============================================

  async getComments(projectId: string, issueId: string): Promise<readonly Comment[]> {
    this.ensureConnected();
    this.getProjectConfig(projectId);
    const token = await this.requireToken();

    const rawComments = await this.fetchRest<readonly RawComment[]>(
      `/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}/comments`,
      token
    );

    return rawComments.map((raw) => this.mapRawComment(raw));
  }

  async addComment(projectId: string, issueId: string, dto: CreateCommentDTO): Promise<Comment> {
    this.ensureConnected();
    this.getProjectConfig(projectId);
    const token = await this.requireToken();

    const raw = await this.fetchRest<RawComment>(
      `/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}/comments`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ body: dto.body }),
      }
    );

    return this.mapRawComment(raw);
  }

  async updateComment(
    projectId: string,
    issueId: string,
    commentId: string,
    dto: UpdateCommentDTO
  ): Promise<Comment> {
    this.ensureConnected();
    this.getProjectConfig(projectId);
    const token = await this.requireToken();

    const raw = await this.fetchRest<RawComment>(
      `/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}/comments/${encodeURIComponent(commentId)}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify({ body: dto.body }),
      }
    );

    return this.mapRawComment(raw);
  }

  async deleteComment(projectId: string, issueId: string, commentId: string): Promise<void> {
    this.ensureConnected();
    this.getProjectConfig(projectId);
    const token = await this.requireToken();

    await this.fetchRest(
      `/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(issueId)}/comments/${encodeURIComponent(commentId)}`,
      token,
      { method: 'DELETE' }
    );
  }

  // ============================================
  // ILabelReader
  // ============================================

  async getLabels(projectId: string): Promise<readonly Label[]> {
    this.ensureConnected();
    this.getProjectConfig(projectId);
    const token = await this.requireToken();

    return this.fetchRest<readonly Label[]>(
      `/projects/${encodeURIComponent(projectId)}/labels`,
      token
    );
  }

  // ============================================
  // Private Helpers
  // ============================================

  private async requireToken(): Promise<string> {
    const token = await this.getToken();
    if (!token) {
      throw new Error('Authentication token is not available');
    }
    return token;
  }

  private async fetchRest<T>(
    path: string,
    token: string,
    init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }
  ): Promise<T> {
    const url = `${this.apiBaseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...this.customHeaders,
      ...(init?.headers ?? {}),
    };

    if ((init?.method === 'POST' || init?.method === 'PATCH') && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `REST API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`
      );
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  private mapRawIssue(raw: RawIssue): Issue {
    return {
      id: raw.id,
      number: raw.number,
      title: raw.title,
      body: raw.body,
      state: raw.state,
      priority: raw.priority as Issue['priority'],
      labels: raw.labels,
      createdBy: {
        id: raw.createdBy.id,
        name: raw.createdBy.name,
        email: raw.createdBy.email,
      },
      assignees: raw.assignees.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
      })),
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
      closedAt: raw.closedAt ? new Date(raw.closedAt) : undefined,
      attachments: [],
      commentCount: raw.commentCount,
      projectId: raw.projectId,
      metadata: raw.metadata,
    };
  }

  private mapRawComment(raw: RawComment): Comment {
    return {
      id: raw.id,
      body: raw.body,
      author: {
        id: raw.author.id,
        name: raw.author.name,
        email: raw.author.email,
      },
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
      attachments: [],
    };
  }
}
