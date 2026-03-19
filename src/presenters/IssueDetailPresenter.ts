/**
 * IssueDetailPresenter - Presentation logic for the issue detail view
 * Handles issue display, comments, and mutations
 */

import type { IBackendAdapter, ICommentManager, IIssueDeleter } from '@/contracts';
import { adapterHasCapability } from '@/contracts';
import type { Issue, Comment } from '@/models';
import { getPermissionManager, getStateManager, getEventBus } from '@/core';
import type {
  IIssueDetailPresenter,
  IssueDetailViewModel,
  CommentViewModel,
} from './IPresenter';

export class IssueDetailPresenter implements IIssueDetailPresenter {
  private viewModel: IssueDetailViewModel | null = null;
  private comments: CommentViewModel[] = [];
  private subscribers: Set<
    (viewModel: IssueDetailViewModel | null, comments: readonly CommentViewModel[]) => void
  > = new Set();
  private currentIssue: Issue | null = null;
  private currentProjectId: string;

  constructor(
    private readonly adapter: IBackendAdapter,
    projectId: string
  ) {
    this.currentProjectId = projectId;
  }

  getViewModel(): IssueDetailViewModel | null {
    return this.viewModel;
  }

  getComments(): readonly CommentViewModel[] {
    return this.comments;
  }

  subscribe(
    callback: (viewModel: IssueDetailViewModel | null, comments: readonly CommentViewModel[]) => void
  ): () => void {
    this.subscribers.add(callback);
    callback(this.viewModel, this.comments);
    return () => this.subscribers.delete(callback);
  }

  async loadIssue(issueId: string): Promise<void> {
    try {
      const issue = await this.adapter.getIssue(this.currentProjectId, issueId);
      this.currentIssue = issue;
      this.viewModel = this.toDetailViewModel(issue);
      this.notifySubscribers();

      // Load comments if supported
      if (this.adapter.hasCapability('hasComments')) {
        await this.loadComments();
      }
    } catch (error) {
      console.error('Failed to load issue:', error);
      this.viewModel = null;
      this.notifySubscribers();
    }
  }

  async loadComments(): Promise<void> {
    if (!this.currentIssue) return;

    // Check if adapter supports comments
    if (!adapterHasCapability<ICommentManager>(this.adapter, 'getComments')) {
      return;
    }

    try {
      const comments = await (this.adapter as unknown as ICommentManager).getComments(
        this.currentProjectId,
        this.currentIssue.id
      );
      this.comments = comments.map((c) => this.toCommentViewModel(c));
      this.notifySubscribers();
    } catch (error) {
      console.error('Failed to load comments:', error);
    }
  }

  async closeIssue(): Promise<void> {
    if (!this.currentIssue) return;

    try {
      const updated = await this.adapter.updateIssue(
        this.currentProjectId,
        this.currentIssue.id,
        { state: 'closed' }
      );
      this.currentIssue = updated;
      this.viewModel = this.toDetailViewModel(updated);
      this.notifySubscribers();

      getEventBus().emit('issue:updated', {
        issue: updated,
        changes: { state: 'closed' },
      });
    } catch (error) {
      console.error('Failed to close issue:', error);
      throw error;
    }
  }

  async reopenIssue(): Promise<void> {
    if (!this.currentIssue) return;

    try {
      const updated = await this.adapter.updateIssue(
        this.currentProjectId,
        this.currentIssue.id,
        { state: 'open' }
      );
      this.currentIssue = updated;
      this.viewModel = this.toDetailViewModel(updated);
      this.notifySubscribers();

      getEventBus().emit('issue:updated', {
        issue: updated,
        changes: { state: 'open' },
      });
    } catch (error) {
      console.error('Failed to reopen issue:', error);
      throw error;
    }
  }

  async deleteIssue(): Promise<void> {
    if (!this.currentIssue) return;

    // Check if adapter supports deletion
    if (!adapterHasCapability<IIssueDeleter>(this.adapter, 'deleteIssue')) {
      throw new Error('This backend does not support issue deletion');
    }

    try {
      await (this.adapter as unknown as IIssueDeleter).deleteIssue(
        this.currentProjectId,
        this.currentIssue.id
      );

      getEventBus().emit('issue:deleted', {
        issueId: this.currentIssue.id,
        projectId: this.currentProjectId,
      });

      this.goBack();
    } catch (error) {
      console.error('Failed to delete issue:', error);
      throw error;
    }
  }

