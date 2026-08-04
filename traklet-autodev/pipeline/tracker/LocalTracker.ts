/**
 * LocalTracker — an ITracker backed by a JSON file on disk.
 *
 * This is the local stand-in for `gh` / `az`. Issues and their labels live in
 * traklet-autodev/.state/tracker.json so the orchestrator (Node) and the
 * dashboard (browser, via the server) observe the same state machine. Every
 * mutation persists and emits an event so the orchestrator can react to label
 * changes exactly the way GitHub's `issues.labeled` webhook would.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  ITracker,
  Issue,
  JamFixture,
  TrackerEvent,
} from '../interfaces';
import {
  STATE_PREFIX,
  stateLabel,
  metaId,
  type PipelineState,
} from '../labels';

interface PersistShape {
  nextNumber: number;
  issues: Issue[];
}

export class LocalTracker implements ITracker {
  private issues = new Map<string, Issue>();
  private nextNumber = 1;
  private listeners = new Set<(event: TrackerEvent) => void>();

  constructor(private readonly statePath: string) {
    this.load();
  }

  // -- persistence ----------------------------------------------------------

  private load(): void {
    if (!existsSync(this.statePath)) return;
    try {
      const raw = readFileSync(this.statePath, 'utf8');
      const data = JSON.parse(raw) as PersistShape;
      this.nextNumber = data.nextNumber ?? 1;
      for (const issue of data.issues ?? []) this.issues.set(issue.id, issue);
    } catch (err) {
      console.warn('[tracker] could not load state, starting empty:', err);
    }
  }

  private persist(): void {
    const data: PersistShape = {
      nextNumber: this.nextNumber,
      issues: [...this.issues.values()],
    };
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(data, null, 2));
  }

  private emit(event: TrackerEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (err) {
        console.error('[tracker] listener error:', err);
      }
    }
  }

  private touch(issue: Issue): void {
    issue.updatedAt = new Date().toISOString();
    this.persist();
  }

  private require(issueId: string): Issue {
    const issue = this.issues.get(issueId);
    if (!issue) throw new Error(`unknown issue: ${issueId}`);
    return issue;
  }

  // -- reads ----------------------------------------------------------------

  on(listener: (event: TrackerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async getIssue(issueId: string): Promise<Issue | null> {
    return this.issues.get(issueId) ?? null;
  }

  async listIssues(): Promise<Issue[]> {
    return [...this.issues.values()].sort((a, b) => a.number - b.number);
  }

  async findByJamId(shortJamId: string): Promise<Issue | null> {
    const wanted = metaId(shortJamId);
    for (const issue of this.issues.values()) {
      if (issue.labels.includes(wanted)) return issue;
    }
    return null;
  }

  // -- writes ---------------------------------------------------------------

  async createIssueFromJam(jam: JamFixture): Promise<Issue> {
    const short = jam.id.slice(-8);
    const number = this.nextNumber++;
    const id = `I-${number}`;
    const now = new Date().toISOString();
    const issue: Issue = {
      id,
      number,
      title: jam.title,
      body:
        `<!-- jam-id: ${jam.id} -->\n\n` +
        `**Reported via Jam:** ${jam.url}\n\n` +
        `**Author:** ${jam.author}\n\n` +
        `**Expected behavior:** ${jam.expectedBehavior}\n`,
      state: 'open',
      labels: ['jam', 'customer-reported', metaId(short), stateLabel('queued')],
      comments: [],
      jamId: jam.id,
      jamUrl: jam.url,
      createdAt: now,
      updatedAt: now,
      prNumber: null,
      prState: 'none',
      prBranch: null,
      prBase: null,
      artifacts: {},
    };
    this.issues.set(id, issue);
    this.persist();
    this.emit({ type: 'issue:created', issueId: id });
    this.emit({ type: 'issue:changed', issueId: id });
    return issue;
  }

  async setStateLabel(issueId: string, next: PipelineState): Promise<void> {
    const issue = this.require(issueId);
    issue.labels = issue.labels.filter((l) => !l.startsWith(STATE_PREFIX));
    issue.labels.push(stateLabel(next));
    this.touch(issue);
    this.emit({ type: 'issue:changed', issueId });
  }

  async addLabels(issueId: string, labels: string[]): Promise<void> {
    const issue = this.require(issueId);
    issue.labels = [...new Set([...issue.labels, ...labels])];
    this.touch(issue);
    this.emit({ type: 'issue:changed', issueId });
  }

  async removeLabels(issueId: string, labels: string[]): Promise<void> {
    const issue = this.require(issueId);
    const drop = new Set(labels);
    issue.labels = issue.labels.filter((l) => !drop.has(l));
    this.touch(issue);
    this.emit({ type: 'issue:changed', issueId });
  }

  async comment(issueId: string, author: string, body: string): Promise<void> {
    const issue = this.require(issueId);
    issue.comments.push({
      id: `C-${issue.comments.length + 1}`,
      author,
      body,
      createdAt: new Date().toISOString(),
    });
    this.touch(issue);
    this.emit({ type: 'issue:changed', issueId });
  }

  async setArtifact(issueId: string, key: string, value: string): Promise<void> {
    const issue = this.require(issueId);
    issue.artifacts[key] = value;
    this.touch(issue);
    this.emit({ type: 'issue:changed', issueId });
  }

  async openDraftPR(issueId: string, headBranch: string, baseBranch: string): Promise<void> {
    const issue = this.require(issueId);
    issue.prNumber = issue.number + 1000;
    issue.prState = 'draft';
    issue.prBranch = headBranch;
    issue.prBase = baseBranch;
    this.touch(issue);
    this.emit({ type: 'issue:changed', issueId });
  }

  async markPRReady(issueId: string): Promise<void> {
    const issue = this.require(issueId);
    if (issue.prState !== 'none') issue.prState = 'ready';
    this.touch(issue);
    this.emit({ type: 'issue:changed', issueId });
  }

  async mergePR(issueId: string): Promise<void> {
    const issue = this.require(issueId);
    issue.prState = 'merged';
    this.touch(issue);
    this.emit({ type: 'issue:changed', issueId });
  }

  /** Dev convenience — wipe all issues and reset numbering. */
  async reset(): Promise<void> {
    const ids = [...this.issues.keys()];
    this.issues.clear();
    this.nextNumber = 1;
    this.persist();
    for (const id of ids) this.emit({ type: 'issue:changed', issueId: id });
  }

  async closeIssue(issueId: string): Promise<void> {
    const issue = this.require(issueId);
    issue.state = 'closed';
    this.touch(issue);
    this.emit({ type: 'issue:closed', issueId });
    this.emit({ type: 'issue:changed', issueId });
  }
}
