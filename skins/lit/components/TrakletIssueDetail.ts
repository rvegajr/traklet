/**
 * TrakletIssueDetail - Section-based issue/test case detail view
 *
 * For test case items (detected by template markers), renders structured
 * sections with visual navigation. For regular issues, renders the body
 * as-is with metadata.
 *
 * Tester flow:
 * 1. See objective + steps at top (read-only, always visible)
 * 2. Fill in actual result (editable section)
 * 3. Paste Jam.dev link (evidence section with guidance)
 * 4. Submit (auto-attaches diagnostics)
 */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles, buttonStyles, formStyles, labelStyles, layoutStyles } from '../styles/base';
import type { IIssueDetailPresenter, IssueDetailViewModel, CommentViewModel } from '@/presenters';
import { parseTestCaseBody, addJamLink, updateSection, addDiagnostics } from '@/core/TestCaseTemplate';
import type { ParsedTestCase, TestCaseSection } from '@/core/TestCaseTemplate';

@customElement('traklet-issue-detail')
export class TrakletIssueDetail extends LitElement {
  static override styles = [
    baseStyles,
    buttonStyles,
    formStyles,
    labelStyles,
    layoutStyles,
    css`
      :host {
        display: block;
      }

      .detail-header {
        padding: var(--traklet-space-md);
        border-bottom: 1px solid var(--traklet-border-muted);
      }

      .detail-header__title {
        font-size: var(--traklet-font-size-lg);
        font-weight: 600;
        margin: 0 0 var(--traklet-space-sm) 0;
        color: var(--traklet-text);
        line-height: 1.3;
      }

      .detail-header__meta {
        display: flex;
        align-items: center;
        gap: var(--traklet-space-sm);
        flex-wrap: wrap;
        font-size: var(--traklet-font-size-xs);
        color: var(--traklet-text-secondary);
      }

      .detail-header__number {
        color: var(--traklet-text-muted);
        font-weight: 500;
      }

      .detail-header__labels {
        display: flex;
        gap: var(--traklet-space-xs);
        flex-wrap: wrap;
        margin-top: var(--traklet-space-sm);
      }

      /* Section navigation */
      .section-nav {
        display: flex;
        gap: 2px;
        padding: var(--traklet-space-sm) var(--traklet-space-md);
        background: var(--traklet-bg-secondary);
        border-bottom: 1px solid var(--traklet-border-muted);
        overflow-x: auto;
      }

      .section-nav__item {
        padding: var(--traklet-space-xs) var(--traklet-space-sm);
        font-size: var(--traklet-font-size-xs);
        font-weight: 500;
        border-radius: var(--traklet-radius-sm);
        color: var(--traklet-text-secondary);
        cursor: pointer;
        white-space: nowrap;
        border: none;
        background: none;
        transition: all var(--traklet-transition-fast);
      }

      .section-nav__item:hover {
        background: var(--traklet-bg-hover);
        color: var(--traklet-text);
      }

      .section-nav__item--active {
        background: var(--traklet-primary);
        color: white;
      }

      .section-nav__item--active:hover {
        background: var(--traklet-primary-hover);
        color: white;
      }

      .section-nav__item--editable::after {
        content: '*';
        margin-left: 2px;
        color: var(--traklet-warning);
      }

      .section-nav__item--active.section-nav__item--editable::after {
        color: rgba(255, 255, 255, 0.7);
      }

      /* Section content */
      .sections {
        padding: var(--traklet-space-md);
      }

      .section {
        margin-bottom: var(--traklet-space-lg);
        scroll-margin-top: var(--traklet-space-md);
      }

      .section:last-child {
        margin-bottom: 0;
      }

      .section__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--traklet-space-sm);
      }

      .section__title {
        font-size: var(--traklet-font-size-md);
        font-weight: 600;
        color: var(--traklet-text);
        margin: 0;
      }

      .section__badge {
        font-size: var(--traklet-font-size-xs);
        padding: 2px 8px;
        border-radius: var(--traklet-radius-full);
        font-weight: 500;
      }

      .section__badge--readonly {
        background: var(--traklet-bg-secondary);
        color: var(--traklet-text-muted);
      }

      .section__badge--editable {
        background: rgba(9, 105, 218, 0.1);
        color: var(--traklet-primary);
      }

      .section__content {
        padding: var(--traklet-space-md);
        background: var(--traklet-bg-secondary);
        border-radius: var(--traklet-radius-md);
        border: 1px solid var(--traklet-border-muted);
        font-size: var(--traklet-font-size-sm);
        line-height: 1.6;
        white-space: pre-wrap;
        word-wrap: break-word;
      }

      .section__content--editable {
        border-color: var(--traklet-primary);
        border-style: dashed;
        background: var(--traklet-bg);
      }

      .section__content ol,
      .section__content ul {
        margin: 0;
        padding-left: var(--traklet-space-lg);
      }

      .section__content li {
        margin-bottom: var(--traklet-space-xs);
      }

      .section__placeholder {
        color: var(--traklet-text-muted);
        font-style: italic;
      }

      /* Jam.dev evidence section */
      .jam-link-input {
        display: flex;
        gap: var(--traklet-space-sm);
        margin-top: var(--traklet-space-sm);
      }

      .jam-link-input input {
        flex: 1;
      }

      .jam-card {
        display: flex;
        align-items: center;
        gap: var(--traklet-space-md);
        padding: var(--traklet-space-md);
        background: var(--traklet-bg);
        border: 1px solid var(--traklet-border);
        border-radius: var(--traklet-radius-md);
        margin-bottom: var(--traklet-space-sm);
      }

      .jam-card__icon {
        width: 32px;
        height: 32px;
        background: #7c3aed;
        border-radius: var(--traklet-radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: var(--traklet-font-size-sm);
        flex-shrink: 0;
      }

      .jam-card__info {
        flex: 1;
        min-width: 0;
      }

      .jam-card__label {
        font-weight: 500;
        font-size: var(--traklet-font-size-sm);
        color: var(--traklet-text);
      }

      .jam-card__url {
        font-size: var(--traklet-font-size-xs);
        color: var(--traklet-primary);
        text-decoration: none;
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .jam-card__url:hover {
        text-decoration: underline;
      }

      /* Guidance callout */
      .callout {
        padding: var(--traklet-space-md);
        border-radius: var(--traklet-radius-md);
        font-size: var(--traklet-font-size-sm);
        line-height: 1.5;
        margin-top: var(--traklet-space-sm);
      }

      .callout--info {
        background: rgba(9, 105, 218, 0.06);
        border: 1px solid rgba(9, 105, 218, 0.2);
        color: var(--traklet-text);
      }

      .callout--info strong {
        color: var(--traklet-primary);
      }

      /* Actions bar */
      .actions-bar {
        display: flex;
        gap: var(--traklet-space-sm);
        padding: var(--traklet-space-md);
        border-top: 1px solid var(--traklet-border-muted);
        background: var(--traklet-bg-secondary);
      }

      .actions-bar__spacer {
        flex: 1;
      }

      /* Regular issue body (non-test-case) */
      .issue-body {
        padding: var(--traklet-space-md);
        font-size: var(--traklet-font-size-sm);
        line-height: 1.6;
        white-space: pre-wrap;
        word-wrap: break-word;
      }

      /* Edit textarea */
      .section-editor {
        width: 100%;
        min-height: 80px;
        padding: var(--traklet-space-sm);
        font-family: inherit;
        font-size: var(--traklet-font-size-sm);
        line-height: 1.5;
        border: 1px solid var(--traklet-primary);
        border-radius: var(--traklet-radius-md);
        resize: vertical;
        color: var(--traklet-text);
        background: var(--traklet-bg);
      }

      .section-editor:focus {
        outline: none;
        box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.1);
      }
    `,
  ];

