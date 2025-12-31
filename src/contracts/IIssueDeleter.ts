/**
 * ISP Interface: Issue Deletion Operations
 * Segregated interface for issue deletion (optional capability)
 */

export interface IIssueDeleter {
  /**
   * Delete an issue
   * Note: Not all backends support issue deletion (e.g., GitHub)
   */
  deleteIssue(projectId: string, issueId: string): Promise<void>;
}
