/**
 * ISP Interface: Issue Writing Operations
 * Segregated interface for issue create/update operations
 */

import type { Issue, CreateIssueDTO, UpdateIssueDTO } from '@/models';

export interface IIssueWriter {
  /**
   * Create a new issue
   */
  createIssue(projectId: string, dto: CreateIssueDTO): Promise<Issue>;

  /**
   * Update an existing issue
   */
  updateIssue(projectId: string, issueId: string, dto: UpdateIssueDTO): Promise<Issue>;
}
