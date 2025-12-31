/**
 * PermissionManager tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PermissionManager, getPermissionManager, resetPermissionManager } from '../PermissionManager';
import { resetConfigManager, getConfigManager } from '../ConfigManager';
import { resetAuthManager } from '../AuthManager';
import type { Issue, Comment, User } from '@/models';
import type { TrakletConfig } from '../ConfigManager';

describe('PermissionManager', () => {
  let permissionManager: PermissionManager;

  beforeEach(() => {
    resetConfigManager();
    resetAuthManager();
    resetPermissionManager();
    permissionManager = new PermissionManager();
  });

  afterEach(() => {
    resetConfigManager();
    resetAuthManager();
    resetPermissionManager();
  });

  describe('anonymous user - view_only mode', () => {
    beforeEach(() => {
      configureAnonymous('view_only');
    });

    it('should allow viewing issues', () => {
      expect(permissionManager.hasPermission('view_issues')).toBe(true);
    });

    it('should allow viewing comments', () => {
      expect(permissionManager.hasPermission('view_comments')).toBe(true);
    });

    it('should allow viewing attachments', () => {
      expect(permissionManager.hasPermission('view_attachments')).toBe(true);
    });

    it('should deny creating issues', () => {
      expect(permissionManager.hasPermission('create_issue')).toBe(false);
      expect(permissionManager.canCreateIssue()).toBe(false);
    });

    it('should deny editing issues', () => {
      const issue = createMockIssue();
      expect(permissionManager.hasPermission('edit_issue', { issue })).toBe(false);
      expect(permissionManager.canEditIssue(issue)).toBe(false);
    });

    it('should deny deleting issues', () => {
      const issue = createMockIssue();
      expect(permissionManager.hasPermission('delete_issue', { issue })).toBe(false);
      expect(permissionManager.canDeleteIssue(issue)).toBe(false);
    });

    it('should deny adding comments', () => {
      expect(permissionManager.hasPermission('add_comment')).toBe(false);
      expect(permissionManager.canAddComment()).toBe(false);
    });

    it('should deny adding attachments', () => {
      expect(permissionManager.hasPermission('add_attachment')).toBe(false);
      expect(permissionManager.canAddAttachment()).toBe(false);
    });
  });

  describe('anonymous user - view_create mode', () => {
    beforeEach(() => {
      configureAnonymous('view_create');
    });

    it('should allow creating issues', () => {
      expect(permissionManager.hasPermission('create_issue')).toBe(true);
      expect(permissionManager.canCreateIssue()).toBe(true);
    });

    it('should allow adding comments', () => {
      expect(permissionManager.hasPermission('add_comment')).toBe(true);
      expect(permissionManager.canAddComment()).toBe(true);
    });

    it('should allow adding attachments', () => {
      expect(permissionManager.hasPermission('add_attachment')).toBe(true);
      expect(permissionManager.canAddAttachment()).toBe(true);
    });

    it('should still deny editing issues', () => {
      const issue = createMockIssue();
      expect(permissionManager.canEditIssue(issue)).toBe(false);
    });

    it('should still deny deleting issues', () => {
      const issue = createMockIssue();
      expect(permissionManager.canDeleteIssue(issue)).toBe(false);
    });

    it('should still deny editing comments', () => {
      const comment = createMockComment();
      expect(permissionManager.canEditComment(comment)).toBe(false);
    });

    it('should still deny deleting comments', () => {
      const comment = createMockComment();
      expect(permissionManager.canDeleteComment(comment)).toBe(false);
    });
  });

  describe('authenticated user - own content', () => {
    const userEmail = 'user@example.com';

    beforeEach(() => {
      configureAuthenticatedUser(userEmail);
    });

    it('should allow creating issues', () => {
      expect(permissionManager.canCreateIssue()).toBe(true);
    });

    it('should allow editing own issues', () => {
      const issue = createMockIssue({ createdBy: { email: userEmail } });
      expect(permissionManager.canEditIssue(issue)).toBe(true);
    });

    it('should allow deleting own issues', () => {
      const issue = createMockIssue({ createdBy: { email: userEmail } });
      expect(permissionManager.canDeleteIssue(issue)).toBe(true);
    });

    it('should allow adding comments', () => {
      expect(permissionManager.canAddComment()).toBe(true);
    });

    it('should allow editing own comments', () => {
      const comment = createMockComment({ author: { email: userEmail } });
      expect(permissionManager.canEditComment(comment)).toBe(true);
    });

    it('should allow deleting own comments', () => {
      const comment = createMockComment({ author: { email: userEmail } });
      expect(permissionManager.canDeleteComment(comment)).toBe(true);
    });
  });

  describe('authenticated user - other content', () => {
    const userEmail = 'user@example.com';
    const otherEmail = 'other@example.com';

    beforeEach(() => {
      configureAuthenticatedUser(userEmail);
    });

    it('should deny editing other user issues', () => {
      const issue = createMockIssue({ createdBy: { email: otherEmail } });
      expect(permissionManager.canEditIssue(issue)).toBe(false);
    });

    it('should deny deleting other user issues', () => {
      const issue = createMockIssue({ createdBy: { email: otherEmail } });
      expect(permissionManager.canDeleteIssue(issue)).toBe(false);
    });

    it('should deny editing other user comments', () => {
      const comment = createMockComment({ author: { email: otherEmail } });
      expect(permissionManager.canEditComment(comment)).toBe(false);
    });

    it('should deny deleting other user comments', () => {
      const comment = createMockComment({ author: { email: otherEmail } });
      expect(permissionManager.canDeleteComment(comment)).toBe(false);
    });
  });

  describe('matchesUser()', () => {
    it('should match by email (case-insensitive)', () => {
      configureAuthenticatedUser('User@Example.com');

      const author: User = {
        id: 'user-1',
        name: 'User',
        email: 'user@example.com',
      };

      expect(permissionManager.matchesUser(author)).toBe(true);
    });

    it('should match by ID as fallback', () => {
      configureAuthenticatedUser('different@email.com', { id: 'user-123' });

      const author: User = {
        id: 'user-123',
        name: 'User',
        email: 'other@email.com',
      };

      expect(permissionManager.matchesUser(author)).toBe(true);
    });

    it('should match by username as fallback', () => {
      configureAuthenticatedUser('different@email.com', { username: 'testuser' });

      const author: User = {
        id: 'user-456',
        name: 'User',
        username: 'TestUser', // case-insensitive
      };

      expect(permissionManager.matchesUser(author)).toBe(true);
    });

    it('should return false when no match', () => {
      configureAuthenticatedUser('user@example.com');

      const author: User = {
        id: 'different-id',
        name: 'Other User',
        email: 'other@example.com',
        username: 'differentuser',
      };

      expect(permissionManager.matchesUser(author)).toBe(false);
    });

    it('should return false for anonymous users', () => {
      configureAnonymous('view_only');

      const author: User = {
        id: 'user-1',
        name: 'User',
        email: 'user@example.com',
      };

      expect(permissionManager.matchesUser(author)).toBe(false);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const manager1 = getPermissionManager();
      const manager2 = getPermissionManager();
      expect(manager1).toBe(manager2);
    });

    it('should reset correctly', () => {
      const manager1 = getPermissionManager();
      resetPermissionManager();
      const manager2 = getPermissionManager();
      expect(manager1).not.toBe(manager2);
    });
  });
});

// Test helpers
function configureAnonymous(mode: 'view_only' | 'view_create'): void {
  const config: TrakletConfig = {
    adapter: 'github',
    token: 'test-token',
    projects: [{ id: 'p1', name: 'Project', identifier: 'owner/repo' }],
    permissions: { anonymousMode: mode },
  };
  getConfigManager().setConfig(config);
}

function configureAuthenticatedUser(
  email: string,
  extras?: { id?: string; username?: string }
): void {
  const config: TrakletConfig = {
    adapter: 'github',
    token: 'test-token',
    projects: [{ id: 'p1', name: 'Project', identifier: 'owner/repo' }],
    user: {
      email,
      name: 'Test User',
      id: extras?.id,
      username: extras?.username,
    },
  };
  getConfigManager().setConfig(config);
}

function createMockIssue(overrides?: { createdBy?: Partial<User> }): Issue {
  return {
    id: 'issue-1',
    number: 1,
    title: 'Test Issue',
    body: 'Test body',
    state: 'open',
    labels: [],
    createdBy: {
      id: 'other-user',
      name: 'Other User',
      email: 'other@example.com',
      ...overrides?.createdBy,
    },
    assignees: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    attachments: [],
    commentCount: 0,
    projectId: 'project-1',
  };
}

function createMockComment(overrides?: { author?: Partial<User> }): Comment {
  return {
    id: 'comment-1',
    body: 'Test comment',
    author: {
      id: 'other-user',
      name: 'Other User',
      email: 'other@example.com',
      ...overrides?.author,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    attachments: [],
  };
}
