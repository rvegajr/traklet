/**
 * AzureDevOpsAdapter - Azure DevOps Work Items adapter
 * Maps Azure DevOps Work Items to Traklet's unified Issue model
 * Uses Azure DevOps REST API v7.0
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
  IssueState,
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

/** Azure DevOps work item field references */
const FIELDS = {
  ID: 'System.Id',
  TITLE: 'System.Title',
  DESCRIPTION: 'System.Description',
  STATE: 'System.State',
  WORK_ITEM_TYPE: 'System.WorkItemType',
  CREATED_BY: 'System.CreatedBy',
  CREATED_DATE: 'System.CreatedDate',
  CHANGED_BY: 'System.ChangedBy',
  CHANGED_DATE: 'System.ChangedDate',
  ASSIGNED_TO: 'System.AssignedTo',
  TAGS: 'System.Tags',
  COMMENT_COUNT: 'System.CommentCount',
  AREA_PATH: 'System.AreaPath',
  ITERATION_PATH: 'System.IterationPath',
  PRIORITY: 'Microsoft.VSTS.Common.Priority',
  CLOSED_DATE: 'Microsoft.VSTS.Common.ClosedDate',
} as const;

/** Azure DevOps API response types */
interface AdoIdentityRef {
  readonly displayName: string;
  readonly uniqueName: string;
  readonly id: string;
  readonly imageUrl?: string;
}

interface AdoWorkItemFields {
  readonly [key: string]: unknown;
}

interface AdoWorkItem {
  readonly id: number;
  readonly rev: number;
  readonly fields: AdoWorkItemFields;
  readonly url: string;
  readonly _links?: Record<string, { href: string }>;
}

interface AdoWiqlResult {
  readonly workItems: ReadonlyArray<{ readonly id: number; readonly url: string }>;
}

interface AdoComment {
  readonly id: number;
  readonly text: string;
  readonly createdBy: AdoIdentityRef;
  readonly createdDate: string;
  readonly modifiedBy: AdoIdentityRef;
  readonly modifiedDate: string;
}

interface AdoCommentList {
  readonly comments: readonly AdoComment[];
  readonly totalCount: number;
}

/** JSON Patch operation for Azure DevOps API */
interface JsonPatchOperation {
  readonly op: 'add' | 'replace' | 'remove' | 'test';
  readonly path: string;
  readonly value?: unknown;
}

/** Maps Azure DevOps priority (1-4) to Traklet priority */
function mapAdoPriority(adoPriority: unknown): IssuePriority | undefined {
  switch (adoPriority) {
    case 1:
      return 'critical';
    case 2:
      return 'high';
    case 3:
      return 'medium';
    case 4:
      return 'low';
    default:
      return undefined;
  }
}

/** Maps Traklet priority to Azure DevOps priority (1-4) */
function mapTrakletPriority(priority: IssuePriority): number {
  switch (priority) {
    case 'critical':
      return 1;
    case 'high':
      return 2;
    case 'medium':
      return 3;
    case 'low':
      return 4;
  }
}

/** Maps Azure DevOps state to Traklet state */
function mapAdoState(adoState: unknown): IssueState {
  const state = String(adoState).toLowerCase();
  switch (state) {
    case 'closed':
    case 'done':
    case 'resolved':
    case 'removed':
    case 'completed':
      return 'closed';
    default:
      return 'open';
  }
}

