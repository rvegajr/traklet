/**
 * TrakletWidget - Main widget container
 *
 * Three modes:
 * - Floating: draggable popup (400px wide, default)
 * - Snapped left: full-height sidebar on left edge, resizable width
 * - Snapped right: full-height sidebar on right edge, resizable width
 *
 * Snap triggers: drag to edge, or double-click header.
 * All rendering in Shadow DOM - zero host page interference.
 */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { baseStyles, buttonStyles, layoutStyles } from '../styles/base';
import type { TrakletInstance } from '../../../src/Traklet';
import type { Project } from '../../../src/models';
import { getEventBus } from '../../../src/core';
import './TrakletIssueList';
import './TrakletIssueDetail';
import './TrakletTestRunView';
import './TrakletIssueForm';

type PanelMode = 'floating' | 'snapped-left' | 'snapped-right';

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

      /* Default corner positions (overridden when dragged or snapped) */
      :host([position='bottom-right']:not([data-dragged]):not([data-snap-mode])) {
        bottom: 20px;
        right: 20px;
      }
      :host([position='bottom-left']:not([data-dragged]):not([data-snap-mode])) {
        bottom: 20px;
        left: 20px;
      }
      :host([position='top-right']:not([data-dragged]):not([data-snap-mode])) {
        top: 20px;
        right: 20px;
      }
      :host([position='top-left']:not([data-dragged]):not([data-snap-mode])) {
        top: 20px;
        left: 20px;
      }

      /* ========== Snapped modes ========== */
      :host([data-snap-mode='snapped-left']) {
        top: 0 !important;
        left: 0 !important;
        right: auto !important;
        bottom: auto !important;
      }

      :host([data-snap-mode='snapped-right']) {
        top: 0 !important;
        right: 0 !important;
        left: auto !important;
        bottom: auto !important;
      }

      /* ========== Anchor icon ========== */
      .anchor {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: var(--traklet-primary);
        color: white;
        box-shadow:
          0 2px 8px rgba(9, 105, 218, 0.35),
          0 0 0 3px rgba(9, 105, 218, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 200ms ease, box-shadow 200ms ease;
        position: relative;
        border: none;
        outline: none;
        animation: traklet-anchor-pulse 2s ease-in-out 3;
      }

      .anchor:hover {
        transform: scale(1.1);
        box-shadow:
          0 4px 16px rgba(9, 105, 218, 0.45),
          0 0 0 4px rgba(9, 105, 218, 0.2);
      }

      .anchor:active:not(.anchor--dragging) {
        transform: scale(0.95);
      }

      .anchor--dragging {
        cursor: grabbing;
        animation: none;
      }

      @keyframes traklet-anchor-pulse {
        0%, 100% {
          box-shadow:
            0 2px 8px rgba(9, 105, 218, 0.35),
            0 0 0 3px rgba(9, 105, 218, 0.15);
        }
        50% {
          box-shadow:
            0 2px 12px rgba(9, 105, 218, 0.5),
            0 0 0 8px rgba(9, 105, 218, 0.08);
        }
      }

      .anchor__tooltip {
        position: absolute;
        white-space: nowrap;
        padding: 4px 10px;
        background: var(--traklet-text);
        color: var(--traklet-bg);
        font-size: 12px;
        font-weight: 500;
        border-radius: var(--traklet-radius-sm);
        pointer-events: none;
        opacity: 0;
        transition: opacity 150ms ease;
      }

      :host([position='bottom-right']) .anchor__tooltip,
      :host([position='top-right']) .anchor__tooltip {
        right: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%);
      }
      :host([position='bottom-left']) .anchor__tooltip,
      :host([position='top-left']) .anchor__tooltip {
        left: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%);
      }
      :host([data-dragged]) .anchor__tooltip {
        right: calc(100% + 10px);
        left: auto;
        top: 50%;
        transform: translateY(-50%);
      }

      .anchor:hover .anchor__tooltip {
        opacity: 1;
      }

      .anchor__badge {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: 10px;
        background: var(--traklet-danger);
        color: white;
        font-size: 11px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        border: 2px solid white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }

      .anchor--hidden {
        display: none;
      }

      /* ========== Panel (floating mode) ========== */
      .panel {
        width: 400px;
        max-width: calc(100vw - 40px);
        max-height: calc(100vh - 40px);
        background: var(--traklet-bg);
        border-radius: var(--traklet-radius-lg);
        box-shadow:
          0 0 0 2px var(--traklet-primary),
          0 8px 32px rgba(9, 105, 218, 0.18),
          0 2px 8px rgba(0, 0, 0, 0.12);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        position: relative;
        animation: traklet-panel-in 200ms ease forwards;
        transform-origin: bottom right;
      }

      :host([position='bottom-left']) .panel {
        transform-origin: bottom left;
      }
      :host([position='top-right']) .panel {
        transform-origin: top right;
      }
      :host([position='top-left']) .panel {
        transform-origin: top left;
      }

      .panel--closing {
        animation: traklet-panel-out 150ms ease forwards;
      }

      @keyframes traklet-panel-in {
        from { opacity: 0; transform: scale(0.85); }
        to { opacity: 1; transform: scale(1); }
      }

      @keyframes traklet-panel-out {
        from { opacity: 1; transform: scale(1); }
        to { opacity: 0; transform: scale(0.85); }
      }

      /* ========== Panel (snapped mode overrides) ========== */
      :host([data-snap-mode]) .panel {
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
        transition: width 200ms ease;
      }

      :host([data-snap-mode='snapped-left']) .panel {
        transform-origin: top left;
        box-shadow: none;
        border-right: 3px solid var(--traklet-primary);
      }

      :host([data-snap-mode='snapped-right']) .panel {
        transform-origin: top right;
        box-shadow: none;
        border-left: 3px solid var(--traklet-primary);
      }

      :host([data-snap-mode]) .panel__body {
        max-height: none;
      }

      /* ========== Header (drag handle + gradient) ========== */
      .panel__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px var(--traklet-space-md);
        border-bottom: none;
        background: linear-gradient(135deg, #0969da 0%, #1a7f37 100%);
        color: white;
        cursor: grab;
        user-select: none;
        -webkit-user-select: none;
      }

      .panel__header--dragging {
        cursor: grabbing;
      }

      .panel__title {
        display: flex;
        align-items: center;
        gap: var(--traklet-space-sm);
        margin: 0;
        font-size: var(--traklet-font-size-sm);
        font-weight: 600;
        color: white;
      }

      .panel__actions {
        display: flex;
        align-items: center;
        gap: 2px;
      }

      /* ========== Body ========== */
      .panel__body {
        flex: 1;
        overflow-y: auto;
        max-height: 500px;
      }

      /* ========== Footer ========== */
      .panel__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px var(--traklet-space-md);
        border-top: 2px solid var(--traklet-primary);
        background: var(--traklet-bg-secondary);
        font-size: 11px;
        color: var(--traklet-text-muted);
      }

      .panel__footer-brand {
        font-weight: 600;
        color: var(--traklet-text-secondary);
      }

      .panel__project-select {
        padding: 2px var(--traklet-space-sm);
        font-size: var(--traklet-font-size-xs);
        background: var(--traklet-bg);
        border: 1px solid var(--traklet-border);
        border-radius: var(--traklet-radius-sm);
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

      /* ========== Resize handle ========== */
      .panel__resize-handle {
        display: none;
        position: absolute;
        top: 0;
        bottom: 0;
        width: 6px;
        cursor: col-resize;
        background: transparent;
        z-index: 2;
      }

      .panel__resize-handle::after {
        content: '';
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 2px;
        height: 32px;
        border-radius: 1px;
        background: var(--traklet-border);
        left: 2px;
        transition: background 150ms ease, height 150ms ease;
      }

      .panel__resize-handle:hover::after,
      .panel__resize-handle--active::after {
        background: var(--traklet-primary);
        height: 48px;
      }

      :host([data-snap-mode='snapped-left']) .panel__resize-handle {
        display: block;
        right: 0;
      }

      :host([data-snap-mode='snapped-right']) .panel__resize-handle {
        display: block;
        left: 0;
      }

      /* ========== Snap zone indicator ========== */
      .snap-indicator {
        position: fixed;
        top: 0;
        bottom: 0;
        width: 4px;
        background: var(--traklet-primary);
        opacity: 0.5;
        z-index: 9998;
        pointer-events: none;
        animation: traklet-snap-glow 600ms ease-in-out infinite alternate;
      }

      .snap-indicator--left {
        left: 0;
      }

      .snap-indicator--right {
        right: 0;
      }

      @keyframes traklet-snap-glow {
        from { opacity: 0.3; width: 4px; }
        to { opacity: 0.6; width: 6px; }
      }

      /* ========== Icon buttons ========== */
      .btn-icon {
        width: 28px;
        height: 28px;
        border-radius: var(--traklet-radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.85);
        cursor: pointer;
        transition: background var(--traklet-transition-fast), color var(--traklet-transition-fast);
        padding: 0;
      }

      .btn-icon:hover {
        background: rgba(255, 255, 255, 0.15);
        color: white;
      }

      /* Non-header icon buttons (detail view, etc.) use normal colors */
      .panel__body .btn-icon {
        color: var(--traklet-text-secondary);
      }

      .panel__body .btn-icon:hover {
        background: var(--traklet-bg-hover);
        color: var(--traklet-text);
      }
    `,
  ];

  @property({ type: Object })
  declare instance: TrakletInstance | undefined;

  @property({ type: String, reflect: true })
  declare position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

  @state() declare private isOpen: boolean;
  @state() declare private isClosing: boolean;
  @state() declare private viewState: 'list' | 'detail' | 'create' | 'edit';
  @state() declare private currentProject: Project | null;
  @state() declare private projects: readonly Project[];
  @state() declare private isDragging: boolean;
  @state() declare private isAnchorDragging: boolean;
  @state() declare private panelMode: PanelMode;
  @state() declare private snappedWidth: number;
  @state() declare private isResizing: boolean;
  @state() declare private snapIndicator: 'left' | 'right' | null;
  @state() declare private showRunsView: boolean;
  @state() declare private showSettingsView: boolean;

  constructor() {
    super();
    this.position = 'bottom-right';
    this.isOpen = false;
    this.isClosing = false;
    this.viewState = 'list';
    this.currentProject = null;
    this.projects = [];
    this.isDragging = false;
    this.isAnchorDragging = false;
    this.panelMode = 'floating';
    this.snappedWidth = 400;
    this.isResizing = false;
    this.snapIndicator = null;
    this.showRunsView = false;
    this.showSettingsView = false;
  }

  private unsubscribeViewState?: () => void;
  private unsubscribeEvents: Array<() => void> = [];
  private navigateHandler: ((e: Event) => void) | null = null;

  // Drag state (MANDATE 7: all listeners stored for cleanup)
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private dragStartX = 0;
  private dragStartY = 0;
  private didDrag = false;
  private boundOnDragMove: ((e: MouseEvent) => void) | null = null;
  private boundOnDragEnd: (() => void) | null = null;
  private boundOnAnchorDragMove: ((e: MouseEvent) => void) | null = null;
  private boundOnAnchorDragEnd: ((e: MouseEvent) => void) | null = null;

  // Resize state
  private resizeStartX = 0;
  private resizeStartWidth = 0;
  private boundOnResizeMove: ((e: MouseEvent) => void) | null = null;
  private boundOnResizeEnd: (() => void) | null = null;

  private static readonly POSITION_STORAGE_KEY = '__traklet_widget_position__';
  private static readonly SNAP_THRESHOLD = 50;
  private static readonly MIN_SNAP_WIDTH = 320;
  private static readonly MAX_SNAP_WIDTH_RATIO = 0.5;

  override connectedCallback(): void {
    super.connectedCallback();
    this.updateFromInstance();
    this.restorePosition();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribeViewState?.();
    for (const unsub of this.unsubscribeEvents) unsub();
    this.unsubscribeEvents = [];
    if (this.navigateHandler) {
      this.removeEventListener('navigate', this.navigateHandler);
      this.navigateHandler = null;
    }
    this.cleanupDragListeners();
    this.cleanupAnchorDragListeners();
    this.cleanupResizeListeners();
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

    // Subscribe to mutation events to refresh the issue list
    for (const unsub of this.unsubscribeEvents) unsub();
    this.unsubscribeEvents = [];
    const bus = getEventBus();
    const refreshList = () => { void this.instance?.getIssueListPresenter()?.refresh(); };
    this.unsubscribeEvents.push(
      bus.on('issue:created', refreshList),
      bus.on('issue:updated', refreshList),
      bus.on('issue:deleted', refreshList),
    );

    // Listen for navigate events from child components (e.g., edit button in detail view)
    if (!this.navigateHandler) {
      this.navigateHandler = (e: Event) => {
        const detail = (e as CustomEvent).detail as { view: string; issueId?: string };
        if (detail.view && presenter) {
          presenter.navigateTo(
            detail.view as 'list' | 'detail' | 'create' | 'edit',
            detail.issueId ? { issueId: detail.issueId } : undefined
          );
        }
      };
      this.addEventListener('navigate', this.navigateHandler);
    }
  }

  // ============================================
  // Render
  // ============================================

  override render() {
    if (!this.instance) return nothing;

    return html`
      ${this.snapIndicator ? html`
        <div class="snap-indicator snap-indicator--${this.snapIndicator}"></div>
      ` : nothing}
      ${this.isOpen || this.isClosing ? this.renderPanel() : nothing}
      <button
        class="anchor ${this.isOpen ? 'anchor--hidden' : ''} ${this.isAnchorDragging ? 'anchor--dragging' : ''}"
        data-testid="traklet-toggle"
        aria-label="Open Traklet"
        @mousedown=${this.handleAnchorMouseDown}
      >
        ${this.renderAnchorIcon()}
        <span class="anchor__tooltip">Open Traklet</span>
      </button>
    `;
  }

  private renderPanel() {
    const isSnapped = this.panelMode !== 'floating';
    const panelStyle = isSnapped ? `width: ${this.snappedWidth}px;` : '';

    return html`
      <div
        class="panel ${this.isClosing ? 'panel--closing' : ''}"
        style=${panelStyle}
        data-testid="traklet-widget"
        @animationend=${this.handleAnimationEnd}
      >
        ${isSnapped ? html`
          <div
            class="panel__resize-handle ${this.isResizing ? 'panel__resize-handle--active' : ''}"
            data-testid="traklet-resize-handle"
            @mousedown=${this.handleResizeStart}
          ></div>
        ` : nothing}
        ${this.renderHeader()}
        <div class="panel__body">${this.renderBody()}</div>
        ${this.renderFooter()}
      </div>
    `;
  }

  private renderHeader() {
    return html`
      <div
        class="panel__header ${this.isDragging ? 'panel__header--dragging' : ''}"
        @mousedown=${this.handleDragStart}
        @dblclick=${this.handleHeaderDoubleClick}
      >
        <h2 class="panel__title">
          ${this.viewState !== 'list'
            ? html`
                <button
                  class="btn-icon"
                  data-testid="traklet-btn-back"
                  aria-label="Back"
                  @click=${this.handleBack}
                >
                  ${this.renderBackIcon()}
                </button>
              `
            : nothing}
          ${this.getTitle()}
        </h2>
        <div class="panel__actions">
          <button
            class="btn-icon"
            data-testid="traklet-btn-settings"
            aria-label="Settings"
            title="Settings"
            @click=${() => { this.showSettingsView = !this.showSettingsView; this.showRunsView = false; }}
            style="${this.showSettingsView ? 'color: var(--traklet-primary); background: rgba(255,255,255,0.2);' : ''}"
          >
            ${this.renderGearIcon()}
          </button>
          <button
            class="btn-icon"
            data-testid="traklet-btn-runs"
            aria-label="${this.showRunsView ? 'Issues' : 'Test Runs'}"
            title="${this.showRunsView ? 'Back to Issues' : 'Test Runs'}"
            @click=${() => { this.showRunsView = !this.showRunsView; }}
            style="${this.showRunsView ? 'color: var(--traklet-primary);' : ''}"
          >
            ${this.renderRunsIcon()}
          </button>
          <button
            class="btn-icon"
            data-testid="traklet-btn-refresh"
            aria-label="Refresh"
            @click=${this.handleRefresh}
          >
            ${this.renderRefreshIcon()}
          </button>
          <button
            class="btn-icon"
            data-testid="traklet-btn-minimize"
            aria-label="Minimize"
            @click=${this.handleClose}
          >
            ${this.renderMinimizeIcon()}
          </button>
        </div>
      </div>
    `;
  }

  private renderBody() {
    if (this.showSettingsView) {
      return this.renderSettings();
    }
    if (this.showRunsView) {
      return html`<traklet-test-run-view></traklet-test-run-view>`;
    }

    switch (this.viewState) {
      case 'list':
        return html`
          <traklet-issue-list
            .presenter=${this.instance?.getIssueListPresenter()}
          ></traklet-issue-list>
        `;
      case 'detail':
        return html`
          <traklet-issue-detail
            .presenter=${this.instance?.getIssueDetailPresenter()}
            .diagnosticsMarkdown=${this.instance?.getDiagnosticsMarkdown() ?? ''}
          ></traklet-issue-detail>
        `;
      case 'create':
        return html`
          <traklet-issue-form
            .presenter=${this.instance?.getIssueFormPresenter()}
          ></traklet-issue-form>
        `;
      case 'edit': {
        const detailVm = this.instance?.getIssueDetailPresenter()?.getViewModel();
        return html`
          <traklet-issue-form
            .presenter=${this.instance?.getIssueFormPresenter()}
            .issueId=${detailVm?.id}
          ></traklet-issue-form>
        `;
      }
      default:
        return nothing;
    }
  }

  private renderFooter() {
    const presenter = this.instance?.getWidgetPresenter();

    return html`
      <div class="panel__footer">
        <span class="panel__footer-brand">Traklet</span>
        <div class="status-indicator">
          <span class="status-dot ${presenter?.isOnline() ? '' : 'status-dot--offline'}"></span>
          ${presenter?.isOnline() ? 'Connected' : 'Offline'}
        </div>
        ${this.projects.length > 1
          ? html`
              <select
                class="panel__project-select"
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

  private getTitle(): string {
    if (this.showSettingsView) return 'Traklet - Settings';
    if (this.showRunsView) return 'Traklet - Test Runs';
    switch (this.viewState) {
      case 'list': return 'Traklet - Issues';
      case 'detail': return 'Traklet - Details';
      case 'create': return 'Traklet - New Issue';
      case 'edit': return 'Traklet - Edit Issue';
      default: return 'Traklet';
    }
  }

  // ============================================
  // Event Handlers
  // ============================================

  private handleOpen() {
    this.instance?.open();
    this.isOpen = true;
    this.isClosing = false;
    // Restore snap mode attribute if panel was snapped before closing
    if (this.panelMode !== 'floating') {
      this.setAttribute('data-snap-mode', this.panelMode);
    }
  }

  private handleClose() {
    this.isClosing = true;
  }

  private handleAnimationEnd() {
    if (this.isClosing) {
      this.isClosing = false;
      this.isOpen = false;
      this.instance?.close();
      // Remove snap mode so anchor icon can be positioned freely
      this.removeAttribute('data-snap-mode');
    }
  }

  private handleBack() {
    this.instance?.getWidgetPresenter()?.navigateTo('list');
  }

  private handleRefresh() {
    void this.instance?.refresh();
  }

  private async handleProjectChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    await this.instance?.switchProject(select.value);
    this.currentProject = this.instance?.getCurrentProject() ?? null;
  }

  // ============================================
  // Snap / Unsnap
  // ============================================

  private snapTo(mode: 'snapped-left' | 'snapped-right') {
    this.panelMode = mode;
    this.setAttribute('data-snap-mode', mode);
    this.removeAttribute('data-dragged');
    this.style.left = '';
    this.style.top = '';
    this.style.right = '';
    this.style.bottom = '';
    this.savePosition();
  }

  private unsnap() {
    this.panelMode = 'floating';
    this.removeAttribute('data-snap-mode');
  }

  private handleHeaderDoubleClick(e: MouseEvent) {
    // Ignore if mouse moved (was a drag, not a true double-click)
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('select')) return;

    e.preventDefault();

    if (this.panelMode !== 'floating') {
      // Unsnap to center of screen
      this.unsnap();
      this.setAttribute('data-dragged', '');
      this.style.left = `${(window.innerWidth - 400) / 2}px`;
      this.style.top = `${(window.innerHeight - 600) / 2}px`;
      this.style.right = 'auto';
      this.style.bottom = 'auto';
      this.savePosition();
    } else {
      // Snap to nearest edge
      const rect = this.getBoundingClientRect();
      const distToLeft = rect.left;
      const distToRight = window.innerWidth - rect.right;
      this.snapTo(distToLeft < distToRight ? 'snapped-left' : 'snapped-right');
    }
  }

  // ============================================
  // Anchor icon drag (click-vs-drag with 5px threshold)
  // ============================================

  private handleAnchorMouseDown(e: MouseEvent) {
    e.preventDefault();

    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.didDrag = false;

    const rect = this.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;

    this.boundOnAnchorDragMove = this.handleAnchorDragMove.bind(this);
    this.boundOnAnchorDragEnd = this.handleAnchorDragEnd.bind(this);
    window.addEventListener('mousemove', this.boundOnAnchorDragMove);
    window.addEventListener('mouseup', this.boundOnAnchorDragEnd);
  }

  private handleAnchorDragMove(e: MouseEvent) {
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;

    if (!this.didDrag && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

    this.didDrag = true;
    this.isAnchorDragging = true;

    const x = Math.max(0, Math.min(e.clientX - this.dragOffsetX, window.innerWidth - 60));
    const y = Math.max(0, Math.min(e.clientY - this.dragOffsetY, window.innerHeight - 60));

    this.setAttribute('data-dragged', '');
    this.style.left = `${x}px`;
    this.style.top = `${y}px`;
    this.style.right = 'auto';
    this.style.bottom = 'auto';
  }

  private handleAnchorDragEnd(_e: MouseEvent) {
    this.cleanupAnchorDragListeners();

    if (this.didDrag) {
      this.isAnchorDragging = false;
      this.savePosition();
    } else {
      this.handleOpen();
    }
  }

  private cleanupAnchorDragListeners() {
    if (this.boundOnAnchorDragMove) {
      window.removeEventListener('mousemove', this.boundOnAnchorDragMove);
      this.boundOnAnchorDragMove = null;
    }
    if (this.boundOnAnchorDragEnd) {
      window.removeEventListener('mouseup', this.boundOnAnchorDragEnd);
      this.boundOnAnchorDragEnd = null;
    }
  }

  // ============================================
  // Panel header drag (with edge snap detection)
  // ============================================

  private handleDragStart(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('select')) return;

    e.preventDefault();
    this.isDragging = true;

    const rect = this.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;

    this.boundOnDragMove = this.handleDragMove.bind(this);
    this.boundOnDragEnd = this.handleDragEnd.bind(this);
    window.addEventListener('mousemove', this.boundOnDragMove);
    window.addEventListener('mouseup', this.boundOnDragEnd);
  }

  private handleDragMove(e: MouseEvent) {
    if (!this.isDragging) return;

    // Edge detection for snap indicators
    if (e.clientX < TrakletWidget.SNAP_THRESHOLD) {
      this.snapIndicator = 'left';
    } else if (e.clientX > window.innerWidth - TrakletWidget.SNAP_THRESHOLD) {
      this.snapIndicator = 'right';
    } else {
      this.snapIndicator = null;
    }

    // If snapped and dragged away from edge, unsnap
    if (this.panelMode === 'snapped-left' && e.clientX > this.snappedWidth + TrakletWidget.SNAP_THRESHOLD) {
      this.unsnap();
    } else if (this.panelMode === 'snapped-right' && e.clientX < window.innerWidth - this.snappedWidth - TrakletWidget.SNAP_THRESHOLD) {
      this.unsnap();
    }

    // Update position in floating mode
    if (this.panelMode === 'floating') {
      const x = Math.max(0, Math.min(e.clientX - this.dragOffsetX, window.innerWidth - 60));
      const y = Math.max(0, Math.min(e.clientY - this.dragOffsetY, window.innerHeight - 40));

      this.setAttribute('data-dragged', '');
      this.style.left = `${x}px`;
      this.style.top = `${y}px`;
      this.style.right = 'auto';
      this.style.bottom = 'auto';
    }
  }

  private handleDragEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.cleanupDragListeners();

    // Snap if released in a snap zone
    if (this.snapIndicator === 'left') {
      this.snapTo('snapped-left');
    } else if (this.snapIndicator === 'right') {
      this.snapTo('snapped-right');
    } else {
      this.savePosition();
    }

    this.snapIndicator = null;
  }

  private cleanupDragListeners() {
    if (this.boundOnDragMove) {
      window.removeEventListener('mousemove', this.boundOnDragMove);
      this.boundOnDragMove = null;
    }
    if (this.boundOnDragEnd) {
      window.removeEventListener('mouseup', this.boundOnDragEnd);
      this.boundOnDragEnd = null;
    }
  }

  // ============================================
  // Resize handle (snapped mode only)
  // ============================================

  private handleResizeStart(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.isResizing = true;
    this.resizeStartX = e.clientX;
    this.resizeStartWidth = this.snappedWidth;

    this.boundOnResizeMove = this.handleResizeMove.bind(this);
    this.boundOnResizeEnd = this.handleResizeEnd.bind(this);
    window.addEventListener('mousemove', this.boundOnResizeMove);
    window.addEventListener('mouseup', this.boundOnResizeEnd);
  }

  private handleResizeMove(e: MouseEvent) {
    if (!this.isResizing) return;

    const maxWidth = window.innerWidth * TrakletWidget.MAX_SNAP_WIDTH_RATIO;
    let newWidth: number;

    if (this.panelMode === 'snapped-left') {
      newWidth = this.resizeStartWidth + (e.clientX - this.resizeStartX);
    } else {
      newWidth = this.resizeStartWidth - (e.clientX - this.resizeStartX);
    }

    this.snappedWidth = Math.max(TrakletWidget.MIN_SNAP_WIDTH, Math.min(newWidth, maxWidth));
  }

  private handleResizeEnd() {
    this.isResizing = false;
    this.cleanupResizeListeners();
    this.savePosition();
  }

  private cleanupResizeListeners() {
    if (this.boundOnResizeMove) {
      window.removeEventListener('mousemove', this.boundOnResizeMove);
      this.boundOnResizeMove = null;
    }
    if (this.boundOnResizeEnd) {
      window.removeEventListener('mouseup', this.boundOnResizeEnd);
      this.boundOnResizeEnd = null;
    }
  }

  // ============================================
  // Position Persistence
  // ============================================

  private savePosition() {
    try {
      const data: Record<string, unknown> = {
        mode: this.panelMode,
        snappedWidth: this.snappedWidth,
      };
      if (this.panelMode === 'floating' && this.hasAttribute('data-dragged')) {
        data['floating'] = { left: this.style.left, top: this.style.top };
      }
      localStorage.setItem(TrakletWidget.POSITION_STORAGE_KEY, JSON.stringify(data));
    } catch { /* localStorage unavailable */ }
  }

  private restorePosition() {
    try {
      const stored = localStorage.getItem(TrakletWidget.POSITION_STORAGE_KEY);
      if (!stored) return;
      const data = JSON.parse(stored);

      // Backward compat: old format was { left, top }
      if (data.left && data.top && !data.mode) {
        this.setAttribute('data-dragged', '');
        this.style.left = data.left;
        this.style.top = data.top;
        this.style.right = 'auto';
        this.style.bottom = 'auto';
        return;
      }

      if (data.snappedWidth) {
        this.snappedWidth = data.snappedWidth;
      }

      if (data.mode === 'snapped-left' || data.mode === 'snapped-right') {
        this.snapTo(data.mode);
      } else if (data.mode === 'floating' && data.floating) {
        this.setAttribute('data-dragged', '');
        this.style.left = data.floating.left;
        this.style.top = data.floating.top;
        this.style.right = 'auto';
        this.style.bottom = 'auto';
      }
    } catch { /* ignore */ }
  }

  /** Reset to default corner position */
  resetPosition() {
    this.panelMode = 'floating';
    this.snappedWidth = 400;
    this.removeAttribute('data-dragged');
    this.removeAttribute('data-snap-mode');
    this.style.left = '';
    this.style.top = '';
    this.style.right = '';
    this.style.bottom = '';
    try {
      localStorage.removeItem(TrakletWidget.POSITION_STORAGE_KEY);
    } catch { /* localStorage unavailable */ }
  }

  // ============================================
  // Icons (inline SVG, no external deps)
  // ============================================

  private renderAnchorIcon() {
    return html`
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
        <line x1="4" y1="22" x2="4" y2="15"/>
      </svg>
    `;
  }

  private renderBackIcon() {
    return html`
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path fill-rule="evenodd" d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06Z"/>
      </svg>
    `;
  }

  private renderRefreshIcon() {
    return html`
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
    `;
  }

  private renderSettings() {
    const isConnected = this.instance?.getWidgetPresenter()?.isConnected() ?? false;
    const savedToken = this.getSavedSetting('__traklet_pat__');
    const savedEmail = this.getSavedSetting('__traklet_user_email__');
    const lbl = 'display: block; font-size: 11px; font-weight: 600; color: var(--traklet-text-secondary); margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;';
    const fld = 'width: 100%; padding: 5px 8px; background: var(--traklet-bg); border-radius: var(--traklet-radius-md); border: 1px solid var(--traklet-border); color: var(--traklet-text); font-size: 12px; box-sizing: border-box;';

    return html`
      <div style="padding: var(--traklet-space-md); font-size: var(--traklet-font-size-sm);">

        <!-- Status -->
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: var(--traklet-space-sm); padding: 5px 8px; background: ${isConnected ? 'rgba(22,163,74,0.06)' : 'rgba(220,38,38,0.06)'}; border: 1px solid ${isConnected ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}; border-radius: var(--traklet-radius-md);">
          <span style="width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: ${isConnected ? 'var(--traklet-success)' : 'var(--traklet-danger)'};"></span>
          <span style="font-size: 12px; font-weight: 500;">${isConnected ? 'Connected' : 'Disconnected'}${this.currentProject ? html` &middot; ${this.currentProject.name}` : nothing}</span>
        </div>

        <!-- Your Email -->
        <div style="margin-bottom: var(--traklet-space-sm);">
          <label style="${lbl}">Your Email</label>
          <input
            type="email"
            placeholder="you@company.com"
            data-testid="traklet-input-email"
            .value=${savedEmail}
            style="${fld}"
            @change=${(e: Event) => this.saveSetting('__traklet_user_email__', (e.target as HTMLInputElement).value)}
          />
          <div style="font-size: 10px; color: var(--traklet-text-muted); margin-top: 2px;">
            Used to filter issues assigned to you and to identify your test results. The list defaults to showing your issues first but you can always see everyone's.
          </div>
        </div>

        <!-- PAT Token -->
        <div style="margin-bottom: var(--traklet-space-sm);">
          <label style="${lbl}">PAT Token</label>
          <input
            type="password"
            placeholder="Paste your Personal Access Token"
            data-testid="traklet-input-pat"
            .value=${savedToken}
            style="${fld} font-family: monospace;"
            @change=${(e: Event) => this.saveSetting('__traklet_pat__', (e.target as HTMLInputElement).value)}
          />
          <div style="font-size: 10px; color: var(--traklet-text-muted); margin-top: 2px;">
            ${savedToken
              ? html`Saved in your browser's localStorage. <strong>You won't need to enter this again</strong> unless you clear browser data or switch browsers.`
              : html`Your token is stored in <strong>localStorage</strong> and persists across browser refreshes. You only enter it once per browser.`}
          </div>
        </div>

        <!-- Persistence info -->
        <div style="padding: 6px 8px; background: rgba(9,105,218,0.05); border: 1px solid rgba(9,105,218,0.12); border-radius: var(--traklet-radius-md); font-size: 10px; color: var(--traklet-text-secondary); line-height: 1.5; margin-bottom: var(--traklet-space-sm);">
          <strong>No re-entry needed.</strong> Your email and token are saved in this browser's localStorage. They survive page refreshes, tab closes, and browser restarts. Only clearing site data or switching to a different browser/device will require re-entry.
        </div>

        <!-- Code setup -->
        <div style="padding: 6px 8px; background: var(--traklet-bg-secondary); border: 1px solid var(--traklet-border-muted); border-radius: var(--traklet-radius-md); font-size: 10px; color: var(--traklet-text-secondary); line-height: 1.5;">
          <strong>For developers:</strong> To skip this UI entirely, set the token in your app's code:<br/>
          <code style="font-size: 10px; background: var(--traklet-bg); padding: 1px 4px; border-radius: 3px;">Traklet.init({ token: 'YOUR_PAT', user: { email: '...' }, ... })</code>
        </div>
      </div>
    `;
  }

  private getSavedSetting(key: string): string {
    try {
      return localStorage.getItem(key) ?? '';
    } catch { return ''; }
  }

  private saveSetting(key: string, value: string): void {
    try {
      if (value.trim()) {
        localStorage.setItem(key, value.trim());
      } else {
        localStorage.removeItem(key);
      }
    } catch { /* localStorage unavailable */ }
  }

  private renderGearIcon() {
    return html`
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    `;
  }

  private renderRunsIcon() {
    return html`
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    `;
  }

  private renderMinimizeIcon() {
    return html`
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'traklet-widget': TrakletWidget;
  }
}
