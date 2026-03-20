/**
 * TrakletTestRunView - Test run dashboard
 *
 * Shows: active run banner with progress, summary cards,
 * test case list with status badges, and run history.
 */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { baseStyles, buttonStyles, formStyles, layoutStyles } from '../styles/base';
import { getTestRunManager } from '../../../src/core/TestRunManager';
import type { TestRun, TestRunSummary } from '../../../src/core/TestRunManager';

@customElement('traklet-test-run-view')
export class TrakletTestRunView extends LitElement {
  static override styles = [
    baseStyles,
    buttonStyles,
    formStyles,
    layoutStyles,
    css`
      :host { display: block; }

      .run-view { padding: var(--traklet-space-md); }

      /* Active run banner */
      .run-banner {
        padding: var(--traklet-space-md);
        background: rgba(9, 105, 218, 0.06);
        border: 1px solid rgba(9, 105, 218, 0.2);
        border-radius: var(--traklet-radius-md);
        margin-bottom: var(--traklet-space-md);
      }

      .run-banner__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--traklet-space-sm);
      }

      .run-banner__name {
        font-size: var(--traklet-font-size-sm);
        font-weight: 600;
        color: var(--traklet-primary);
      }

      .run-banner__progress {
        font-size: var(--traklet-font-size-xs);
        color: var(--traklet-text-secondary);
      }

      .progress-bar {
        height: 6px;
        background: var(--traklet-border-muted);
        border-radius: 3px;
        overflow: hidden;
        margin-top: var(--traklet-space-xs);
      }

      .progress-bar__fill {
        height: 100%;
        border-radius: 3px;
        transition: width 300ms ease;
      }

      .progress-bar__fill--good { background: #16a34a; }
      .progress-bar__fill--warn { background: #d97706; }
      .progress-bar__fill--bad { background: #dc2626; }

      /* Summary cards */
      .summary-cards {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--traklet-space-sm);
        margin-bottom: var(--traklet-space-md);
      }

      .summary-card {
        text-align: center;
        padding: var(--traklet-space-sm);
        border-radius: var(--traklet-radius-md);
        border: 1px solid var(--traklet-border-muted);
        cursor: default;
      }

      .summary-card__count {
        font-size: var(--traklet-font-size-lg);
        font-weight: 700;
        line-height: 1.2;
      }

      .summary-card__label {
        font-size: 10px;
        color: var(--traklet-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .summary-card--pass .summary-card__count { color: #16a34a; }
      .summary-card--fail .summary-card__count { color: #dc2626; }
      .summary-card--blocked .summary-card__count { color: #d97706; }
      .summary-card--untested .summary-card__count { color: var(--traklet-text-muted); }

      /* Start run form */
      .start-run {
        text-align: center;
        padding: var(--traklet-space-md);
      }

      .start-run__title {
        font-size: var(--traklet-font-size-md);
        font-weight: 600;
        margin-bottom: var(--traklet-space-sm);
      }

      .start-run__desc {
        font-size: var(--traklet-font-size-sm);
        color: var(--traklet-text-secondary);
        margin-bottom: var(--traklet-space-md);
      }

      .start-run__form {
        display: flex;
        gap: var(--traklet-space-sm);
        max-width: 320px;
        margin: 0 auto;
      }

      .start-run__input {
        flex: 1;
        padding: var(--traklet-space-sm) var(--traklet-space-md);
        border: 1px solid var(--traklet-border);
        border-radius: var(--traklet-radius-md);
        font-size: var(--traklet-font-size-sm);
        font-family: inherit;
        color: var(--traklet-text);
      }

      .start-run__input:focus {
        outline: none;
        border-color: var(--traklet-primary);
      }

      /* History */
      .history-title {
        font-size: var(--traklet-font-size-sm);
        font-weight: 600;
        margin: var(--traklet-space-md) 0 var(--traklet-space-sm);
        color: var(--traklet-text);
      }

      .history-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--traklet-space-sm) 0;
        border-bottom: 1px solid var(--traklet-border-muted);
        font-size: var(--traklet-font-size-xs);
      }

      .history-item__name {
        font-weight: 500;
        color: var(--traklet-text);
      }

      .history-item__date {
        color: var(--traklet-text-muted);
      }

      .history-item__stats {
        display: flex;
        gap: var(--traklet-space-sm);
      }

      .history-stat {
        font-weight: 600;
      }

      .history-stat--pass { color: #16a34a; }
      .history-stat--fail { color: #dc2626; }

      .no-history {
        font-size: var(--traklet-font-size-sm);
        color: var(--traklet-text-muted);
        text-align: center;
        padding: var(--traklet-space-md);
      }
    `,
  ];

  @state() declare private runName: string;
  @state() declare private activeRun: TestRun | null;
  @state() declare private history: readonly TestRun[];

  private unsubscribe: (() => void) | null = null;

  constructor() {
    super();
    this.runName = '';
    this.activeRun = null;
    this.history = [];
  }

