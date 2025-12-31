/**
 * PermissionManager - User-based permission checking
 * Determines what actions the current user can perform
 */

import type { Issue, Comment, User } from '@/models';
import type { TrakletUser, AnonymousMode } from './ConfigManager';
import { getConfigManager } from './ConfigManager';
import { getAuthManager } from './AuthManager';

export type Permission =
  | 'view_issues'
  | 'create_issue'
  | 'edit_issue'
  | 'delete_issue'
  | 'view_comments'
  | 'add_comment'
  | 'edit_comment'
  | 'delete_comment'
  | 'view_attachments'
  | 'add_attachment'
  | 'delete_attachment';

export interface PermissionContext {
  readonly issue?: Issue | undefined;
  readonly comment?: Comment | undefined;
}

export class PermissionManager {
  /**
   * Check if user has a specific permission
   */
  hasPermission(permission: Permission, context?: PermissionContext): boolean {
    const user = this.getCurrentUser();
    const anonymousMode = this.getAnonymousMode();

    // View permissions are always allowed
    if (permission.startsWith('view_')) {
      return true;
    }

    // Anonymous user checks
    if (!user) {
      return this.checkAnonymousPermission(permission, anonymousMode);
    }

    // Authenticated user checks
    return this.checkAuthenticatedPermission(permission, user, context);
  }

  /**
   * Check if user can edit a specific issue
   */
  canEditIssue(issue: Issue): boolean {
    return this.hasPermission('edit_issue', { issue });
  }

  /**
   * Check if user can delete a specific issue
   */
  canDeleteIssue(issue: Issue): boolean {
    return this.hasPermission('delete_issue', { issue });
  }

  /**
   * Check if user can create issues
   */
  canCreateIssue(): boolean {
    return this.hasPermission('create_issue');
  }

  /**
   * Check if user can edit a specific comment
   */
  canEditComment(comment: Comment): boolean {
    return this.hasPermission('edit_comment', { comment });
  }

  /**
   * Check if user can delete a specific comment
   */
  canDeleteComment(comment: Comment): boolean {
    return this.hasPermission('delete_comment', { comment });
  }

  /**
   * Check if user can add comments
   */
  canAddComment(): boolean {
    return this.hasPermission('add_comment');
  }

  /**
   * Check if user can add attachments
   */
  canAddAttachment(): boolean {
    return this.hasPermission('add_attachment');
  }

  /**
   * Check if user matches the author of content
   */
  matchesUser(author: User): boolean {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return false;

    // Primary match: email (case-insensitive)
    if (currentUser.email && author.email) {
      if (currentUser.email.toLowerCase() === author.email.toLowerCase()) {
        return true;
      }
    }

    // Fallback: ID match
    if (currentUser.id && author.id) {
      if (currentUser.id === author.id) {
        return true;
      }
    }

    // Fallback: username match
    if (currentUser.username && author.username) {
      if (currentUser.username.toLowerCase() === author.username.toLowerCase()) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the current user from auth manager
   */
  private getCurrentUser(): TrakletUser | undefined {
    return getAuthManager().getCurrentUser();
  }

  /**
   * Get the anonymous mode setting
   */
  private getAnonymousMode(): AnonymousMode | undefined {
    return getConfigManager().getAnonymousMode();
  }

  /**
   * Check permissions for anonymous users
   */
  private checkAnonymousPermission(
    permission: Permission,
    mode: AnonymousMode | undefined
  ): boolean {
    // Default to view_only if not configured
    const effectiveMode = mode ?? 'view_only';

    switch (permission) {
      case 'create_issue':
      case 'add_comment':
      case 'add_attachment':
        return effectiveMode === 'view_create';

      case 'edit_issue':
      case 'delete_issue':
      case 'edit_comment':
      case 'delete_comment':
      case 'delete_attachment':
        // Anonymous users can never edit/delete
        return false;

      default:
        return false;
    }
  }

  /**
   * Check permissions for authenticated users
   */
  private checkAuthenticatedPermission(
    permission: Permission,
    _user: TrakletUser,
    context?: PermissionContext
  ): boolean {
    switch (permission) {
      case 'create_issue':
      case 'add_comment':
      case 'add_attachment':
        // Authenticated users can always create
        return true;

      case 'edit_issue':
      case 'delete_issue':
        // Can only edit/delete own issues
        if (context?.issue) {
          return this.matchesUser(context.issue.createdBy);
        }
        return false;

      case 'edit_comment':
      case 'delete_comment':
        // Can only edit/delete own comments
        if (context?.comment) {
          return this.matchesUser(context.comment.author);
        }
        return false;

      case 'delete_attachment':
        // Can delete attachments on own content
        if (context?.issue) {
          return this.matchesUser(context.issue.createdBy);
        }
        if (context?.comment) {
          return this.matchesUser(context.comment.author);
        }
        return false;

      default:
        return false;
    }
  }
}

// Singleton
let globalPermissionManager: PermissionManager | null = null;

export function getPermissionManager(): PermissionManager {
  if (!globalPermissionManager) {
    globalPermissionManager = new PermissionManager();
  }
  return globalPermissionManager;
}

export function resetPermissionManager(): void {
  globalPermissionManager = null;
}
