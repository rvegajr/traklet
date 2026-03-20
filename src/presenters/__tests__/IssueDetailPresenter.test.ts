/**
 * IssueDetailPresenter tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IssueDetailPresenter } from '../IssueDetailPresenter';
import { LocalStorageAdapter } from '@/adapters/LocalStorageAdapter';
import { resetConfigManager, getConfigManager } from '@/core/ConfigManager';
import { resetStateManager, getStateManager } from '@/core/StateManager';
import { resetPermissionManager } from '@/core/PermissionManager';
import { resetEventBus, getEventBus } from '@/core/EventBus';
import { resetAuthManager } from '@/core/AuthManager';
import type { AdapterConfig } from '@/contracts';
import type { TrakletConfig } from '@/core/ConfigManager';
import type { Issue } from '@/models';

describe('IssueDetailPresenter', () => {
  let presenter: IssueDetailPresenter;
  let adapter: LocalStorageAdapter;
  const projectId = 'project-1';

  beforeEach(async () => {
    // Reset all singletons
    resetConfigManager();
    resetStateManager();
    resetPermissionManager();
    resetEventBus();
    resetAuthManager();

    // Configure for authenticated user
    const config: TrakletConfig = {
      adapter: 'localStorage',
      token: 'test-token',
      projects: [{ id: projectId, name: 'Test Project', identifier: 'test' }],
      user: {
        email: 'test@example.com',
        name: 'Test User',
      },
    };
    getConfigManager().setConfig(config);

    // Create and connect adapter
    adapter = new LocalStorageAdapter(false);
    const adapterConfig: AdapterConfig = {
      type: 'localStorage',
      token: 'test-token',
      projects: [{ id: projectId, name: 'Test Project', identifier: 'test' }],
    };
    await adapter.connect(adapterConfig);

    presenter = new IssueDetailPresenter(adapter, projectId);
  });

  afterEach(async () => {
    adapter.clearAllData();
    await adapter.disconnect();
    resetConfigManager();
    resetStateManager();
    resetPermissionManager();
    resetEventBus();
    resetAuthManager();
  });

  describe('loadIssue()', () => {
    it('should load and transform issue to view model with correct fields', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Test body content',
        labels: ['bug'],
      });

      await presenter.loadIssue(issue.id);

      const vm = presenter.getViewModel();
      expect(vm).not.toBeNull();
      expect(vm!.id).toBe(issue.id);
      expect(vm!.title).toBe('Test Issue');
      expect(vm!.body).toBe('Test body content');
      expect(vm!.state).toBe('open');
      expect(vm!.labels).toHaveLength(1);
      expect(vm!.labels[0]?.name).toBe('bug');
      expect(vm!.author).toBeDefined();
      expect(vm!.author.id).toBeDefined();
      expect(vm!.author.name).toBeDefined();
      expect(vm!.assignees).toBeDefined();
      expect(typeof vm!.createdAt).toBe('string');
      expect(typeof vm!.updatedAt).toBe('string');
      expect(vm!.attachments).toBeDefined();
    });

    it('should set viewModel to null on error', async () => {
      await presenter.loadIssue('nonexistent-id');

      const vm = presenter.getViewModel();
      expect(vm).toBeNull();
    });

    it('should notify subscribers when issue is loaded', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Body',
      });

      const callback = vi.fn();
      presenter.subscribe(callback);
      callback.mockClear();

      await presenter.loadIssue(issue.id);

      expect(callback).toHaveBeenCalled();
      const lastCall = callback.mock.calls[callback.mock.calls.length - 1];
      expect(lastCall[0]?.title).toBe('Test Issue');
    });
  });

  describe('loadComments()', () => {
    it('should load and transform comments to CommentViewModels', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Body',
      });

      await adapter.addComment(projectId, issue.id, { body: 'Comment 1' });
      await adapter.addComment(projectId, issue.id, { body: 'Comment 2' });

      await presenter.loadIssue(issue.id);

      const comments = presenter.getComments();
      expect(comments).toHaveLength(2);
      expect(comments[0]?.body).toBe('Comment 1');
      expect(comments[1]?.body).toBe('Comment 2');
      expect(comments[0]?.author).toBeDefined();
      expect(typeof comments[0]?.createdAt).toBe('string');
      expect(typeof comments[0]?.updatedAt).toBe('string');
      expect(typeof comments[0]?.isEdited).toBe('boolean');
      expect(typeof comments[0]?.canEdit).toBe('boolean');
      expect(typeof comments[0]?.canDelete).toBe('boolean');
    });

    it('should return empty array when no issue is loaded', async () => {
      await presenter.loadComments();

      const comments = presenter.getComments();
      expect(comments).toHaveLength(0);
    });
  });

  describe('closeIssue()', () => {
    it('should update issue state to closed and emit event', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Open Issue',
        body: 'Body',
      });
      await presenter.loadIssue(issue.id);

      const eventSpy = vi.fn();
      getEventBus().on('issue:updated', eventSpy);

      await presenter.closeIssue();

      const vm = presenter.getViewModel();
      expect(vm!.state).toBe('closed');
      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: { state: 'closed' },
        })
      );
    });

    it('should do nothing when no issue is loaded', async () => {
      // Should not throw
      await presenter.closeIssue();
      expect(presenter.getViewModel()).toBeNull();
    });
  });

  describe('reopenIssue()', () => {
    it('should update issue state to open and emit event', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Body',
      });
      await adapter.updateIssue(projectId, issue.id, { state: 'closed' });
      await presenter.loadIssue(issue.id);

      const eventSpy = vi.fn();
      getEventBus().on('issue:updated', eventSpy);

      await presenter.reopenIssue();

      const vm = presenter.getViewModel();
      expect(vm!.state).toBe('open');
      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: { state: 'open' },
        })
      );
    });

    it('should do nothing when no issue is loaded', async () => {
      await presenter.reopenIssue();
      expect(presenter.getViewModel()).toBeNull();
    });
  });

  describe('deleteIssue()', () => {
    it('should delete issue, emit event, and navigate to list', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'To Delete',
        body: 'Body',
      });
      await presenter.loadIssue(issue.id);

      const deleteSpy = vi.fn();
      getEventBus().on('issue:deleted', deleteSpy);

      await presenter.deleteIssue();

      expect(deleteSpy).toHaveBeenCalledOnce();
      expect(deleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          issueId: issue.id,
          projectId,
        })
      );

      // Should navigate to list view
      const state = getStateManager().getState();
      expect(state.viewState).toBe('list');
      expect(state.selectedIssue).toBeNull();
    });

    it('should do nothing when no issue is loaded', async () => {
      await presenter.deleteIssue();
      // No error thrown, no state change
    });

    it('should verify issue is actually deleted from adapter', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'To Delete',
        body: 'Body',
      });
      await presenter.loadIssue(issue.id);

      await presenter.deleteIssue();

      // Trying to get the deleted issue should throw
      await expect(adapter.getIssue(projectId, issue.id)).rejects.toThrow();
    });
  });

  describe('addComment()', () => {
    it('should add comment and update comments list', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Body',
      });
      await presenter.loadIssue(issue.id);

      const eventSpy = vi.fn();
      getEventBus().on('comment:created', eventSpy);

      await presenter.addComment('New comment body');

      const comments = presenter.getComments();
      expect(comments).toHaveLength(1);
      expect(comments[0]?.body).toBe('New comment body');
      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          issueId: issue.id,
        })
      );
    });

    it('should do nothing when no issue is loaded', async () => {
      await presenter.addComment('comment');
      expect(presenter.getComments()).toHaveLength(0);
    });

    it('should notify subscribers when comment is added', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Body',
      });
      await presenter.loadIssue(issue.id);

      const callback = vi.fn();
      presenter.subscribe(callback);
      callback.mockClear();

      await presenter.addComment('A comment');

      expect(callback).toHaveBeenCalled();
      const lastCall = callback.mock.calls[callback.mock.calls.length - 1];
      expect(lastCall[1]).toHaveLength(1);
    });
  });

  describe('editComment()', () => {
    it('should update comment body and emit event', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Body',
      });
      await presenter.loadIssue(issue.id);

      await presenter.addComment('Original comment');
      const comments = presenter.getComments();
      const commentId = comments[0]!.id;

      const eventSpy = vi.fn();
      getEventBus().on('comment:updated', eventSpy);

      await presenter.editComment(commentId, 'Updated comment');

      const updatedComments = presenter.getComments();
      expect(updatedComments[0]?.body).toBe('Updated comment');
      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          issueId: issue.id,
        })
      );
    });

    it('should do nothing when no issue is loaded', async () => {
      await presenter.editComment('some-id', 'updated');
      expect(presenter.getComments()).toHaveLength(0);
    });
  });

  describe('deleteComment()', () => {
    it('should remove comment from list and emit event', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Body',
      });
      await presenter.loadIssue(issue.id);

      await presenter.addComment('Comment to delete');
      const comments = presenter.getComments();
      expect(comments).toHaveLength(1);
      const commentId = comments[0]!.id;

      const eventSpy = vi.fn();
      getEventBus().on('comment:deleted', eventSpy);

      await presenter.deleteComment(commentId);

      expect(presenter.getComments()).toHaveLength(0);
      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          issueId: issue.id,
          commentId,
        })
      );
    });

    it('should do nothing when no issue is loaded', async () => {
      await presenter.deleteComment('some-id');
      expect(presenter.getComments()).toHaveLength(0);
    });
  });

  describe('updateIssueInline()', () => {
    it('should update issue title and emit event', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Original Title',
        body: 'Body',
      });
      await presenter.loadIssue(issue.id);

      const eventSpy = vi.fn();
      getEventBus().on('issue:updated', eventSpy);

      await presenter.updateIssueInline({ title: 'Updated Title' });

      const vm = presenter.getViewModel();
      expect(vm!.title).toBe('Updated Title');
      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: { title: 'Updated Title' },
        })
      );
    });

    it('should update issue body and emit event', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Title',
        body: 'Original body',
      });
      await presenter.loadIssue(issue.id);

      await presenter.updateIssueInline({ body: 'Updated body' });

      const vm = presenter.getViewModel();
      expect(vm!.body).toBe('Updated body');
    });

    it('should do nothing when no issue is loaded', async () => {
      await presenter.updateIssueInline({ title: 'New' });
      expect(presenter.getViewModel()).toBeNull();
    });

    it('should notify subscribers on update', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Title',
        body: 'Body',
      });
      await presenter.loadIssue(issue.id);

      const callback = vi.fn();
      presenter.subscribe(callback);
      callback.mockClear();

      await presenter.updateIssueInline({ title: 'New Title' });

      expect(callback).toHaveBeenCalled();
      const lastCall = callback.mock.calls[callback.mock.calls.length - 1];
      expect(lastCall[0]?.title).toBe('New Title');
    });
  });

  describe('editIssue()', () => {
    it('should navigate to edit view', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Body',
      });
      await presenter.loadIssue(issue.id);

      presenter.editIssue();

      const state = getStateManager().getState();
      expect(state.viewState).toBe('edit');
    });

    it('should do nothing when no issue is loaded', () => {
      presenter.editIssue();

      const state = getStateManager().getState();
      expect(state.viewState).toBe('list'); // Default state, unchanged
    });
  });

  describe('goBack()', () => {
    it('should navigate to list view and clear selected issue', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Body',
      });
      await presenter.loadIssue(issue.id);

      const eventSpy = vi.fn();
      getEventBus().on('issue:selected', eventSpy);

      presenter.goBack();

      const state = getStateManager().getState();
      expect(state.viewState).toBe('list');
      expect(state.selectedIssue).toBeNull();
      expect(eventSpy).toHaveBeenCalledOnce();
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ issue: null })
      );
    });
  });

  describe('subscribe()', () => {
    it('should call callback immediately with current state', () => {
      const callback = vi.fn();

      presenter.subscribe(callback);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(null, []);
    });

    it('should return unsubscribe function', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test',
        body: 'Body',
      });

      const callback = vi.fn();
      const unsubscribe = presenter.subscribe(callback);
      callback.mockClear();

      unsubscribe();

      await presenter.loadIssue(issue.id);

      // Callback should not be called after unsubscribe
      expect(callback).not.toHaveBeenCalled();
    });

    it('should call callback with viewModel and comments', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Body',
      });
      await adapter.addComment(projectId, issue.id, { body: 'A comment' });

      const callback = vi.fn();
      presenter.subscribe(callback);
      callback.mockClear();

      await presenter.loadIssue(issue.id);

      // Should have been called with viewModel and comments
      const lastCall = callback.mock.calls[callback.mock.calls.length - 1];
      expect(lastCall[0]?.title).toBe('Test Issue');
      expect(lastCall[1]).toHaveLength(1);
      expect(lastCall[1][0]?.body).toBe('A comment');
    });
  });

  describe('permission flags', () => {
    it('should set canEdit and canDelete based on permission manager', async () => {
      // LocalStorageAdapter creates issues with local@traklet.dev
      // Our config has test@example.com, so permissions won't match
      const issue = await adapter.createIssue(projectId, {
        title: 'Not My Issue',
        body: 'Body',
      });

      await presenter.loadIssue(issue.id);

      const vm = presenter.getViewModel();
      expect(vm!.canEdit).toBe(false);
      expect(vm!.canDelete).toBe(false);
    });

    it('should allow canAddComment for authenticated user', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Body',
      });

      await presenter.loadIssue(issue.id);

      const vm = presenter.getViewModel();
      expect(vm!.canAddComment).toBe(true);
    });

    it('should set canEdit/canDelete to true when user matches author', async () => {
      // Reconfigure with the email that LocalStorageAdapter uses
      resetConfigManager();
      resetPermissionManager();

      const config: TrakletConfig = {
        adapter: 'localStorage',
        token: 'test-token',
        projects: [{ id: projectId, name: 'Test Project', identifier: 'test' }],
        user: {
          email: 'local@traklet.dev',
          name: 'Local User',
        },
      };
      getConfigManager().setConfig(config);

      const issue = await adapter.createIssue(projectId, {
        title: 'My Issue',
        body: 'Body',
      });

      await presenter.loadIssue(issue.id);

      const vm = presenter.getViewModel();
      expect(vm!.canEdit).toBe(true);
      expect(vm!.canDelete).toBe(true);
    });

    it('should set comment permission flags correctly for matching user', async () => {
      resetConfigManager();
      resetPermissionManager();

      const config: TrakletConfig = {
        adapter: 'localStorage',
        token: 'test-token',
        projects: [{ id: projectId, name: 'Test Project', identifier: 'test' }],
        user: {
          email: 'local@traklet.dev',
          name: 'Local User',
        },
      };
      getConfigManager().setConfig(config);

      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Body',
      });
      await adapter.addComment(projectId, issue.id, { body: 'My comment' });

      await presenter.loadIssue(issue.id);

      const comments = presenter.getComments();
      expect(comments[0]?.canEdit).toBe(true);
      expect(comments[0]?.canDelete).toBe(true);
    });

    it('should deny comment edit/delete for non-matching user', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Body',
      });
      await adapter.addComment(projectId, issue.id, { body: 'Not my comment' });

      await presenter.loadIssue(issue.id);

      const comments = presenter.getComments();
      expect(comments[0]?.canEdit).toBe(false);
      expect(comments[0]?.canDelete).toBe(false);
    });
  });

  describe('setProjectId()', () => {
    it('should reset viewModel, comments, and currentIssue', async () => {
      const issue = await adapter.createIssue(projectId, {
        title: 'Test Issue',
        body: 'Body',
      });
      await presenter.loadIssue(issue.id);
      expect(presenter.getViewModel()).not.toBeNull();

      presenter.setProjectId('other-project');

      expect(presenter.getViewModel()).toBeNull();
      expect(presenter.getComments()).toHaveLength(0);
    });
  });
});