  override connectedCallback() {
    super.connectedCallback();
    const mgr = getTestRunManager();
    this.activeRun = mgr.getActiveRun();
    this.history = mgr.getHistory();
    this.unsubscribe = mgr.subscribe(() => {
      this.activeRun = mgr.getActiveRun();
      this.history = mgr.getHistory();
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  override render() {
    return html`
      <div class="run-view">
        ${this.activeRun ? this.renderActiveRun() : this.renderStartRun()}
        ${this.renderHistory()}
      </div>
    `;
  }

  private renderActiveRun() {
    const mgr = getTestRunManager();
    const summary = mgr.getSummary();
    const hasResults = summary.total > 0;

    return html`
      <div class="run-banner" data-testid="traklet-run-banner">
        <div class="run-banner__header">
          <span class="run-banner__name">${this.activeRun!.name}</span>
          <button
            class="traklet-btn traklet-btn--secondary traklet-btn--sm"
            data-testid="traklet-btn-stop-run"
            @click=${this.handleStopRun}
          >
            Stop Run
          </button>
        </div>
        <div class="run-banner__progress">
          ${hasResults
            ? `${summary.passed + summary.failed + summary.blocked + summary.skipped} tested`
            : 'No tests recorded yet. Open a test case and mark it as Pass/Fail.'}
        </div>
        ${hasResults ? html`
          <div class="progress-bar">
            <div
              class="progress-bar__fill ${this.getProgressClass(summary)}"
              style="width: ${summary.percentComplete}%"
            ></div>
          </div>
        ` : nothing}
      </div>

      ${hasResults ? this.renderSummaryCards(summary) : nothing}

      ${this.activeRun!.results.length > 0 ? html`
        <h3 class="history-title">Results</h3>
        ${this.activeRun!.results.map((r) => html`
          <div class="history-item">
            <span class="history-item__name">${r.issueTitle}</span>
            <span class="history-stat ${r.status === 'passed' ? 'history-stat--pass' : r.status === 'failed' ? 'history-stat--fail' : ''}">${r.status}</span>
          </div>
        `)}
      ` : nothing}
    `;
  }

  private renderSummaryCards(summary: TestRunSummary) {
    return html`
      <div class="summary-cards">
        <div class="summary-card summary-card--pass">
          <div class="summary-card__count">${summary.passed}</div>
          <div class="summary-card__label">Passed</div>
        </div>
        <div class="summary-card summary-card--fail">
          <div class="summary-card__count">${summary.failed}</div>
          <div class="summary-card__label">Failed</div>
        </div>
        <div class="summary-card summary-card--blocked">
          <div class="summary-card__count">${summary.blocked + summary.skipped}</div>
          <div class="summary-card__label">Blocked</div>
        </div>
        <div class="summary-card summary-card--untested">
          <div class="summary-card__count">${summary.notTested}</div>
          <div class="summary-card__label">Untested</div>
        </div>
      </div>
    `;
  }

  private renderStartRun() {
    return html`
      <div class="start-run" data-testid="traklet-start-run">
        <div class="start-run__title">Start a Test Run</div>
        <div class="start-run__desc">
          Name your test run and start marking test cases as pass, fail, or blocked.
        </div>
        <div class="start-run__form">
          <input
            class="start-run__input"
            type="text"
            placeholder="e.g., Sprint 12 QA"
            data-testid="traklet-input-run-name"
            .value=${this.runName}
            @input=${(e: InputEvent) => { this.runName = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.handleStartRun(); }}
          />
          <button
            class="traklet-btn traklet-btn--primary traklet-btn--sm"
            data-testid="traklet-btn-start-run"
            ?disabled=${!this.runName.trim()}
            @click=${this.handleStartRun}
          >
            Start
          </button>
        </div>
      </div>
    `;
  }

  private renderHistory() {
    if (this.history.length === 0) {
      return this.activeRun ? nothing : html`<div class="no-history">No previous test runs.</div>`;
    }

    return html`
      <h3 class="history-title">Previous Runs</h3>
      ${this.history.map((run) => {
        const mgr = getTestRunManager();
        const summary = mgr.getSummary(run.id);
        const date = new Date(run.startedAt).toLocaleDateString();
        return html`
          <div class="history-item" data-testid="traklet-history-run-${run.id}">
            <div>
              <div class="history-item__name">${run.name}</div>
              <div class="history-item__date">${date}</div>
            </div>
            <div class="history-item__stats">
              <span class="history-stat history-stat--pass">${summary.passed}P</span>
              <span class="history-stat history-stat--fail">${summary.failed}F</span>
            </div>
          </div>
        `;
      })}
    `;
  }

  private getProgressClass(summary: TestRunSummary): string {
    if (summary.failed > 0) return 'progress-bar__fill--bad';
    if (summary.blocked > 0) return 'progress-bar__fill--warn';
    return 'progress-bar__fill--good';
  }

  private handleStartRun() {
    const name = this.runName.trim();
    if (!name) return;
    getTestRunManager().startRun(name, 'user');
    this.runName = '';
  }

  private handleStopRun() {
    getTestRunManager().stopRun();
  }
}
