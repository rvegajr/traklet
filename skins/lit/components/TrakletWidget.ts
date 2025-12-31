/**
 * TrakletWidget - Main widget container
 * Renders the appropriate view based on state and handles navigation
 */

import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles, buttonStyles, layoutStyles } from '../styles/base';
import type { TrakletInstance } from '../../../src/Traklet';
import type { Project } from '../../../src/models';
import './TrakletIssueList';

@customElement('traklet-widget')
export class TrakletWidget extends LitElement {
  static override styles = [
    baseStyles,
    buttonStyles,
    layoutStyles,
    css`
      :host {
        display: block;
        position: fixed;
        z-index: 9999;
      }

      :host([position='bottom-right']) {
        bottom: 20px;
        right: 20px;
      }

      :host([position='bottom-left']) {
        bottom: 20px;
        left: 20px;
      }

      :host([position='top-right']) {
        top: 20px;
        right: 20px;
      }

      :host([position='top-left']) {
        top: 20px;
        left: 20px;
      }

      .widget {
        width: 400px;
        max-width: calc(100vw - 40px);
        max-height: calc(100vh - 40px);
        background: var(--traklet-bg);
        border-radius: var(--traklet-radius-lg);
        box-shadow: var(--traklet-shadow-lg);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .widget--closed {
        display: none;
      }

      .widget__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--traklet-space-md);
        border-bottom: 1px solid var(--traklet-border-muted);
        background: var(--traklet-bg-secondary);
      }

      .widget__title {
        display: flex;
        align-items: center;
        gap: var(--traklet-space-sm);
        margin: 0;
        font-size: var(--traklet-font-size-md);
        font-weight: 600;
      }

      .widget__actions {
        display: flex;
        align-items: center;
        gap: var(--traklet-space-xs);
      }

      .widget__body {
        flex: 1;
        overflow-y: auto;
        max-height: 500px;
      }

      .widget__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--traklet-space-sm) var(--traklet-space-md);
        border-top: 1px solid var(--traklet-border-muted);
        background: var(--traklet-bg-secondary);
        font-size: var(--traklet-font-size-xs);
        color: var(--traklet-text-muted);
      }

      .widget__project-select {
        padding: var(--traklet-space-xs) var(--traklet-space-sm);
        font-size: var(--traklet-font-size-xs);
        background: var(--traklet-bg);
        border: 1px solid var(--traklet-border);
        border-radius: var(--traklet-radius-sm);
      }

      .toggle-btn {
        position: fixed;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--traklet-primary);
        color: white;
        box-shadow: var(--traklet-shadow-md);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform var(--traklet-transition-fast);
      }

      .toggle-btn:hover {
        transform: scale(1.05);
      }

      :host([position='bottom-right']) .toggle-btn {
        bottom: 20px;
        right: 20px;
      }

      :host([position='bottom-left']) .toggle-btn {
        bottom: 20px;
        left: 20px;
      }

      .status-indicator {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--traklet-success);
      }

      .status-dot--offline {
        background: var(--traklet-warning);
      }
    `,
  ];

  @property({ type: Object })
  instance?: TrakletInstance;

  @property({ type: String, reflect: true })
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' = 'bottom-right';

  @state()
  private isOpen = false;

  @state()
  private viewState: 'list' | 'detail' | 'create' | 'edit' = 'list';

  @state()
  private currentProject: Project | null = null;

  @state()
  private projects: readonly Project[] = [];

  private unsubscribeViewState?: () => void;

  override connectedCallback(): void {
    super.connectedCallback();
    this.updateFromInstance();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribeViewState?.();
  }

