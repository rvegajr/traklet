/**
 * TrakletIssueForm - Create/Edit issue form
 *
 * Renders a form for creating new issues or editing existing ones.
 * Uses IssueFormPresenter for all logic (validation, submit, cancel).
 */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles, buttonStyles, formStyles, layoutStyles } from '../styles/base';
import type { IIssueFormPresenter, IssueFormViewModel } from '@/presenters';

@customElement('traklet-issue-form')
export class TrakletIssueForm extends LitElement {
  static override styles = [
    baseStyles,
    buttonStyles,
    formStyles,
    layoutStyles,
    css`
      :host {
        display: block;
      }

      .form {
        padding: var(--traklet-space-md);
      }

      .form__field {
        margin-bottom: var(--traklet-space-md);
      }

      .form__label {
        display: block;
        margin-bottom: var(--traklet-space-xs);
        font-size: var(--traklet-font-size-sm);
        font-weight: 500;
        color: var(--traklet-text);
      }

      .form__input {
        width: 100%;
        padding: var(--traklet-space-sm) var(--traklet-space-md);
        font-size: var(--traklet-font-size-sm);
        font-family: inherit;
        color: var(--traklet-text);
        background: var(--traklet-bg);
        border: 1px solid var(--traklet-border);
        border-radius: var(--traklet-radius-md);
        transition: border-color var(--traklet-transition-fast);
        box-sizing: border-box;
      }

      .form__input:focus {
        outline: none;
        border-color: var(--traklet-primary);
        box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
      }

      .form__input--error {
        border-color: var(--traklet-danger);
      }

      .form__textarea {
        min-height: 80px;
        resize: vertical;
        line-height: 1.5;
      }

      .form__select {
        width: 100%;
        padding: var(--traklet-space-sm) var(--traklet-space-md);
        font-size: var(--traklet-font-size-sm);
        font-family: inherit;
        color: var(--traklet-text);
        background: var(--traklet-bg);
        border: 1px solid var(--traklet-border);
        border-radius: var(--traklet-radius-md);
        cursor: pointer;
        box-sizing: border-box;
      }

      .form__error {
        margin-top: var(--traklet-space-xs);
        font-size: var(--traklet-font-size-xs);
        color: var(--traklet-danger);
      }

      .form__actions {
        display: flex;
        gap: var(--traklet-space-sm);
        justify-content: flex-end;
        padding-top: var(--traklet-space-md);
        border-top: 1px solid var(--traklet-border-muted);
      }

      .form__labels-input {
        display: flex;
        flex-wrap: wrap;
        gap: var(--traklet-space-xs);
        padding: var(--traklet-space-sm);
        border: 1px solid var(--traklet-border);
        border-radius: var(--traklet-radius-md);
        background: var(--traklet-bg);
        min-height: 36px;
        cursor: text;
      }

      .form__labels-input:focus-within {
        border-color: var(--traklet-primary);
        box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
      }

      .form__label-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        font-size: var(--traklet-font-size-xs);
        background: var(--traklet-bg-secondary);
        border: 1px solid var(--traklet-border);
        border-radius: var(--traklet-radius-full);
      }

      .form__label-tag-remove {
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        color: var(--traklet-text-muted);
        background: none;
        border: none;
        padding: 0;
      }

      .form__label-tag-remove:hover {
        color: var(--traklet-danger);
      }

      .form__label-input {
        border: none;
        outline: none;
        font-size: var(--traklet-font-size-xs);
        font-family: inherit;
        background: transparent;
        min-width: 80px;
        flex: 1;
        padding: 0;
        color: var(--traklet-text);
      }

      .form__hint {
        font-size: var(--traklet-font-size-xs);
        color: var(--traklet-text-muted);
        margin-top: 2px;
      }
    `,
  ];

  @property({ attribute: false })
  declare presenter: IIssueFormPresenter | undefined;

  @property({ type: String })
  declare issueId: string | undefined;

  @state() declare private viewModel: IssueFormViewModel;
  @state() declare private labelInput: string;

  constructor() {
    super();
    this.labelInput = '';
    this.viewModel = {
      isEditing: false,
      availableLabels: [],
      isSubmitting: false,
      errors: {},
    };
  }