export class AzureDevOpsAdapter
  extends BaseAdapter
  implements IIssueDeleter, ICommentManager, ILabelReader
{
  readonly type = 'azure-devops' as const;

  private orgUrl = '';
  private apiVersion = '7.0';
  private commentApiVersion = '7.0-preview.4';
  private defaultWorkItemType = 'Issue';
  /** Cached valid states per project, keyed by projectName */
  private stateCache = new Map<string, string[]>();

  constructor() {
    super();

    this.capabilities = {
      canDeleteIssues: true,
      hasAttachments: true,
      hasPriority: true,
      hasLabels: true,
      hasAssignees: true,
      hasComments: true,
      hasSearch: true,
      maxAttachmentSize: 60 * 1024 * 1024, // 60MB ADO limit
      allowedMimeTypes: [],
    };
  }

  // ============================================
  // Connection Lifecycle
  // ============================================

  protected async doConnect(config: AdapterConfig): Promise<ConnectionResult> {
    if (!config.baseUrl) {
      return { success: false, error: 'baseUrl is required (e.g., https://dev.azure.com/myorg)' };
    }

    this.orgUrl = config.baseUrl.replace(/\/$/, '');

    // Read work item type from options if provided
    if (config.options?.['workItemType'] && typeof config.options['workItemType'] === 'string') {
      this.defaultWorkItemType = config.options['workItemType'];
    }

    // Validate connection by fetching project info for each configured project
    const token = config.token ?? (config.getToken ? await config.getToken() : undefined);
    if (!token) {
      return { success: false, error: 'Authentication token is required' };
    }

    const projects: Project[] = [];

    for (const projectConfig of config.projects) {
      const projectName = projectConfig.identifier ?? projectConfig.id;

      try {
        const response = await this.fetchAdo<{ id: string; name: string; description: string }>(
          `/_apis/projects/${encodeURIComponent(projectName)}?api-version=${this.apiVersion}`,
          token
        );

        projects.push({
          id: projectConfig.id,
          name: response.name,
          description: response.description,
          url: `${this.orgUrl}/${encodeURIComponent(response.name)}`,
        });

        // Cache valid states for this project's work item type
        try {
          const witResponse = await this.fetchAdo<{
            states: ReadonlyArray<{ name: string; category: string }>;
          }>(
            `/${encodeURIComponent(projectName)}/_apis/wit/workitemtypes/${encodeURIComponent(this.defaultWorkItemType)}?api-version=${this.apiVersion}`,
            token
          );
          const stateNames = witResponse.states.map((s) => s.name);
          this.stateCache.set(projectName, stateNames);
        } catch {
          // Non-critical: fall back to defaults if we can't fetch states
        }
      } catch (error) {
        return {
          success: false,
          error: `Failed to connect to project '${projectName}': ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // Auto-detect authenticated user from the token
    let authenticatedUser: ConnectionResult['authenticatedUser'];
    try {
      const connData = await this.fetchAdo<{
        authenticatedUser: {
          id: string;
          providerDisplayName: string;
          properties: { Account?: { $value?: string } };
        };
      }>('/_apis/connectionData', token);

      const adoUser = connData.authenticatedUser;
      authenticatedUser = {
        id: adoUser.id,
        name: adoUser.providerDisplayName,
        email: adoUser.properties?.Account?.['$value'] ?? adoUser.providerDisplayName,
      };
    } catch {
      // Non-critical: user identity is optional
    }

    return { success: true, projects, authenticatedUser };
  }

  protected async doDisconnect(): Promise<void> {
    this.orgUrl = '';
    this.stateCache.clear();
  }

  protected async doValidateToken(token: string): Promise<boolean> {
    try {
      await this.fetchAdo('/_apis/connectionData', token);
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

    const projectConfig = this.getProjectConfig(projectId);
    const projectName = projectConfig.identifier ?? projectConfig.id;
    const token = await this.requireToken();

    // Build WIQL query
    const wiql = this.buildWiql(projectName, query);
    const wiqlResult = await this.fetchAdo<AdoWiqlResult>(
      `/${encodeURIComponent(projectName)}/_apis/wit/wiql?api-version=${this.apiVersion}`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ query: wiql }),
      }
    );

    const total = wiqlResult.workItems.length;
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const startIndex = (page - 1) * limit;

    // Paginate the IDs
    const pageIds = wiqlResult.workItems.slice(startIndex, startIndex + limit).map((wi) => wi.id);

    if (pageIds.length === 0) {
      return { items: [], total, page, limit, hasMore: startIndex + limit < total };
    }

    // Batch fetch work items
    const issues = await this.batchGetWorkItems(projectName, pageIds, token, projectId);

    return {
      items: issues,
      total,
      page,
      limit,
      hasMore: startIndex + limit < total,
    };
  }

  async getIssue(projectId: string, issueId: string): Promise<Issue> {
    this.ensureConnected();

    const projectConfig = this.getProjectConfig(projectId);
    const projectName = projectConfig.identifier ?? projectConfig.id;
    const token = await this.requireToken();

    const workItem = await this.fetchAdo<AdoWorkItem>(
      `/${encodeURIComponent(projectName)}/_apis/wit/workitems/${issueId}?api-version=${this.apiVersion}&$expand=all`,
      token
    );

    return this.mapWorkItemToIssue(workItem, projectId);
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

    const projectConfig = this.getProjectConfig(projectId);
    const projectName = projectConfig.identifier ?? projectConfig.id;
    const token = await this.requireToken();

    const patchOps: JsonPatchOperation[] = [
      { op: 'add', path: `/fields/${FIELDS.TITLE}`, value: dto.title },
      { op: 'add', path: `/fields/${FIELDS.DESCRIPTION}`, value: dto.body },
    ];

    if (dto.labels && dto.labels.length > 0) {
      patchOps.push({
        op: 'add',
        path: `/fields/${FIELDS.TAGS}`,
        value: dto.labels.join('; '),
      });
    }

    if (dto.assignees && dto.assignees.length > 0) {
      // Azure DevOps supports single assignee
      patchOps.push({
        op: 'add',
        path: `/fields/${FIELDS.ASSIGNED_TO}`,
        value: dto.assignees[0],
      });
    }

    if (dto.priority) {
      patchOps.push({
        op: 'add',
        path: `/fields/${FIELDS.PRIORITY}`,
        value: mapTrakletPriority(dto.priority),
      });
    }

    const workItem = await this.fetchAdo<AdoWorkItem>(
      `/${encodeURIComponent(projectName)}/_apis/wit/workitems/$${encodeURIComponent(this.defaultWorkItemType)}?api-version=${this.apiVersion}`,
      token,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json-patch+json' },
        body: JSON.stringify(patchOps),
      }
    );

    return this.mapWorkItemToIssue(workItem, projectId);
  }

  async updateIssue(projectId: string, issueId: string, dto: UpdateIssueDTO): Promise<Issue> {
    this.ensureConnected();

    const projectConfig = this.getProjectConfig(projectId);
    const projectName = projectConfig.identifier ?? projectConfig.id;
    const token = await this.requireToken();

    const patchOps: JsonPatchOperation[] = [];

    if (dto.title !== undefined) {
      patchOps.push({ op: 'replace', path: `/fields/${FIELDS.TITLE}`, value: dto.title });
    }

    if (dto.body !== undefined) {
      patchOps.push({ op: 'replace', path: `/fields/${FIELDS.DESCRIPTION}`, value: dto.body });
    }

    if (dto.state !== undefined) {
      const adoState = this.resolveAdoState(projectName, dto.state);
      patchOps.push({ op: 'replace', path: `/fields/${FIELDS.STATE}`, value: adoState });
    }

    if (dto.labels !== undefined) {
      patchOps.push({
        op: 'replace',
        path: `/fields/${FIELDS.TAGS}`,
        value: dto.labels.join('; '),
      });
    }

    if (dto.assignees !== undefined) {
      patchOps.push({
        op: 'replace',
        path: `/fields/${FIELDS.ASSIGNED_TO}`,
        value: dto.assignees.length > 0 ? dto.assignees[0] : '',
      });
    }

    if (dto.priority !== undefined) {
      patchOps.push({
        op: 'replace',
        path: `/fields/${FIELDS.PRIORITY}`,
        value: mapTrakletPriority(dto.priority),
      });
    }

    if (patchOps.length === 0) {
      return this.getIssue(projectId, issueId);
    }

    const workItem = await this.fetchAdo<AdoWorkItem>(
      `/${encodeURIComponent(projectName)}/_apis/wit/workitems/${issueId}?api-version=${this.apiVersion}`,
      token,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json-patch+json' },
        body: JSON.stringify(patchOps),
      }
    );

    return this.mapWorkItemToIssue(workItem, projectId);
  }

  // ============================================
  // IIssueDeleter
  // ============================================

  async deleteIssue(projectId: string, issueId: string): Promise<void> {
    this.ensureConnected();

    const projectConfig = this.getProjectConfig(projectId);
    const projectName = projectConfig.identifier ?? projectConfig.id;
    const token = await this.requireToken();

    await this.fetchAdo(
      `/${encodeURIComponent(projectName)}/_apis/wit/workitems/${issueId}?api-version=${this.apiVersion}`,
      token,
      { method: 'DELETE' }
    );
  }

  // ============================================
  // ICommentManager
  // ============================================

  async getComments(projectId: string, issueId: string): Promise<readonly Comment[]> {
    this.ensureConnected();

    const projectConfig = this.getProjectConfig(projectId);
    const projectName = projectConfig.identifier ?? projectConfig.id;
    const token = await this.requireToken();

    const result = await this.fetchAdo<AdoCommentList>(
      `/${encodeURIComponent(projectName)}/_apis/wit/workitems/${issueId}/comments?api-version=${this.commentApiVersion}`,
      token
    );

    return result.comments.map((c) => this.mapAdoComment(c));
  }

  async addComment(projectId: string, issueId: string, dto: CreateCommentDTO): Promise<Comment> {
    this.ensureConnected();

    const projectConfig = this.getProjectConfig(projectId);
    const projectName = projectConfig.identifier ?? projectConfig.id;
    const token = await this.requireToken();

    const adoComment = await this.fetchAdo<AdoComment>(
      `/${encodeURIComponent(projectName)}/_apis/wit/workitems/${issueId}/comments?api-version=${this.commentApiVersion}`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ text: dto.body }),
      }
    );

    return this.mapAdoComment(adoComment);
  }

  async updateComment(
    projectId: string,
    issueId: string,
    commentId: string,
    dto: UpdateCommentDTO
  ): Promise<Comment> {
    this.ensureConnected();

    const projectConfig = this.getProjectConfig(projectId);
    const projectName = projectConfig.identifier ?? projectConfig.id;
    const token = await this.requireToken();

    const adoComment = await this.fetchAdo<AdoComment>(
      `/${encodeURIComponent(projectName)}/_apis/wit/workitems/${issueId}/comments/${commentId}?api-version=${this.commentApiVersion}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify({ text: dto.body }),
      }
    );

    return this.mapAdoComment(adoComment);
  }

  async deleteComment(projectId: string, issueId: string, commentId: string): Promise<void> {
    this.ensureConnected();

    const projectConfig = this.getProjectConfig(projectId);
    const projectName = projectConfig.identifier ?? projectConfig.id;
    const token = await this.requireToken();

    await this.fetchAdo(
      `/${encodeURIComponent(projectName)}/_apis/wit/workitems/${issueId}/comments/${commentId}?api-version=${this.commentApiVersion}`,
      token,
      { method: 'DELETE' }
    );
  }

  // ============================================
  // ILabelReader (Tags in Azure DevOps)
  // ============================================

  async getLabels(projectId: string): Promise<readonly Label[]> {
    this.ensureConnected();

    const projectConfig = this.getProjectConfig(projectId);
    const projectName = projectConfig.identifier ?? projectConfig.id;
    const token = await this.requireToken();

    // Azure DevOps doesn't have a dedicated tags API.
    // System.Tags is a long-text field so '<> empty' is not supported in WIQL.
    // Query all work items and extract unique tags client-side.
    const wiqlResult = await this.fetchAdo<AdoWiqlResult>(
      `/${encodeURIComponent(projectName)}/_apis/wit/wiql?api-version=${this.apiVersion}`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          query: `SELECT [System.Id] FROM workitems WHERE [System.TeamProject] = '${projectName}'`,
        }),
      }
    );

    if (wiqlResult.workItems.length === 0) {
      return [];
    }

    // Fetch work items to get their tags
    const ids = wiqlResult.workItems.slice(0, 200).map((wi) => wi.id);
    const workItems = await this.batchGetWorkItemsRaw(projectName, ids, token, [FIELDS.TAGS]);

    const tagSet = new Set<string>();
    for (const wi of workItems) {
      const tags = wi.fields[FIELDS.TAGS];
      if (typeof tags === 'string') {
        for (const tag of tags.split(';')) {
          const trimmed = tag.trim();
          if (trimmed) {
            tagSet.add(trimmed);
          }
        }
      }
    }

    return Array.from(tagSet)
      .sort()
      .map((tag, index) => ({
        id: `tag-${index}`,
        name: tag,
        color: '#0078d4', // Azure blue default
        description: undefined,
      }));
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Resolve Traklet state ('open'/'closed') to the correct Azure DevOps state name.
   * Different process templates use different state names:
   * - Basic: To Do / Doing / Done
   * - Agile: New / Active / Resolved / Closed
   * - Scrum: New / Approved / Committed / Done
   */
  private resolveAdoState(projectName: string, state: IssueState): string {
    const validStates = this.stateCache.get(projectName);

    if (state === 'closed') {
      // Find the terminal state from known patterns
      const closedCandidates = ['Done', 'Closed', 'Resolved', 'Completed', 'Removed'];
      if (validStates) {
        const match = closedCandidates.find((c) =>
          validStates.some((s) => s.toLowerCase() === c.toLowerCase())
        );
        if (match) {
          return validStates.find((s) => s.toLowerCase() === match.toLowerCase()) ?? match;
        }
        // Use the last state as fallback (typically terminal)
        return validStates[validStates.length - 1] ?? 'Closed';
      }
      return 'Closed';
    }

    // For 'open', find the first active/open state
    const openCandidates = ['Doing', 'Active', 'In Progress', 'Committed', 'To Do', 'New'];
    if (validStates) {
      const match = openCandidates.find((c) =>
        validStates.some((s) => s.toLowerCase() === c.toLowerCase())
      );
      if (match) {
        return validStates.find((s) => s.toLowerCase() === match.toLowerCase()) ?? match;
      }
      // Use the first state as fallback
      return validStates[0] ?? 'Active';
    }
    return 'Active';
  }

  private async requireToken(): Promise<string> {
    const token = await this.getToken();
    if (!token) {
      throw new Error('Authentication token is not available');
    }
    return token;
  }

  private async fetchAdo<T>(
    path: string,
    token: string,
    init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }
  ): Promise<T> {
    const url = `${this.orgUrl}${path}`;
    // Support both PAT (Basic auth) and Bearer tokens (from az CLI / AAD)
    const isBearer = token.startsWith('eyJ');
    const authHeader = isBearer ? `Bearer ${token}` : `Basic ${btoa(`:${token}`)}`;

    const headers: Record<string, string> = {
      Authorization: authHeader,
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    };

    // Default content type for POST/PATCH if not specified
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
        `Azure DevOps API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`
      );
    }

    // DELETE returns 204 No Content
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as unknown as T;
    }

    return response.json() as Promise<T>;
  }

  private buildWiql(projectName: string, query?: IssueQuery): string {
    const conditions: string[] = [
      `[System.TeamProject] = '${projectName}'`,
      `[System.WorkItemType] = '${this.defaultWorkItemType}'`,
    ];

    if (query?.state) {
      if (query.state === 'open') {
        conditions.push(`[System.State] <> 'Closed'`);
        conditions.push(`[System.State] <> 'Done'`);
        conditions.push(`[System.State] <> 'Resolved'`);
        conditions.push(`[System.State] <> 'Removed'`);
      } else if (query.state === 'closed') {
        conditions.push(
          `([System.State] = 'Closed' OR [System.State] = 'Done' OR [System.State] = 'Resolved')`
        );
      }
    }

    if (query?.assignee) {
      conditions.push(`[System.AssignedTo] = '${query.assignee}'`);
    }

    if (query?.creator) {
      conditions.push(`[System.CreatedBy] = '${query.creator}'`);
    }

    if (query?.labels && query.labels.length > 0) {
      for (const label of query.labels) {
        conditions.push(`[System.Tags] Contains '${label}'`);
      }
    }

    if (query?.search) {
      conditions.push(
        `([System.Title] Contains '${query.search}' OR [System.Description] Contains '${query.search}')`
      );
    }

    // Sort
    let orderBy = '[System.CreatedDate]';
    if (query?.sort === 'updated') {
      orderBy = '[System.ChangedDate]';
    } else if (query?.sort === 'priority') {
      orderBy = '[Microsoft.VSTS.Common.Priority]';
    }
    const orderDir = query?.order === 'asc' ? 'ASC' : 'DESC';

    return `SELECT [System.Id] FROM workitems WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy} ${orderDir}`;
  }

  private async batchGetWorkItems(
    projectName: string,
    ids: number[],
    token: string,
    projectId: string
  ): Promise<Issue[]> {
    if (ids.length === 0) return [];

    const workItems = await this.batchGetWorkItemsRaw(projectName, ids, token);

    return workItems.map((wi) => this.mapWorkItemToIssue(wi, projectId));
  }

  private async batchGetWorkItemsRaw(
    projectName: string,
    ids: number[],
    token: string,
    fields?: string[]
  ): Promise<AdoWorkItem[]> {
    if (ids.length === 0) return [];

    // Azure DevOps batch limit is 200
    const allWorkItems: AdoWorkItem[] = [];

    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const idsParam = batch.join(',');

      let url = `/${encodeURIComponent(projectName)}/_apis/wit/workitems?ids=${idsParam}&api-version=${this.apiVersion}`;
      if (fields) {
        url += `&fields=${fields.join(',')}`;
      } else {
        url += '&$expand=all';
      }

      const result = await this.fetchAdo<{ value: AdoWorkItem[] }>(url, token);
      allWorkItems.push(...result.value);
    }

    return allWorkItems;
  }

  private mapWorkItemToIssue(workItem: AdoWorkItem, projectId: string): Issue {
    const fields = workItem.fields;

    const createdBy = this.mapIdentity(fields[FIELDS.CREATED_BY] as AdoIdentityRef | undefined);
    const assignedTo = fields[FIELDS.ASSIGNED_TO] as AdoIdentityRef | undefined;
    const tags = typeof fields[FIELDS.TAGS] === 'string' ? fields[FIELDS.TAGS] as string : '';
    const closedDate = fields[FIELDS.CLOSED_DATE] as string | undefined;

    return {
      id: String(workItem.id),
      number: workItem.id,
      title: String(fields[FIELDS.TITLE] ?? ''),
      body: String(fields[FIELDS.DESCRIPTION] ?? ''),
      state: mapAdoState(fields[FIELDS.STATE]),
      priority: mapAdoPriority(fields[FIELDS.PRIORITY]),
      labels: this.parseTags(tags),
      createdBy,
      assignees: assignedTo ? [this.mapIdentity(assignedTo)] : [],
      createdAt: new Date(fields[FIELDS.CREATED_DATE] as string),
      updatedAt: new Date(fields[FIELDS.CHANGED_DATE] as string),
      closedAt: closedDate ? new Date(closedDate) : undefined,
      attachments: [],
      commentCount: (fields[FIELDS.COMMENT_COUNT] as number) ?? 0,
      projectId,
      metadata: {
        workItemType: fields[FIELDS.WORK_ITEM_TYPE],
        areaPath: fields[FIELDS.AREA_PATH],
        iterationPath: fields[FIELDS.ITERATION_PATH],
        revision: workItem.rev,
      },
    };
  }

  private mapIdentity(identity: AdoIdentityRef | undefined): User {
    if (!identity) {
      return { id: 'unknown', name: 'Unknown', email: undefined };
    }

    return {
      id: identity.id,
      name: identity.displayName,
      email: identity.uniqueName,
      username: identity.uniqueName,
      avatarUrl: identity.imageUrl,
    };
  }

  private parseTags(tags: string): Label[] {
    if (!tags) return [];

    return tags
      .split(';')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((tag, index) => ({
        id: `tag-${index}`,
        name: tag,
        color: '#0078d4',
        description: undefined,
      }));
  }

  private mapAdoComment(comment: AdoComment): Comment {
    return {
      id: String(comment.id),
      body: comment.text,
      author: this.mapIdentity(comment.createdBy),
      createdAt: new Date(comment.createdDate),
      updatedAt: new Date(comment.modifiedDate),
      attachments: [],
    };
  }
}
