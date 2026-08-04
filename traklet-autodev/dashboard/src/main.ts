/**
 * Traklet AutoDev dashboard — the pipeline control plane.
 *
 * A Lit web component that renders the jam:state/* machine as a live board and
 * surfaces the TWO human gates (triage a GREEN result, merge a ready PR) as the
 * only buttons that advance the loop by hand. Everything else moves on its own
 * via the orchestrator. Talks to the control-plane server over /api + SSE.
 */

import { LitElement, html, css, type PropertyValues } from 'lit';

interface Comment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}
interface Issue {
  id: string;
  number: number;
  title: string;
  state: 'open' | 'closed';
  labels: string[];
  comments: Comment[];
  jamId: string;
  jamUrl: string;
  prNumber: number | null;
  prState: 'none' | 'draft' | 'ready' | 'merged';
  prBase: string | null;
  artifacts: Record<string, string>;
}
interface Fixture {
  id: string;
  title: string;
  author: string;
  category: string;
  route: string;
}

const CATEGORY_ICON: Record<string, string> = {
  bug: '🐞',
  'works-as-designed': '✅',
  'false-red': '🟡',
  'broken-selectors': '🧩',
};

const STATE_PREFIX = 'jam:state/';

const LANES: { title: string; note?: string; states: string[] }[] = [
  { title: 'Intake', states: ['queued', 'extracting', 'authoring'] },
  { title: 'RED gate', states: ['red', 'spec-broken'] },
  { title: 'Triage', note: 'human gate ①', states: ['green-triage'] },
  { title: 'Fix · Verify', states: ['fixing', 'verifying'] },
  { title: 'Review', note: 'human gate ②', states: ['ready-for-review'] },
  { title: 'Done', states: ['solved', 'wont-fix', 'needs-human'] },
];

const STATE_COLOR: Record<string, string> = {
  queued: '#6e7681',
  extracting: '#388bfd',
  authoring: '#388bfd',
  red: '#f85149',
  'spec-broken': '#db6d28',
  'green-triage': '#d29922',
  fixing: '#a371f7',
  verifying: '#a371f7',
  'ready-for-review': '#2f81f7',
  solved: '#3fb950',
  'wont-fix': '#8b949e',
  'needs-human': '#bf4b8a',
};

function stateOf(issue: Issue): string {
  const l = issue.labels.find((x) => x.startsWith(STATE_PREFIX));
  return l ? l.slice(STATE_PREFIX.length) : 'unknown';
}

export class AutodevDashboard extends LitElement {
  static properties = {
    issues: { state: true },
    fixtures: { state: true },
    selected: { state: true },
    busy: { state: true },
    expanded: { state: true },
  };

  declare issues: Issue[];
  declare fixtures: Fixture[];
  declare selected: string;
  declare busy: boolean;
  declare expanded: Record<string, boolean>;

  private events?: EventSource;

  constructor() {
    super();
    this.issues = [];
    this.fixtures = [];
    this.selected = '';
    this.busy = false;
    this.expanded = {};
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.refresh();
    void this.loadFixtures();
    this.events = new EventSource('/api/events');
    this.events.onmessage = () => void this.refresh();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.events?.close();
  }

  protected firstUpdated(_c: PropertyValues): void {
    void _c;
  }

  private async refresh(): Promise<void> {
    const res = await fetch('/api/issues');
    this.issues = (await res.json()) as Issue[];
  }

  private async loadFixtures(): Promise<void> {
    const res = await fetch('/api/fixtures');
    this.fixtures = (await res.json()) as Fixture[];
    if (!this.selected && this.fixtures.length) this.selected = this.fixtures[0].id;
  }

  private async post(path: string, body?: unknown): Promise<void> {
    this.busy = true;
    try {
      await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      await this.refresh();
    } finally {
      this.busy = false;
    }
  }

  private record(): void {
    if (this.selected) void this.post('/api/record', { jamId: this.selected });
  }

  // -- render ---------------------------------------------------------------

