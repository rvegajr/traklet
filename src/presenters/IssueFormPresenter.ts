/**
 * IssueFormPresenter - Presentation logic for create/edit issue form
 * Handles form state, validation, and submission
 */

import type { IBackendAdapter, ILabelReader } from '@/contracts';
import { adapterHasCapability } from '@/contracts';
import type { Issue, CreateIssueDTO, UpdateIssueDTO, IssuePriority } from '@/models';
import { getStateManager, getEventBus, getAuthManager } from '@/core';
import type { IIssueFormPresenter, IssueFormViewModel } from './IPresenter';

interface FormData {
  title: string;
  body: string;
  labels: string[];
  priority?: IssuePriority | undefined;
}

export class IssueFormPresenter implements IIssueFormPresenter {
  private viewModel: IssueFormViewModel;
  private subscribers: Set<(viewModel: IssueFormViewModel) => void> = new Set();
  private formData: FormData;
  private currentIssue: Issue | null = null;
  private currentProjectId: string;

  constructor(
    private readonly adapter: IBackendAdapter,
    projectId: string
  ) {
    this.currentProjectId = projectId;
    this.formData = this.createEmptyFormData();
    this.viewModel = this.createInitialViewModel();
  }

  getViewModel(): IssueFormViewModel {
    return this.viewModel;
  }

  subscribe(callback: (viewModel: IssueFormViewModel) => void): () => void {
    this.subscribers.add(callback);
    callback(this.viewModel);
    return () => this.subscribers.delete(callback);
  }

  async initCreate(): Promise<void> {
    this.currentIssue = null;
    this.formData = this.createEmptyFormData();

    const labels = await this.loadAvailableLabels();

    this.updateViewModel({
      isEditing: false,
      issue: {
        id: '',
        ...this.formData,
      },
      availableLabels: labels,
      isSubmitting: false,
      errors: {},
    });
  }

  async initEdit(issueId: string): Promise<void> {
    try {
      const issue = await this.adapter.getIssue(this.currentProjectId, issueId);
      this.currentIssue = issue;

      this.formData = {
        title: issue.title,
        body: issue.body,
        labels: issue.labels.map((l) => l.name),
        priority: issue.priority,
      };

      const labels = await this.loadAvailableLabels();

      this.updateViewModel({
        isEditing: true,
        issue: {
          id: issue.id,
          title: issue.title,
          body: issue.body,
          labels: issue.labels.map((l) => l.name),
          priority: issue.priority,
        },
        availableLabels: labels,
        isSubmitting: false,
        errors: {},
      });
    } catch (error) {
      console.error('Failed to load issue for editing:', error);
      this.cancel();
    }
  }

  updateField(field: 'title' | 'body' | 'labels' | 'priority', value: unknown): void {
    switch (field) {
      case 'title':
        this.formData.title = String(value);
        break;
      case 'body':
        this.formData.body = String(value);
        break;
      case 'labels':
        if (Array.isArray(value)) {
          this.formData.labels = value.map(String);
        }
        break;
      case 'priority':
        if (value === null || value === undefined) {
          this.formData.priority = undefined;
        } else if (
          value === 'low' ||
          value === 'medium' ||
          value === 'high' ||
          value === 'critical'
        ) {
          this.formData.priority = value;
        }
        break;
    }

    // Always expose formData in viewModel so UI bindings work in both create and edit modes
    const issueData = {
      id: this.currentIssue?.id ?? '',
      ...this.formData,
    };

    // Clear error for updated field
    if (this.viewModel.errors[field]) {
      const newErrors = { ...this.viewModel.errors };
      delete newErrors[field];
      this.updateViewModel({ issue: issueData, errors: newErrors });
    } else {
      this.updateViewModel({ issue: issueData });
    }
  }

  validate(): boolean {
    const errors: Record<string, string> = {};

    if (!this.formData.title.trim()) {
      errors['title'] = 'Title is required';
    } else if (this.formData.title.length > 256) {
      errors['title'] = 'Title must be less than 256 characters';
    }

    if (this.formData.body.length > 65536) {
      errors['body'] = 'Body is too long';
    }

    this.updateViewModel({ errors });

    return Object.keys(errors).length === 0;
  }