  async addComment(body: string): Promise<void> {
    if (!this.currentIssue) return;

    if (!adapterHasCapability<ICommentManager>(this.adapter, 'addComment')) {
      throw new Error('This backend does not support comments');
    }

    try {
      const comment = await (this.adapter as unknown as ICommentManager).addComment(
        this.currentProjectId,
        this.currentIssue.id,
        { body }
      );

      this.comments = [...this.comments, this.toCommentViewModel(comment)];
      this.notifySubscribers();

      getEventBus().emit('comment:created', {
        issueId: this.currentIssue.id,
        comment,
      });
    } catch (error) {
      console.error('Failed to add comment:', error);
      throw error;
    }
  }

  async editComment(commentId: string, body: string): Promise<void> {
    if (!this.currentIssue) return;

    if (!adapterHasCapability<ICommentManager>(this.adapter, 'updateComment')) {
      throw new Error('This backend does not support editing comments');
    }

    try {
      const updated = await (this.adapter as unknown as ICommentManager).updateComment(
        this.currentProjectId,
        this.currentIssue.id,
        commentId,
        { body }
      );

      this.comments = this.comments.map((c) =>
        c.id === commentId ? this.toCommentViewModel(updated) : c
      );
      this.notifySubscribers();

      getEventBus().emit('comment:updated', {
        issueId: this.currentIssue.id,
        comment: updated,
      });
    } catch (error) {
      console.error('Failed to edit comment:', error);
      throw error;
    }
  }

  async deleteComment(commentId: string): Promise<void> {
    if (!this.currentIssue) return;

    if (!adapterHasCapability<ICommentManager>(this.adapter, 'deleteComment')) {
      throw new Error('This backend does not support deleting comments');
    }

    try {
      await (this.adapter as unknown as ICommentManager).deleteComment(
        this.currentProjectId,
        this.currentIssue.id,
        commentId
      );

      this.comments = this.comments.filter((c) => c.id !== commentId);
      this.notifySubscribers();

      getEventBus().emit('comment:deleted', {
        issueId: this.currentIssue.id,
        commentId,
      });
    } catch (error) {
      console.error('Failed to delete comment:', error);
      throw error;
    }
  }

  editIssue(): void {
    if (!this.currentIssue) return;
    getStateManager().setState({ viewState: 'edit' });
  }

  async updateIssueInline(updates: { title?: string; body?: string }): Promise<void> {
    if (!this.currentIssue) return;

    try {
      const updated = await this.adapter.updateIssue(
        this.currentProjectId,
        this.currentIssue.id,
        updates
      );

      this.currentIssue = updated;
      this.viewModel = this.toDetailViewModel(updated);
      this.notifySubscribers();

      getEventBus().emit('issue:updated', { issue: updated, changes: updates });
    } catch (error) {
      console.error('Failed to update issue:', error);
      throw error;
    }
  }

  goBack(): void {
    getStateManager().setState({
      viewState: 'list',
      selectedIssue: null,
    });
    getEventBus().emit('issue:selected', { issue: null });
  }

  setProjectId(projectId: string): void {
    this.currentProjectId = projectId;
    this.viewModel = null;
    this.comments = [];
    this.currentIssue = null;
  }

  private toDetailViewModel(issue: Issue): IssueDetailViewModel {
    const permissionManager = getPermissionManager();

    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      priority: issue.priority,
      labels: issue.labels.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
      })),
      author: {
        id: issue.createdBy.id,
        name: issue.createdBy.name,
        avatarUrl: issue.createdBy.avatarUrl,
      },
      assignees: issue.assignees.map((a) => ({
        id: a.id,
        name: a.name,
        avatarUrl: a.avatarUrl,
      })),
      createdAt: this.formatDate(issue.createdAt),
      updatedAt: this.formatDate(issue.updatedAt),
      closedAt: issue.closedAt ? this.formatDate(issue.closedAt) : undefined,
      attachments: issue.attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        url: a.url,
        thumbnailUrl: a.thumbnailUrl,
        isImage: this.isImageMimeType(a.mimeType),
      })),
      canEdit: permissionManager.canEditIssue(issue),
      canDelete: permissionManager.canDeleteIssue(issue),
      canAddComment: permissionManager.canAddComment(),
    };
  }

  private toCommentViewModel(comment: Comment): CommentViewModel {
    const permissionManager = getPermissionManager();

    return {
      id: comment.id,
      body: comment.body,
      author: {
        id: comment.author.id,
        name: comment.author.name,
        avatarUrl: comment.author.avatarUrl,
      },
      createdAt: this.formatDate(comment.createdAt),
      updatedAt: this.formatDate(comment.updatedAt),
      isEdited: comment.updatedAt.getTime() > comment.createdAt.getTime(),
      canEdit: permissionManager.canEditComment(comment),
      canDelete: permissionManager.canDeleteComment(comment),
    };
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private isImageMimeType(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback(this.viewModel, this.comments);
      } catch (error) {
        console.error('Error in IssueDetailPresenter subscriber:', error);
      }
    }
  }
}