  render() {
    return html`
      <header>
        <div class="brand">
          <span class="logo">◆</span>
          <div>
            <h1>Traklet AutoDev</h1>
            <p>Jam → Resolution pipeline · local simulator</p>
          </div>
        </div>
        <div class="controls">
          <select
            .value=${this.selected}
            @change=${(e: Event) => (this.selected = (e.target as HTMLSelectElement).value)}
          >
            ${this.fixtures.map(
              (f) => html`<option value=${f.id}>${CATEGORY_ICON[f.category] ?? '•'} ${f.title}</option>`
            )}
          </select>
          <button class="primary" ?disabled=${this.busy || !this.selected} @click=${() => this.record()}>
            Record a Jam
          </button>
          <button class="ghost" ?disabled=${this.busy} @click=${() => this.post('/api/reset')}>Reset</button>
        </div>
      </header>

      <div class="branches">
        <span class="br def">develop<em>default · widget + workflow · triggers here</em></span>
        <span class="arrow">→ PR →</span>
        <span class="br uat">uat<em>pipeline PRs land · merge = solved</em></span>
        <span class="arrow">→ release train →</span>
        <span class="br main">main<em>production · not per-Jam</em></span>
      </div>

      <div class="board">
        ${LANES.map(
          (lane) => html`
            <section class="lane">
              <div class="lane-head">
                <span>${lane.title}</span>
                ${lane.note ? html`<em>${lane.note}</em>` : ''}
              </div>
              ${this.issues
                .filter((i) => lane.states.includes(stateOf(i)))
                .map((i) => this.card(i))}
            </section>
          `
        )}
      </div>
    `;
  }

  private card(issue: Issue) {
    const state = stateOf(issue);
    const color = STATE_COLOR[state] ?? '#6e7681';
    const last = issue.comments[issue.comments.length - 1];
    const open = this.expanded[issue.id];
    const jamLabels = issue.labels.filter((l) => l.startsWith('jam:') && !l.startsWith(STATE_PREFIX));

    return html`
      <article class="card" style="border-left-color:${color}">
        <div class="card-top">
          <span class="num">#${issue.number}</span>
          <span class="badge" style="background:${color}">${state}</span>
          ${issue.prState !== 'none'
            ? html`<span class="pr">PR #${issue.prNumber} · ${issue.prState} → ${issue.prBase ?? '?'}</span>`
            : ''}
        </div>
        <h3>${issue.title}</h3>
        <div class="chips">${jamLabels.map((l) => html`<span class="chip">${l}</span>`)}</div>

        ${this.gate(issue, state)}

        ${last ? html`<p class="last"><b>${last.author}</b> ${this.firstLine(last.body)}</p>` : ''}