  override updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.has('instance')) {
      this.updateFromInstance();
    }
  }

  private updateFromInstance(): void {
    if (!this.instance) return;

    this.isOpen = this.instance.isOpen();
    this.projects = this.instance.getProjects();
    this.currentProject = this.instance.getCurrentProject();

    const presenter = this.instance.getWidgetPresenter();
    this.viewState = presenter.viewState;

    this.unsubscribeViewState?.();
    this.unsubscribeViewState = presenter.subscribeToViewState((state) => {
      this.viewState = state;
    });
  }

  override render() {
    if (!this.instance) {
      return html`<div>Loading...</div>`;
    }

    return html`
      ${this.isOpen ? this.renderWidget() : this.renderToggleButton()}
    `;
  }

  private renderWidget() {
    return html`
      <div class="widget" data-testid="traklet-widget">
        ${this.renderHeader()}
        <div class="widget__body">${this.renderBody()}</div>
        ${this.renderFooter()}
      </div>
    `;
  }

  private renderHeader() {
    return html`
      <div class="widget__header">
        <h2 class="widget__title">
          ${this.renderBackButton()}
          ${this.getTitle()}
        </h2>
        <div class="widget__actions">
          <button
            class="traklet-btn traklet-btn--ghost traklet-btn--icon"
            data-testid="traklet-btn-refresh"
            aria-label="Refresh"
            @click=${this.handleRefresh}
          >
            ${this.renderRefreshIcon()}
          </button>
          <button
            class="traklet-btn traklet-btn--ghost traklet-btn--icon"
            data-testid="traklet-btn-close"
            aria-label="Close"
            @click=${this.handleClose}
          >
            ${this.renderCloseIcon()}
          </button>
        </div>
      </div>
    `;
  }

  private renderBackButton() {
    if (this.viewState === 'list') return null;

    return html`
      <button
        class="traklet-btn traklet-btn--ghost traklet-btn--icon"
        data-testid="traklet-btn-back"
        aria-label="Back"
        @click=${this.handleBack}
      >
        ${this.renderBackIcon()}
      </button>
    `;
  }

  private renderBody() {
    switch (this.viewState) {
      case 'list':
        return html`
          <traklet-issue-list
            .presenter=${this.instance?.getIssueListPresenter()}
          ></traklet-issue-list>
        `;
      case 'detail':
        return html`<div>Issue Detail (TODO)</div>`;
      case 'create':
      case 'edit':
        return html`<div>Issue Form (TODO)</div>`;
      default:
        return html`<div>Unknown view</div>`;
    }
  }

  private renderFooter() {
    const presenter = this.instance?.getWidgetPresenter();

    return html`
      <div class="widget__footer">
        <div class="status-indicator">
          <span
            class="status-dot ${presenter?.isOnline() ? '' : 'status-dot--offline'}"
          ></span>
          ${presenter?.isOnline() ? 'Online' : 'Offline'}
        </div>
        ${this.projects.length > 1
          ? html`
              <select
                class="widget__project-select"
                data-testid="traklet-project-select"
                @change=${this.handleProjectChange}
              >
                ${this.projects.map(
                  (p) => html`
                    <option value=${p.id} ?selected=${p.id === this.currentProject?.id}>
                      ${p.name}
                    </option>
                  `
                )}
              </select>
            `
          : html`<span>${this.currentProject?.name ?? ''}</span>`}
      </div>
    `;
  }

  private renderToggleButton() {
    return html`
      <button
        class="toggle-btn"
        data-testid="traklet-toggle"
        aria-label="Open issue tracker"
        @click=${this.handleOpen}
      >
        ${this.renderBugIcon()}
      </button>
    `;
  }

  private getTitle(): string {
    switch (this.viewState) {
      case 'list':
        return 'Issues';
      case 'detail':
        return 'Issue Details';
      case 'create':
        return 'New Issue';
      case 'edit':
        return 'Edit Issue';
      default:
        return 'Traklet';
    }
  }

  private renderBackIcon() {
    return html`
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path
          fill-rule="evenodd"
          d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z"
        ></path>
      </svg>
    `;
  }

  private renderRefreshIcon() {
    return html`
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path
          d="M1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM6.379 5.227A.25.25 0 0 0 6 5.442v5.117a.25.25 0 0 0 .379.214l4.264-2.559a.25.25 0 0 0 0-.428L6.379 5.227Z"
        ></path>
      </svg>
    `;
  }

  private renderCloseIcon() {
    return html`
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path
          d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
        ></path>
      </svg>
    `;
  }

  private renderBugIcon() {
    return html`
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
        />
      </svg>
    `;
  }

  private handleOpen() {
    this.instance?.open();
    this.isOpen = true;
  }

  private handleClose() {
    this.instance?.close();
    this.isOpen = false;
  }

  private handleBack() {
    const presenter = this.instance?.getWidgetPresenter();
    presenter?.navigateTo('list');
  }

  private handleRefresh() {
    void this.instance?.refresh();
  }

  private async handleProjectChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    await this.instance?.switchProject(select.value);
    this.currentProject = this.instance?.getCurrentProject() ?? null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'traklet-widget': TrakletWidget;
  }
}