  @property({ attribute: false })
  declare presenter: IIssueDetailPresenter | undefined;

  @property({ attribute: false })
  declare diagnosticsMarkdown: string;

  @state() declare private viewModel: IssueDetailViewModel | null;
  @state() declare private comments: CommentViewModel[];
  @state() declare private isLoading: boolean;
  @state() declare private error: string | null;
  @state() declare private parsedBody: ParsedTestCase | null;
  @state() declare private activeSection: string;
  @state() declare private editingSectionId: string | null;
  @state() declare private editingSectionContent: string;
  @state() declare private jamUrlInput: string;
  @state() declare private isSaving: boolean;

  constructor() {
    super();
    this.diagnosticsMarkdown = '';
    this.viewModel = null;
    this.comments = [];
    this.isLoading = true;
    this.error = null;
    this.parsedBody = null;
    this.activeSection = '';
    this.editingSectionId = null;
    this.editingSectionContent = '';
    this.jamUrlInput = '';
    this.isSaving = false;
  }

  private unsubscribe: (() => void) | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.subscribeToPresenter();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has('presenter')) {
      this.unsubscribe?.();
      this.subscribeToPresenter();
    }
  }

  private subscribeToPresenter() {
    if (!this.presenter) return;

    this.unsubscribe = this.presenter.subscribe(() => {
      const vm = this.presenter!.getViewModel();
      if (vm) {
        this.viewModel = vm;
        this.parsedBody = parseTestCaseBody(vm.body);
        if (!this.activeSection && this.parsedBody.sections.length > 0) {
          this.activeSection = this.parsedBody.sections[0]!.id;
        }
        this.isLoading = false;
      }
      this.comments = [...this.presenter!.getComments()];
    });

    // Initial load
    const vm = this.presenter.getViewModel();
    if (vm) {
      this.viewModel = vm;
      this.parsedBody = parseTestCaseBody(vm.body);
      if (this.parsedBody.sections.length > 0) {
        this.activeSection = this.parsedBody.sections[0]!.id;
      }
      this.isLoading = false;
    }
  }

  override render() {
    if (this.isLoading) {
      return html`<div class="traklet-loading"><div class="traklet-spinner"></div></div>`;
    }

    if (this.error) {
      return html`<div class="traklet-empty">${this.error}</div>`;
    }

    if (!this.viewModel) {
      return html`<div class="traklet-empty">No issue selected</div>`;
    }

    return html`
      ${this.renderHeader()}
      ${this.parsedBody?.isTestCase ? this.renderTestCase() : this.renderRegularIssue()}
      ${this.renderActionsBar()}
    `;
  }

  // ============================================
  // Header
  // ============================================

  private renderHeader() {
    const vm = this.viewModel!;

    return html`
      <div class="detail-header" data-testid="traklet-detail-header">
        <h2 class="detail-header__title">${vm.title}</h2>
        <div class="detail-header__meta">
          <span class="detail-header__number">#${vm.number}</span>
          <span class="traklet-state-badge traklet-state-badge--${vm.state}">${vm.state}</span>
          ${vm.priority ? html`<span>${vm.priority}</span>` : nothing}
          <span>by ${vm.author.name}</span>
          <span>${vm.createdAt}</span>
        </div>
        ${vm.labels.length > 0
          ? html`
              <div class="detail-header__labels">
                ${vm.labels.map(
                  (label) => html`
                    <span
                      class="traklet-label-badge"
                      style="background: ${label.color}20; color: ${label.color}; border: 1px solid ${label.color}40;"
                    >
                      ${label.name}
                    </span>
                  `
                )}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  // ============================================
  // Test Case View (section-based)
  // ============================================

  private renderTestCase() {
    const sections = this.parsedBody!.sections;

    return html`
      ${this.renderSectionNav(sections)}
      <div class="sections" data-testid="traklet-detail-sections">
        ${sections.map((section) => this.renderSection(section))}
      </div>
    `;
  }

  private renderSectionNav(sections: readonly TestCaseSection[]) {
    return html`
      <nav class="section-nav" data-testid="traklet-section-nav">
        ${sections.map(
          (section) => html`
            <button
              class="section-nav__item
                ${this.activeSection === section.id ? 'section-nav__item--active' : ''}
                ${section.editable ? 'section-nav__item--editable' : ''}"
              data-testid="traklet-nav-${section.id}"
              @click=${() => this.scrollToSection(section.id)}
            >
              ${section.title}
            </button>
          `
        )}
      </nav>
    `;
  }

  private renderSection(section: TestCaseSection) {
    const isEditing = this.editingSectionId === section.id;

    return html`
      <div
        class="section"
        id="section-${section.id}"
        data-testid="traklet-section-${section.id}"
      >
        <div class="section__header">
          <h3 class="section__title">${section.title}</h3>
          <span class="section__badge ${section.editable ? 'section__badge--editable' : 'section__badge--readonly'}">
            ${section.editable ? 'Editable' : 'Read-only'}
          </span>
        </div>

        ${section.role === 'evidence'
          ? this.renderEvidenceSection(section)
          : isEditing
            ? this.renderSectionEditor(section)
            : this.renderSectionContent(section)}
      </div>
    `;
  }

  private renderSectionContent(section: TestCaseSection) {
    const isEmpty = !section.content || section.content.includes('_Not yet');

    return html`
      <div
        class="section__content ${section.editable ? 'section__content--editable' : ''}"
        @click=${() => section.editable && this.startEditingSection(section)}
      >
        ${isEmpty
          ? html`<span class="section__placeholder">Click to add ${section.title.toLowerCase()}...</span>`
          : section.content}
      </div>
    `;
  }

  private renderSectionEditor(section: TestCaseSection) {
    return html`
      <textarea
        class="section-editor"
        data-testid="traklet-editor-${section.id}"
        .value=${this.editingSectionContent}
        @input=${(e: InputEvent) => {
          this.editingSectionContent = (e.target as HTMLTextAreaElement).value;
        }}
        @blur=${() => this.commitSectionEdit(section.id)}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Escape') this.cancelSectionEdit();
        }}
      ></textarea>
      <div style="display: flex; gap: 4px; margin-top: 4px;">
        <button
          class="traklet-btn traklet-btn--primary traklet-btn--sm"
          @click=${() => this.commitSectionEdit(section.id)}
          data-testid="traklet-btn-save-section"
        >
          Save
        </button>
        <button
          class="traklet-btn traklet-btn--ghost traklet-btn--sm"
          @click=${this.cancelSectionEdit}
        >
          Cancel
        </button>
      </div>
    `;
  }

  // ============================================
  // Evidence Section (Jam.dev integration)
  // ============================================

  private renderEvidenceSection(_section: TestCaseSection) {
    const jamLinks = this.parsedBody?.jamLinks ?? [];

    return html`
      <div class="section__content section__content--editable">
        ${jamLinks.length > 0
          ? html`
              ${jamLinks.map(
                (link) => html`
                  <div class="jam-card" data-testid="traklet-jam-card">
                    <div class="jam-card__icon">J</div>
                    <div class="jam-card__info">
                      <div class="jam-card__label">${link.label}</div>
                      <a
                        class="jam-card__url"
                        href="${link.url}"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ${link.url}
                      </a>
                    </div>
                  </div>
                `
              )}
            `
          : nothing}

        <div class="jam-link-input">
          <input
            class="traklet-input"
            type="url"
            placeholder="Paste Jam.dev link (https://jam.dev/c/...)"
            data-testid="traklet-input-jam-url"
            .value=${this.jamUrlInput}
            @input=${(e: InputEvent) => {
              this.jamUrlInput = (e.target as HTMLInputElement).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter') this.handleAddJamLink();
            }}
          />
          <button
            class="traklet-btn traklet-btn--primary traklet-btn--sm"
            data-testid="traklet-btn-add-jam"
            ?disabled=${!this.isValidJamUrl(this.jamUrlInput)}
            @click=${this.handleAddJamLink}
          >
            Add
          </button>
        </div>

        <div class="callout callout--info">
          <strong>How to record:</strong> Install the
          <a href="https://jam.dev" target="_blank" rel="noopener noreferrer">Jam.dev</a>
          browser extension. Click the Jam icon to record your screen while testing.
          When done, copy the share link and paste it above.
        </div>
      </div>
    `;
  }

  // ============================================
  // Regular Issue View (non-test-case)
  // ============================================

  private renderRegularIssue() {
    const vm = this.viewModel!;

    // Even for regular issues, check for Jam links
    const jamLinks = this.parsedBody?.jamLinks ?? [];

    return html`
      <div class="issue-body" data-testid="traklet-issue-body">
        ${vm.body}
      </div>
      ${jamLinks.length > 0
        ? html`
            <div class="sections">
              <div class="section">
                <div class="section__header">
                  <h3 class="section__title">Recordings</h3>
                </div>
                ${jamLinks.map(
                  (link) => html`
                    <div class="jam-card">
                      <div class="jam-card__icon">J</div>
                      <div class="jam-card__info">
                        <div class="jam-card__label">${link.label}</div>
                        <a class="jam-card__url" href="${link.url}" target="_blank" rel="noopener">${link.url}</a>
                      </div>
                    </div>
                  `
                )}
              </div>
            </div>
          `
        : nothing}
    `;
  }

  // ============================================
  // Actions Bar
  // ============================================

  private renderActionsBar() {
    const vm = this.viewModel!;

    return html`
      <div class="actions-bar" data-testid="traklet-detail-actions">
        ${vm.state === 'open'
          ? html`
              <button
                class="traklet-btn traklet-btn--secondary traklet-btn--sm"
                data-testid="traklet-btn-close-issue"
                @click=${this.handleCloseIssue}
              >
                Close
              </button>
            `
          : html`
              <button
                class="traklet-btn traklet-btn--secondary traklet-btn--sm"
                data-testid="traklet-btn-reopen-issue"
                @click=${this.handleReopenIssue}
              >
                Reopen
              </button>
            `}

        ${vm.canEdit
          ? html`
              <button
                class="traklet-btn traklet-btn--ghost traklet-btn--sm"
                data-testid="traklet-btn-edit"
                @click=${this.handleEdit}
              >
                Edit
              </button>
            `
          : nothing}

        <div class="actions-bar__spacer"></div>

        ${this.parsedBody?.isTestCase
          ? html`
              <button
                class="traklet-btn traklet-btn--primary traklet-btn--sm"
                data-testid="traklet-btn-submit-results"
                ?disabled=${this.isSaving}
                @click=${this.handleSubmitResults}
              >
                ${this.isSaving ? 'Saving...' : 'Submit Results'}
              </button>
            `
          : nothing}
      </div>
    `;
  }

  // ============================================
  // Event Handlers
  // ============================================

  private scrollToSection(sectionId: string) {
    this.activeSection = sectionId;
    const el = this.shadowRoot?.querySelector(`#section-${sectionId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private startEditingSection(section: TestCaseSection) {
    if (!section.editable) return;
    this.editingSectionId = section.id;
    this.editingSectionContent =
      section.content.includes('_Not yet') || section.content.includes('_No ')
        ? ''
        : section.content;
  }

  private async commitSectionEdit(sectionId: string) {
    if (!this.presenter || !this.viewModel || !this.editingSectionContent.trim()) {
      this.cancelSectionEdit();
      return;
    }

    const updatedBody = updateSection(
      this.viewModel.body,
      sectionId,
      this.editingSectionContent.trim()
    );

    await this.presenter.updateIssueInline({ body: updatedBody });
    this.editingSectionId = null;
    this.editingSectionContent = '';
  }

  private cancelSectionEdit() {
    this.editingSectionId = null;
    this.editingSectionContent = '';
  }

  private isValidJamUrl(url: string): boolean {
    return /^https:\/\/jam\.dev\/c\/.+/.test(url.trim());
  }

  private async handleAddJamLink() {
    const url = this.jamUrlInput.trim();
    if (!this.isValidJamUrl(url) || !this.presenter || !this.viewModel) return;

    const updatedBody = addJamLink(this.viewModel.body, url);
    await this.presenter.updateIssueInline({ body: updatedBody });
    this.jamUrlInput = '';
  }

  private async handleSubmitResults() {
    if (!this.presenter || !this.viewModel) return;

    this.isSaving = true;

    try {
      let body = this.viewModel.body;

      // Auto-attach diagnostics if available
      if (this.diagnosticsMarkdown) {
        body = addDiagnostics(body, this.diagnosticsMarkdown);
      }

      await this.presenter.updateIssueInline({ body });
    } finally {
      this.isSaving = false;
    }
  }

  private async handleCloseIssue() {
    await this.presenter?.closeIssue();
  }

  private async handleReopenIssue() {
    await this.presenter?.reopenIssue();
  }

  private handleEdit() {
    // Navigate to edit view via the presenter
    if (this.viewModel?.id) {
      this.dispatchEvent(
        new CustomEvent('navigate', {
          detail: { view: 'edit', issueId: this.viewModel.id },
          bubbles: true,
          composed: true,
        })
      );
    }
  }
}
