/**
 * TrakletIssueList - Issue list component
 * Displays a list of issues with filtering and actions
 */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles, buttonStyles, formStyles, labelStyles, layoutStyles } from '../styles/base';
import type {
  IssueListViewModel,
  IssueListItemViewModel,
  IIssueListPresenter,
  ITestSuiteListPresenter,
  TestSuiteListViewModel,
  SuiteViewModel,
  TestCaseListItemViewModel,
} from '../../../src/presenters';

@customElement('traklet-issue-list')
export class TrakletIssueList extends LitElement {
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

      .issue-list {
        display: flex;
        flex-direction: column;
      }

      .issue-list__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--traklet-space-md);
        padding: var(--traklet-space-md);
        border-bottom: 1px solid var(--traklet-border-muted);
      }

      .issue-list__filters {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
      }

      .issue-list__search {
        min-width: 120px;
        flex: 1;
      }

      .issue-list__assignee-select {
        padding: var(--traklet-space-xs) var(--traklet-space-sm);
        font-size: var(--traklet-font-size-xs);
        border: 1px solid var(--traklet-border);
        border-radius: var(--traklet-radius-md);
        background: var(--traklet-bg);
        color: var(--traklet-text);
        max-width: 140px;
        cursor: pointer;
      }

      .issue-list__items {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .issue-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px var(--traklet-space-md);
        border-bottom: 1px solid var(--traklet-border-muted);
        cursor: pointer;
        transition: background var(--traklet-transition-fast);
      }

      .issue-item:hover {
        background: var(--traklet-bg-hover);
      }

      .issue-item__icon {
        flex-shrink: 0;
      }

      .issue-item__icon--open { color: var(--traklet-open); }
      .issue-item__icon--closed { color: var(--traklet-closed); }

      .issue-item__content {
        flex: 1;
        min-width: 0;
      }

      .issue-item__row {
        display: flex;
        align-items: baseline;
        gap: 6px;
      }

      .issue-item__number {
        font-size: 11px;
        font-weight: 500;
        color: var(--traklet-text-muted);
        flex-shrink: 0;
      }

      .issue-item__title {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--traklet-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .issue-item:hover .issue-item__title {
        color: var(--traklet-primary);
      }

      .issue-item__priority {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .issue-item__priority--critical { background: #dc2626; }
      .issue-item__priority--high { background: #f97316; }
      .issue-item__priority--medium { background: #eab308; }
      .issue-item__priority--low { background: #22c55e; }

      .issue-item__meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--traklet-text-muted);
        margin-top: 1px;
      }

      .issue-item__labels {
        display: inline-flex;
        gap: 3px;
      }

      .issue-item__label-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .issue-item__comments {
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }

      .filter-btn {
        padding: var(--traklet-space-xs) var(--traklet-space-sm);
        font-size: var(--traklet-font-size-xs);
        border-radius: var(--traklet-radius-sm);
      }

      .filter-btn--active {
        background: var(--traklet-primary);
        color: white;
      }

      .load-more {
        padding: var(--traklet-space-md);
        text-align: center;
      }

      /* View mode toggle */
      .view-toggle {
        display: inline-flex;
        border: 1px solid var(--traklet-border);
        border-radius: var(--traklet-radius-sm);
        overflow: hidden;
      }

      .view-toggle__btn {
        padding: 2px 8px;
        font-size: 11px;
        border: none;
        background: transparent;
        color: var(--traklet-text-muted);
        cursor: pointer;
      }

      .view-toggle__btn--active {
        background: var(--traklet-primary);
        color: white;
      }

      /* Suite group styles */
      .suite-group {
        border-bottom: 1px solid var(--traklet-border-muted);
      }

      .suite-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px var(--traklet-space-md);
        cursor: pointer;
        user-select: none;
        background: var(--traklet-bg-subtle, rgba(128,128,128,0.05));
        transition: background var(--traklet-transition-fast);
      }

      .suite-header:hover {
        background: var(--traklet-bg-hover);
      }

      .suite-header__chevron {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
        transition: transform 0.15s ease;
        color: var(--traklet-text-muted);
      }

      .suite-header__chevron--expanded {
        transform: rotate(90deg);
      }

      .suite-header__name {
        font-size: 12px;
        font-weight: 700;
        color: var(--traklet-text);
        flex: 1;
      }

      .suite-header__count {
        font-size: 11px;
        color: var(--traklet-text-muted);
      }

      .suite-header__progress {
        display: flex;
        gap: 2px;
        height: 4px;
        width: 60px;
        border-radius: 2px;
        overflow: hidden;
        background: var(--traklet-border-muted);
      }

      .suite-header__progress-bar {
        height: 100%;
        transition: width 0.2s ease;
      }

      .suite-header__progress-bar--passed { background: #22c55e; }
      .suite-header__progress-bar--failed { background: #dc2626; }
      .suite-header__progress-bar--blocked { background: #f97316; }
      .suite-header__progress-bar--not-tested { background: var(--traklet-border-muted); }

      .suite-body {
        border-top: 1px solid var(--traklet-border-muted);
      }

      /* Blocked indicator */
      .issue-item--blocked {
        opacity: 0.7;
      }

      .issue-item__blocked-badge {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: 10px;
        color: #f97316;
        font-weight: 600;
      }

      .issue-item__status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .issue-item__status-dot--passed { background: #22c55e; }
      .issue-item__status-dot--failed { background: #dc2626; }
      .issue-item__status-dot--blocked { background: #f97316; }
      .issue-item__status-dot--not-tested { background: #94a3b8; }
      .issue-item__status-dot--skipped { background: #a855f7; }
    `,
  ];

  @property({ type: Object })
  declare presenter: IIssueListPresenter | undefined;

  @property({ type: Object })
  declare suitePresenter: ITestSuiteListPresenter | undefined;

  @state()
  declare private viewModel: IssueListViewModel;

  @state()
  private suiteViewModel: TestSuiteListViewModel = {
    suites: [],
    isLoading: false,
    error: null,
    viewMode: 'flat',
  };

  constructor() {
    super();
    this.viewModel = {
      issues: [],
      isLoading: false,
      error: null,
      pagination: { page: 1, limit: 50, total: 0, hasMore: false },
      filters: { state: 'open', labels: [], search: '', assignee: null },
      availableAssignees: [],
      canCreateIssue: false,
    };
  }

  private unsubscribe?: () => void;
  private unsubscribeSuites?: () => void;

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.presenter) {
      this.unsubscribe = this.presenter.subscribe((vm) => {
        this.viewModel = vm;
      });
    }
    if (this.suitePresenter) {
      this.unsubscribeSuites = this.suitePresenter.subscribeSuites((vm) => {
        this.suiteViewModel = vm;
      });
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.unsubscribeSuites?.();
  }

  override render() {
    const isGrouped = this.suiteViewModel.viewMode === 'grouped' && this.suitePresenter;

    return html`
      <div class="issue-list traklet-card" data-testid="traklet-issue-list">
        ${this.renderHeader()}
        ${isGrouped
          ? this.renderGroupedView()
          : this.viewModel.isLoading && this.viewModel.issues.length === 0
            ? this.renderLoading()
            : this.viewModel.error
              ? this.renderError()
              : this.viewModel.issues.length === 0
                ? this.renderEmpty()
                : this.renderItems()}
      </div>
    `;
  }

  private renderHeader() {
    return html`
      <div class="issue-list__header">
        <div class="issue-list__filters">
          <button
            class="traklet-btn traklet-btn--ghost filter-btn ${this.viewModel.filters.state === 'open' ? 'filter-btn--active' : ''}"
            data-testid="traklet-filter-open"
            @click=${() => this.setFilter('open')}
          >
            Open
          </button>
          <button
            class="traklet-btn traklet-btn--ghost filter-btn ${this.viewModel.filters.state === 'closed' ? 'filter-btn--active' : ''}"
            data-testid="traklet-filter-closed"
            @click=${() => this.setFilter('closed')}
          >
            Closed
          </button>
          <button
            class="traklet-btn traklet-btn--ghost filter-btn ${this.viewModel.filters.state === 'all' ? 'filter-btn--active' : ''}"
            data-testid="traklet-filter-all"
            @click=${() => this.setFilter('all')}
          >
            All
          </button>
          <input
            type="search"
            class="traklet-input issue-list__search"
            placeholder="Search..."
            data-testid="traklet-search"
            .value=${this.viewModel.filters.search}
            @input=${this.handleSearch}
          />
          ${this.viewModel.availableAssignees.length > 0
            ? html`
                <select
                  class="issue-list__assignee-select"
                  data-testid="traklet-filter-assignee"
                  @change=${this.handleAssigneeFilter}
                >
                  <option value="">All users</option>
                  ${this.viewModel.availableAssignees.map(
                    (name) => html`
                      <option
                        value=${name}
                        ?selected=${this.viewModel.filters.assignee === name}
                      >
                        ${name}
                      </option>
                    `
                  )}
                </select>
              `
            : nothing}
        </div>
        ${this.suitePresenter
          ? html`
              <div class="view-toggle" data-testid="traklet-view-toggle">
                <button
                  class="view-toggle__btn ${this.suiteViewModel.viewMode === 'flat' ? 'view-toggle__btn--active' : ''}"
                  @click=${() => this.suitePresenter?.setViewMode('flat')}
                >List</button>
                <button
                  class="view-toggle__btn ${this.suiteViewModel.viewMode === 'grouped' ? 'view-toggle__btn--active' : ''}"
                  @click=${() => this.suitePresenter?.setViewMode('grouped')}
                >Suites</button>
              </div>
            `
          : nothing}
        ${this.viewModel.canCreateIssue
          ? html`
              <button
                class="traklet-btn traklet-btn--primary"
                data-testid="traklet-btn-create"
                @click=${this.handleCreate}
              >
                New Issue
              </button>
            `
          : null}
      </div>
    `;
  }

  private renderItems() {
    return html`
      <ul class="issue-list__items">
        ${this.viewModel.issues.map((issue) => this.renderIssueItem(issue))}
      </ul>
      ${this.viewModel.pagination.hasMore
        ? html`
            <div class="load-more">
              <button
                class="traklet-btn traklet-btn--secondary"
                data-testid="traklet-btn-load-more"
                ?disabled=${this.viewModel.isLoading}
                @click=${this.handleLoadMore}
              >
                ${this.viewModel.isLoading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          `
        : null}
    `;
  }

  private renderIssueItem(issue: IssueListItemViewModel) {
    return html`
      <li
        class="issue-item"
        data-testid="traklet-issue-item"
        data-issue-id=${issue.id}
        @click=${() => this.handleSelect(issue.id)}
      >
        <div class="issue-item__icon issue-item__icon--${issue.state}">
          ${issue.state === 'open' ? this.renderOpenIcon() : this.renderClosedIcon()}
        </div>
        <div class="issue-item__content">
          <div class="issue-item__row">
            <span class="issue-item__number">#${issue.number}</span>
            ${issue.priority
              ? html`<span class="issue-item__priority issue-item__priority--${issue.priority}" title="${issue.priority}"></span>`
              : nothing}
            <h3 class="issue-item__title">${issue.title}</h3>
          </div>
          <div class="issue-item__meta">
            <span>${issue.authorName}</span>
            <span>${issue.updatedAt}</span>
            ${issue.labels.length > 0
              ? html`<span class="issue-item__labels">${issue.labels.map(
                  (label) => html`<span class="issue-item__label-dot" style="background: ${label.color}" title="${label.name}"></span>`
                )}</span>`
              : nothing}
            ${issue.commentCount > 0
              ? html`<span class="issue-item__comments">${this.renderCommentIcon()} ${issue.commentCount}</span>`
              : nothing}
          </div>
        </div>
      </li>
    `;
  }

  private renderGroupedView() {
    if (this.suiteViewModel.isLoading && this.suiteViewModel.suites.length === 0) {
      return this.renderLoading();
    }
    if (this.suiteViewModel.error) {
      return html`
        <div class="traklet-empty" data-testid="traklet-suite-error">
          <p>${this.suiteViewModel.error}</p>
          <button class="traklet-btn traklet-btn--secondary" @click=${() => this.suitePresenter?.loadSuites()}>Retry</button>
        </div>
      `;
    }
    if (this.suiteViewModel.suites.length === 0) {
      return html`<div class="traklet-empty"><p>No test suites found. Sync test cases with <code>npx traklet sync</code></p></div>`;
    }
    return html`
      <div data-testid="traklet-suite-list">
        ${this.suiteViewModel.suites.map((suite) => this.renderSuiteGroup(suite))}
      </div>
    `;
  }

  private renderSuiteGroup(suite: SuiteViewModel) {
    const total = suite.summary.passed + suite.summary.failed + suite.summary.blocked + suite.summary.notTested;
    const pPassed = total > 0 ? (suite.summary.passed / total) * 100 : 0;
    const pFailed = total > 0 ? (suite.summary.failed / total) * 100 : 0;
    const pBlocked = total > 0 ? (suite.summary.blocked / total) * 100 : 0;

    return html`
      <div class="suite-group" data-testid="traklet-suite-${suite.suiteId}">
        <div class="suite-header" @click=${() => this.handleSuiteToggle(suite.suiteId)}>
          <svg class="suite-header__chevron ${suite.isExpanded ? 'suite-header__chevron--expanded' : ''}" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/>
          </svg>
          <span class="suite-header__name">${suite.displayName}</span>
          <span class="suite-header__count">${suite.issueCount}</span>
          ${total > 0
            ? html`
                <div class="suite-header__progress" title="${suite.summary.passed} passed, ${suite.summary.failed} failed, ${suite.summary.blocked} blocked">
                  ${pPassed > 0 ? html`<div class="suite-header__progress-bar suite-header__progress-bar--passed" style="width:${pPassed}%"></div>` : nothing}
                  ${pFailed > 0 ? html`<div class="suite-header__progress-bar suite-header__progress-bar--failed" style="width:${pFailed}%"></div>` : nothing}
                  ${pBlocked > 0 ? html`<div class="suite-header__progress-bar suite-header__progress-bar--blocked" style="width:${pBlocked}%"></div>` : nothing}
                </div>
              `
            : nothing}
        </div>
        ${suite.isExpanded
          ? html`
              <div class="suite-body">
                ${suite.isLoading
                  ? html`<div class="traklet-loading" style="padding:8px"><div class="traklet-spinner"></div></div>`
                  : html`
                      <ul class="issue-list__items">
                        ${suite.issues.map((issue) => this.renderTestCaseItem(issue))}
                      </ul>
                    `}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private renderTestCaseItem(issue: TestCaseListItemViewModel) {
    return html`
      <li
        class="issue-item ${issue.isBlocked ? 'issue-item--blocked' : ''}"
        data-testid="traklet-issue-item"
        data-issue-id=${issue.id}
        @click=${() => this.handleSelect(issue.id)}
      >
        <span class="issue-item__status-dot issue-item__status-dot--${issue.testStatus}" title="${issue.testStatus}"></span>
        <div class="issue-item__content">
          <div class="issue-item__row">
            ${issue.testCaseId
              ? html`<span class="issue-item__number">${issue.testCaseId}</span>`
              : html`<span class="issue-item__number">#${issue.number}</span>`}
            ${issue.priority
              ? html`<span class="issue-item__priority issue-item__priority--${issue.priority}" title="${issue.priority}"></span>`
              : nothing}
            <h3 class="issue-item__title">${issue.title}</h3>
          </div>
          <div class="issue-item__meta">
            ${issue.isBlocked
              ? html`<span class="issue-item__blocked-badge" title="Blocked by: ${issue.blockedBy.join(', ')}">Blocked by ${issue.blockedBy.join(', ')}</span>`
              : html`<span>${issue.authorName}</span><span>${issue.updatedAt}</span>`}
          </div>
        </div>
      </li>
    `;
  }

  private handleSuiteToggle(suiteId: string) {
    this.suitePresenter?.toggleSuite(suiteId);
  }

  private renderLoading() {
    return html`
      <div class="traklet-loading" data-testid="traklet-loading">
        <div class="traklet-spinner"></div>
      </div>
    `;
  }

  private renderEmpty() {
    return html`
      <div class="traklet-empty" data-testid="traklet-empty">
        <p>No issues found</p>
        ${this.viewModel.canCreateIssue
          ? html`
              <button
                class="traklet-btn traklet-btn--primary"
                data-testid="traklet-btn-create-empty"
                @click=${this.handleCreate}
              >
                Create First Issue
              </button>
            `
          : null}
      </div>
    `;
  }

  private renderError() {
    return html`
      <div class="traklet-empty" data-testid="traklet-error">
        <p>${this.viewModel.error}</p>
        <button
          class="traklet-btn traklet-btn--secondary"
          @click=${() => this.presenter?.refresh()}
        >
          Retry
        </button>
      </div>
    `;
  }

  private renderOpenIcon() {
    return html`
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path>
        <path
          d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"
        ></path>
      </svg>
    `;
  }

  private renderClosedIcon() {
    return html`
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path
          d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"
        ></path>
        <path
          d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z"
        ></path>
      </svg>
    `;
  }

  private renderCommentIcon() {
    return html`
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path
          d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
        ></path>
      </svg>
    `;
  }

  private setFilter(state: 'open' | 'closed' | 'all') {
    this.presenter?.setFilter({ state });
  }

  private handleSearch(e: Event) {
    const input = e.target as HTMLInputElement;
    this.presenter?.setFilter({ search: input.value });
  }

  private handleAssigneeFilter(e: Event) {
    const select = e.target as HTMLSelectElement;
    this.presenter?.setFilter({ assignee: select.value || null });
  }

  private handleCreate() {
    // Dispatch navigate event so widget's navigateTo('create') is called,
    // which initializes the form presenter (loads labels, resets form data)
    this.dispatchEvent(
      new CustomEvent('navigate', {
        detail: { view: 'create' },
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleSelect(issueId: string) {
    // Dispatch navigate event so widget's navigateTo('detail', { issueId }) is called,
    // which properly loads the issue in the detail presenter
    this.dispatchEvent(
      new CustomEvent('navigate', {
        detail: { view: 'detail', issueId },
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleLoadMore() {
    void this.presenter?.loadMore();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'traklet-issue-list': TrakletIssueList;
  }
}
