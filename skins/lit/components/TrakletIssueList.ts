/**
 * TrakletIssueList - Issue list component
 * Displays a list of issues with filtering and actions
 */

import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles, buttonStyles, formStyles, labelStyles, layoutStyles } from '../styles/base';
import type { IssueListViewModel, IssueListItemViewModel, IIssueListPresenter } from '../../../src/presenters';

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
        gap: var(--traklet-space-sm);
      }

      .issue-list__search {
        min-width: 200px;
      }

      .issue-list__items {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .issue-item {
        display: flex;
        align-items: flex-start;
        gap: var(--traklet-space-md);
        padding: var(--traklet-space-md);
        border-bottom: 1px solid var(--traklet-border-muted);
        cursor: pointer;
        transition: background var(--traklet-transition-fast);
      }

      .issue-item:hover {
        background: var(--traklet-bg-hover);
      }

      .issue-item__icon {
        flex-shrink: 0;
        margin-top: 2px;
      }

      .issue-item__icon--open {
        color: var(--traklet-open);
      }

      .issue-item__icon--closed {
        color: var(--traklet-closed);
      }

      .issue-item__content {
        flex: 1;
        min-width: 0;
      }

      .issue-item__title {
        display: flex;
        align-items: center;
        gap: var(--traklet-space-sm);
        margin: 0;
        font-size: var(--traklet-font-size-sm);
        font-weight: 600;
        color: var(--traklet-text);
      }

      .issue-item__title:hover {
        color: var(--traklet-primary);
      }

      .issue-item__number {
        font-weight: 400;
        color: var(--traklet-text-muted);
      }

      .issue-item__labels {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: var(--traklet-space-xs);
      }

      .issue-item__meta {
        display: flex;
        align-items: center;
        gap: var(--traklet-space-sm);
        margin-top: var(--traklet-space-xs);
        font-size: var(--traklet-font-size-xs);
        color: var(--traklet-text-muted);
      }

      .issue-item__comments {
        display: flex;
        align-items: center;
        gap: 4px;
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
    `,
  ];

  @property({ type: Object })
  presenter?: IIssueListPresenter;

  @state()
  private viewModel: IssueListViewModel = {
    issues: [],
    isLoading: false,
    error: null,
    pagination: { page: 1, limit: 50, total: 0, hasMore: false },
    filters: { state: 'open', labels: [], search: '' },
    canCreateIssue: false,
  };

  private unsubscribe?: () => void;

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.presenter) {
      this.unsubscribe = this.presenter.subscribe((vm) => {
        this.viewModel = vm;
      });
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  override render() {
    return html`
      <div class="issue-list traklet-card" data-testid="traklet-issue-list">
        ${this.renderHeader()}
        ${this.viewModel.isLoading && this.viewModel.issues.length === 0
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
            placeholder="Search issues..."
            data-testid="traklet-search"
            .value=${this.viewModel.filters.search}
            @input=${this.handleSearch}
          />
        </div>
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
          <h3 class="issue-item__title">
            ${issue.title}
            <span class="issue-item__number">#${issue.number}</span>
          </h3>
          ${issue.labels.length > 0
            ? html`
                <div class="issue-item__labels">
                  ${issue.labels.map(
                    (label) => html`
                      <span
                        class="traklet-label-badge"
                        style="background: ${label.color}20; color: ${label.color}"
                      >
                        ${label.name}
                      </span>
                    `
                  )}
                </div>
              `
            : null}
          <div class="issue-item__meta">
            <span>by ${issue.authorName}</span>
            <span>${issue.updatedAt}</span>
            ${issue.commentCount > 0
              ? html`
                  <span class="issue-item__comments">
                    ${this.renderCommentIcon()}
                    ${issue.commentCount}
                  </span>
                `
              : null}
          </div>
        </div>
      </li>
    `;
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

  private handleCreate() {
    this.presenter?.createIssue();
  }

  private handleSelect(issueId: string) {
    this.presenter?.selectIssue(issueId);
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
