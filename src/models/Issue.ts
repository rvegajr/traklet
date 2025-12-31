/**
 * Core Issue model - unified representation across all backends
 */

export type IssueState = 'open' | 'closed';
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical';

export interface Label {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly description?: string | undefined;
}

export interface User {
  readonly id: string;
  readonly email?: string | undefined;
  readonly name: string;
  readonly username?: string | undefined;
  readonly avatarUrl?: string | undefined;
}

export interface Attachment {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly url: string;
  readonly thumbnailUrl?: string | undefined;
  readonly createdAt: Date;
}

export interface Comment {
  readonly id: string;
  readonly body: string;
  readonly author: User;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly attachments: readonly Attachment[];
}

export interface Issue {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly state: IssueState;
  readonly priority?: IssuePriority | undefined;
  readonly labels: readonly Label[];
  readonly createdBy: User;
  readonly assignees: readonly User[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly closedAt?: Date | undefined;
  readonly attachments: readonly Attachment[];
  readonly commentCount: number;
  readonly projectId: string;

  // Backend-specific metadata
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly url?: string | undefined;
}

// DTOs for mutations
export interface CreateIssueDTO {
  readonly title: string;
  readonly body: string;
  readonly labels?: readonly string[] | undefined;
  readonly assignees?: readonly string[] | undefined;
  readonly priority?: IssuePriority | undefined;
  readonly attachments?: readonly File[] | undefined;
}

export interface UpdateIssueDTO {
  readonly title?: string | undefined;
  readonly body?: string | undefined;
  readonly state?: IssueState | undefined;
  readonly labels?: readonly string[] | undefined;
  readonly assignees?: readonly string[] | undefined;
  readonly priority?: IssuePriority | undefined;
}

export interface CreateCommentDTO {
  readonly body: string;
  readonly attachments?: readonly File[] | undefined;
}

export interface UpdateCommentDTO {
  readonly body: string;
}

// Query types
export interface IssueQuery {
  readonly state?: IssueState | undefined;
  readonly labels?: readonly string[] | undefined;
  readonly assignee?: string | undefined;
  readonly creator?: string | undefined;
  readonly search?: string | undefined;
  readonly sort?: 'created' | 'updated' | 'priority' | undefined;
  readonly order?: 'asc' | 'desc' | undefined;
  readonly page?: number | undefined;
  readonly limit?: number | undefined;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly hasMore: boolean;
}
