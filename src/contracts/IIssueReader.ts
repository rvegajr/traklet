/**
 * ISP Interface: Issue Reading Operations
 * Segregated interface for read-only issue operations
 */

import type { Issue, IssueQuery, PaginatedResult } from '@/models';

export interface IIssueReader {
  /**
   * Get a paginated list of issues matching the query
   */
  getIssues(projectId: string, query?: IssueQuery): Promise<PaginatedResult<Issue>>;

  /**
   * Get a single issue by ID
   */
  getIssue(projectId: string, issueId: string): Promise<Issue>;

  /**
   * Check if an issue exists
   */
  issueExists(projectId: string, issueId: string): Promise<boolean>;
}