  async submit(): Promise<void> {
    if (!this.validate()) {
      return;
    }

    this.updateViewModel({ isSubmitting: true, errors: {} });

    try {
      if (this.viewModel.isEditing && this.currentIssue) {
        await this.updateIssue();
      } else {
        await this.createIssue();
      }
    } catch (error) {
      this.updateViewModel({
        isSubmitting: false,
        errors: {
          submit: error instanceof Error ? error.message : 'Failed to save issue',
        },
      });
    }
  }

  cancel(): void {
    const stateManager = getStateManager();

    if (this.viewModel.isEditing) {
      // Go back to detail view
      stateManager.setState({ viewState: 'detail' });
    } else {
      // Go back to list view
      stateManager.setState({ viewState: 'list' });
    }
  }

  setProjectId(projectId: string): void {
    this.currentProjectId = projectId;
    this.formData = this.createEmptyFormData();
    this.currentIssue = null;
    this.viewModel = this.createInitialViewModel();
  }

  private async createIssue(): Promise<void> {
    const dto: CreateIssueDTO = {
      title: this.formData.title.trim(),
      body: this.appendReporterFooter(this.formData.body.trim()),
      labels: this.formData.labels.length > 0 ? this.formData.labels : undefined,
      priority: this.formData.priority,
    };

    const issue = await this.adapter.createIssue(this.currentProjectId, dto);

    getEventBus().emit('issue:created', { issue });

    // Navigate to the new issue
    getStateManager().setState({
      viewState: 'detail',
      selectedIssue: issue,
    });

    this.updateViewModel({ isSubmitting: false });
  }

  private async updateIssue(): Promise<void> {
    if (!this.currentIssue) return;

    const dto: UpdateIssueDTO = {
      title: this.formData.title.trim(),
      body: this.formData.body.trim(),
      labels: this.formData.labels,
      priority: this.formData.priority,
    };

    const updated = await this.adapter.updateIssue(
      this.currentProjectId,
      this.currentIssue.id,
      dto
    );

    getEventBus().emit('issue:updated', {
      issue: updated,
      changes: dto as unknown as Record<string, unknown>,
    });

    // Navigate back to detail view
    getStateManager().setState({
      viewState: 'detail',
      selectedIssue: updated,
    });

    this.updateViewModel({ isSubmitting: false });
  }

  private async loadAvailableLabels(): Promise<
    readonly { id: string; name: string; color: string }[]
  > {
    if (!adapterHasCapability<ILabelReader>(this.adapter, 'getLabels')) {
      return [];
    }

    try {
      const labels = await (this.adapter as unknown as ILabelReader).getLabels(
        this.currentProjectId
      );
      return labels.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
      }));
    } catch (error) {
      console.error('Failed to load labels:', error);
      return [];
    }
  }

  private createEmptyFormData(): FormData {
    return {
      title: '',
      body: '',
      labels: [],
      priority: undefined,
    };
  }

  private createInitialViewModel(): IssueFormViewModel {
    return {
      isEditing: false,
      issue: undefined,
      availableLabels: [],
      isSubmitting: false,
      errors: {},
    };
  }

  private updateViewModel(updates: Partial<IssueFormViewModel>): void {
    this.viewModel = { ...this.viewModel, ...updates };
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback(this.viewModel);
      } catch (error) {
        console.error('Error in IssueFormPresenter subscriber:', error);
      }
    }
  }

  /**
   * Append a "Reported by" footer to the issue body when a user identity is configured.
   * This ensures proper tester attribution when using a shared PAT token.
   */
  private appendReporterFooter(body: string): string {
    const user = getAuthManager().getCurrentUser();
    if (!user) return body;

    const name = user.name || user.displayName || user.email;
    const parts = [name];
    if (user.email && user.email !== name) {
      parts.push(user.email);
    }

    return body + `\n\n---\n*Reported by: ${parts.join(' — ')}*`;
  }
}
