/**
 * ISP Interface: Comment Management Operations
 * Segregated interface for comment CRUD operations
 */

import type { Comment, CreateCommentDTO, UpdateCommentDTO } from '@/models';

export interface ICommentReader {
  /**
   * Get all comments for an issue
   */
  getComments(projectId: string, issueId: string): Promise<readonly Comment[]>;
}

export interface ICommentWriter {
  /**
   * Add a comment to an issue
   */
  addComment(projectId: string, issueId: string, dto: CreateCommentDTO): Promise<Comment>;

  /**
   * Update an existing comment
   */
  updateComment(
    projectId: string,
    issueId: string,
    commentId: string,
    dto: UpdateCommentDTO
  ): Promise<Comment>;
}

export interface ICommentDeleter {
  /**
   * Delete a comment
   */
  deleteComment(projectId: string, issueId: string, commentId: string): Promise<void>;
}

/**
 * Combined comment manager interface for adapters that support all operations
 */
export interface ICommentManager extends ICommentReader, ICommentWriter, ICommentDeleter {}