  private unsubscribe: (() => void) | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.initForm();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has('presenter') || changed.has('issueId')) {
      this.unsubscribe?.();
      this.initForm();
    }
  }

  private async initForm() {
    if (!this.presenter) return;

    this.unsubscribe = this.presenter.subscribe((vm) => {
      this.viewModel = vm;
    });

    if (this.issueId) {
      await this.presenter.initEdit(this.issueId);
    } else {
      await this.presenter.initCreate();
    }
  }

  override render() {
    const vm = this.viewModel;
    const title = vm.issue?.title ?? '';
    const body = vm.issue?.body ?? '';
    const priority = vm.issue?.priority ?? '';
    const labels = vm.issue?.labels ?? [];

    return html`
      <div class="form" data-testid="traklet-form-issue">
        <!-- Title -->
        <div class="form__field">
          <label class="form__label" for="title">Title</label>
          <input
            id="title"
            class="form__input ${vm.errors['title'] ? 'form__input--error' : ''}"
            type="text"
            placeholder="Issue title"
            data-testid="traklet-input-title"
            .value=${title}
            @input=${(e: InputEvent) => this.presenter?.updateField('title', (e.target as HTMLInputElement).value)}
            ?disabled=${vm.isSubmitting}
          />
          ${vm.errors['title'] ? html`<div class="form__error">${vm.errors['title']}</div>` : nothing}
        </div>

        <!-- Body -->
        <div class="form__field">
          <label class="form__label" for="body">Description</label>
          <textarea
            id="body"
            class="form__input form__textarea ${vm.errors['body'] ? 'form__input--error' : ''}"
            placeholder="Describe the issue..."
            data-testid="traklet-input-body"
            .value=${body}
            @input=${(e: InputEvent) => this.presenter?.updateField('body', (e.target as HTMLTextAreaElement).value)}
            ?disabled=${vm.isSubmitting}
          ></textarea>
          ${vm.errors['body'] ? html`<div class="form__error">${vm.errors['body']}</div>` : nothing}
        </div>

        <!-- Priority -->
        <div class="form__field">
          <label class="form__label" for="priority">Priority</label>
          <select
            id="priority"
            class="form__select"
            data-testid="traklet-select-priority"
            .value=${priority}
            @change=${(e: Event) => {
              const val = (e.target as HTMLSelectElement).value;
              this.presenter?.updateField('priority', val || null);
            }}
            ?disabled=${vm.isSubmitting}
          >
            <option value="">None</option>
            <option value="low" ?selected=${priority === 'low'}>Low</option>
            <option value="medium" ?selected=${priority === 'medium'}>Medium</option>
            <option value="high" ?selected=${priority === 'high'}>High</option>
            <option value="critical" ?selected=${priority === 'critical'}>Critical</option>
          </select>
        </div>

        <!-- Labels -->
        <div class="form__field">
          <label class="form__label">Labels</label>
          <div class="form__labels-input" @click=${this.focusLabelInput}>
            ${labels.map(
              (label) => html`
                <span class="form__label-tag">
                  ${label}
                  <button
                    class="form__label-tag-remove"
                    @click=${() => this.removeLabel(label)}
                    ?disabled=${vm.isSubmitting}
                  >x</button>
                </span>
              `
            )}
            <input
              class="form__label-input"
              type="text"
              placeholder=${labels.length === 0 ? 'Add labels...' : ''}
              data-testid="traklet-input-labels"
              .value=${this.labelInput}
              @input=${(e: InputEvent) => { this.labelInput = (e.target as HTMLInputElement).value; }}
              @keydown=${this.handleLabelKeydown}
              ?disabled=${vm.isSubmitting}
            />
          </div>
          <div class="form__hint">Press Enter or comma to add a label</div>
        </div>

        <!-- Submit error -->
        ${vm.errors['submit'] ? html`<div class="form__error" style="margin-bottom: 12px;">${vm.errors['submit']}</div>` : nothing}

        <!-- Actions -->
        <div class="form__actions">
          <button
            class="traklet-btn traklet-btn--secondary"
            data-testid="traklet-btn-cancel"
            @click=${() => this.presenter?.cancel()}
            ?disabled=${vm.isSubmitting}
          >
            Cancel
          </button>
          <button
            class="traklet-btn traklet-btn--primary"
            data-testid="traklet-btn-submit"
            @click=${this.handleSubmit}
            ?disabled=${vm.isSubmitting}
          >
            ${vm.isSubmitting ? 'Saving...' : vm.isEditing ? 'Save Changes' : 'Create Issue'}
          </button>
        </div>
      </div>
    `;
  }

  private handleLabelKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      this.addCurrentLabel();
    } else if (e.key === 'Backspace' && !this.labelInput) {
      // Remove last label on backspace in empty input
      const labels = [...(this.viewModel.issue?.labels ?? [])];
      if (labels.length > 0) {
        labels.pop();
        this.presenter?.updateField('labels', labels);
      }
    }
  }

  private addCurrentLabel() {
    const label = this.labelInput.trim().replace(/,/g, '');
    if (!label) return;

    const current = [...(this.viewModel.issue?.labels ?? [])];
    if (!current.includes(label)) {
      current.push(label);
      this.presenter?.updateField('labels', current);
    }
    this.labelInput = '';
  }

  private removeLabel(label: string) {
    const current = (this.viewModel.issue?.labels ?? []).filter((l) => l !== label);
    this.presenter?.updateField('labels', current);
  }

  private focusLabelInput() {
    const input = this.shadowRoot?.querySelector('.form__label-input') as HTMLInputElement | null;
    input?.focus();
  }

  private async handleSubmit() {
    // Add any pending label text before submitting
    if (this.labelInput.trim()) {
      this.addCurrentLabel();
    }
    await this.presenter?.submit();
  }
}