        <button class="link" @click=${() => this.toggle(issue.id)}>
          ${open ? 'hide' : 'details'} (${issue.comments.length})
        </button>
        ${open ? this.details(issue) : ''}
      </article>
    `;
  }

  private gate(issue: Issue, state: string) {
    if (state === 'red' && !issue.labels.includes('jam:control/approve-fix')) {
      return html`<div class="actions">
        <button class="approve" ?disabled=${this.busy} @click=${() => this.post(`/api/issues/${issue.id}/start-work`)}>
          Start Work (approve fix)
        </button>
      </div>`;
    }
    if (state === 'green-triage') {
      return html`<div class="actions">
        <button class="danger" ?disabled=${this.busy} @click=${() => this.post(`/api/issues/${issue.id}/triage`, { verdict: 'bug' })}>
          It's a bug
        </button>
        <button class="neutral" ?disabled=${this.busy} @click=${() => this.post(`/api/issues/${issue.id}/triage`, { verdict: 'wad' })}>
          Works as designed
        </button>
      </div>`;
    }
    if (state === 'ready-for-review' && issue.prState !== 'merged') {
      return html`<div class="actions">
        <button class="merge" ?disabled=${this.busy} @click=${() => this.post(`/api/issues/${issue.id}/merge`)}>
          Merge PR
        </button>
      </div>`;
    }
    return '';
  }

  private details(issue: Issue) {
    return html`
      <div class="detail">
        <a href=${issue.jamUrl} target="_blank" rel="noreferrer">${issue.jamUrl}</a>
        ${Object.keys(issue.artifacts).length
          ? html`<div class="artifacts">
              ${Object.entries(issue.artifacts).map(
                ([k, v]) => html`<details><summary>${k}</summary><pre>${v}</pre></details>`
              )}
            </div>`
          : ''}
        <ul class="comments">
          ${issue.comments.map(
            (c) => html`<li><b>${c.author}</b><pre>${c.body}</pre></li>`
          )}
        </ul>
      </div>
    `;
  }

  private toggle(id: string): void {
    this.expanded = { ...this.expanded, [id]: !this.expanded[id] };
  }

  private firstLine(body: string): string {
    const line = body.split('\n').find((l) => l.trim().length) ?? '';
    return line.replace(/[#*`>]/g, '').slice(0, 80);
  }

  static styles = css`
    :host { display: block; color: #c9d1d9; }
    header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 20px; border-bottom: 1px solid #21262d; background: #161b22;
      position: sticky; top: 0; z-index: 5;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo { color: #2f81f7; font-size: 26px; }
    h1 { font-size: 16px; margin: 0; }
    .brand p { margin: 2px 0 0; font-size: 12px; color: #8b949e; }
    .controls { display: flex; gap: 8px; align-items: center; }
    select {
      background: #0d1117; color: #c9d1d9; border: 1px solid #30363d;
      border-radius: 6px; padding: 6px 8px; max-width: 320px; font-size: 13px;
    }
    button {
      border: 1px solid #30363d; background: #21262d; color: #c9d1d9;
      border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer;
    }
    button:disabled { opacity: 0.5; cursor: default; }
    button.primary { background: #238636; border-color: #2ea043; color: white; }
    button.ghost { background: transparent; }
    .branches {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      padding: 10px 20px; background: #0d1117; border-bottom: 1px solid #21262d;
      font-size: 11px;
    }
    .br {
      display: inline-flex; flex-direction: column; line-height: 1.3;
      padding: 4px 10px; border-radius: 6px; border: 1px solid #30363d; font-weight: 600;
    }
    .br em { font-style: normal; font-weight: 400; color: #8b949e; font-size: 9px; }
    .br.def { border-color: #2f81f7; color: #2f81f7; }
    .br.uat { border-color: #d29922; color: #d29922; }
    .br.main { border-color: #3fb950; color: #3fb950; }
    .arrow { color: #6e7681; }
    .board {
      display: grid; grid-template-columns: repeat(6, minmax(190px, 1fr));
      gap: 10px; padding: 16px 20px; align-items: start; overflow-x: auto;
    }
    .lane { background: #0d1117; min-height: 120px; }
    .lane-head {
      display: flex; justify-content: space-between; align-items: baseline;
      font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em;
      color: #8b949e; padding: 4px 2px 10px; border-bottom: 1px solid #21262d; margin-bottom: 10px;
    }
    .lane-head em { color: #d29922; font-style: normal; font-size: 10px; }
    .card {
      background: #161b22; border: 1px solid #21262d; border-left: 3px solid #6e7681;
      border-radius: 8px; padding: 10px; margin-bottom: 10px;
    }
    .card-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .num { font-size: 12px; color: #8b949e; }
    .badge { font-size: 10px; color: #0d1117; padding: 1px 7px; border-radius: 999px; font-weight: 600; }
    .pr { font-size: 10px; color: #8b949e; }
    h3 { font-size: 13px; margin: 8px 0 6px; line-height: 1.35; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip { font-size: 9px; color: #8b949e; border: 1px solid #30363d; border-radius: 4px; padding: 1px 4px; }
    .actions { display: flex; gap: 6px; margin: 10px 0 4px; flex-wrap: wrap; }
    .approve { background: #1f6feb; border-color: #1f6feb; color: white; }
    .merge { background: #238636; border-color: #2ea043; color: white; }
    .danger { background: #da3633; border-color: #da3633; color: white; }
    .neutral { background: #30363d; }
    .last { font-size: 11px; color: #8b949e; margin: 8px 0 4px; }
    .link { background: none; border: none; color: #58a6ff; padding: 2px 0; font-size: 11px; }
    .detail { border-top: 1px solid #21262d; margin-top: 8px; padding-top: 8px; }
    .detail a { color: #58a6ff; font-size: 11px; word-break: break-all; }
    .artifacts summary, .comments b { font-size: 11px; cursor: pointer; }
    pre {
      white-space: pre-wrap; word-break: break-word; font-size: 10px;
      background: #0d1117; border: 1px solid #21262d; border-radius: 6px;
      padding: 6px; margin: 4px 0; color: #adbac7;
    }
    .comments { list-style: none; padding: 0; margin: 6px 0 0; }
    .comments li { margin-bottom: 6px; }
  `;
}

customElements.define('autodev-dashboard', AutodevDashboard);
