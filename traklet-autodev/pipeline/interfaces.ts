/**
 * interfaces.ts — the four pluggable seams.
 *
 * The whole point of Traklet AutoDev is that the *core loop* (extract -> author
 * -> RED gate -> fix -> verify) is platform-independent, and only these four
 * boundaries are environment-specific. Phase A ships local/deterministic impls;
 * the real pipeline swaps each one without touching the orchestrator:
 *
 *   IJamSource    MockJamSource (fixtures)      -> Jam MCP
 *   ITracker      LocalTracker (JSON store)     -> gh / az REST
 *   IStage        deterministic functions        -> Claude Code action
 *   IDeployTarget LocalDevServer (Phase B/C)     -> Vercel preview
 */

import type { PipelineState } from './labels';

// ---------------------------------------------------------------------------
// Capture seam — IJamSource
// ---------------------------------------------------------------------------

export interface JamUserEvent {
  t: number;
  type: string;
  target: string;
  detail?: string;
}

export interface JamNetworkRequest {
  t: number;
  method: string;
  url: string;
  status: number;
  responseBody?: string;
}

export interface JamConsoleLog {
  t: number;
  level: string;
  text: string;
}

export interface JamAssertion {
  testid: string;
  expect: string;
  description: string;
}

/** Human-facing grouping for the corpus + dashboard. NOT read by the classifier. */
export type FixtureCategory =
  | 'bug'
  | 'works-as-designed'
  | 'false-red'
  | 'broken-selectors';

/**
 * The simulated result of running the authored spec against the CURRENT (unfixed)
 * code. In Phase B this is replaced by the real Playwright exit code. It is an
 * INPUT to the RED-gate classifier (along with the network/console evidence).
 */
export type SpecOutcome = 'fail' | 'pass' | 'error';

/**
 * Held-out acceptance oracle — used ONLY by the acceptance harness to assert the
 * loop behaved. The classifier must never read this (that would be circular).
 */
export interface ExpectedOutcome {
  /** Where the AUTO stages should come to rest before any human action. */
  restsAt: string;
  /** Terminal state after the appropriate human action (or = restsAt if none). */
  terminal: string;
  /** The human action needed to reach `terminal`, if any. */
  humanAction: 'approve-fix-then-merge' | 'triage-wad' | 'none';
}

export interface JamFixture {
  id: string;
  url: string;
  title: string;
  author: string;
  createdAt: string;
  route: string;
  suite: string;
  /** Display/grouping only — never an input to classification. */
  category: FixtureCategory;
  /** Classifier input: what running the spec on unfixed code would do. */
  specOutcome: SpecOutcome;
  expectedBehavior: string;
  metadata: Record<string, string>;
  userEvents: JamUserEvent[];
  networkRequests: JamNetworkRequest[];
  consoleLogs: JamConsoleLog[];
  assertion: JamAssertion;
  /** Held-out acceptance oracle (harness only). */
  expected: ExpectedOutcome;
}

export interface IJamSource {
  list(): Promise<JamFixture[]>;
  get(id: string): Promise<JamFixture | null>;
}

// ---------------------------------------------------------------------------
// Tracker seam — ITracker (the label state machine store)
// ---------------------------------------------------------------------------

export interface Comment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export type PRState = 'none' | 'draft' | 'ready' | 'merged';

export interface Issue {
  id: string;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  comments: Comment[];
  jamId: string;
  jamUrl: string;
  createdAt: string;
  updatedAt: string;
  prNumber: number | null;
  prState: PRState;
  /** Head branch of the pipeline PR (jam/<id>-<suite>). */
  prBranch: string | null;
  /** Base branch the PR targets — must always be `uat` (INV-1). */
  prBase: string | null;
  /** Artifacts the stages attach (spec path, TC path, diff, proof) — demo view. */
  artifacts: Record<string, string>;
}

export type TrackerEvent =
  | { type: 'issue:created'; issueId: string }
  | { type: 'issue:changed'; issueId: string }
  | { type: 'issue:closed'; issueId: string };

export interface ITracker {
  createIssueFromJam(jam: JamFixture): Promise<Issue>;
  getIssue(issueId: string): Promise<Issue | null>;
  listIssues(): Promise<Issue[]>;
  findByJamId(shortJamId: string): Promise<Issue | null>;

  /** Swap the single jam:state/* label — this is what advances the machine. */
  setStateLabel(issueId: string, next: PipelineState): Promise<void>;
  addLabels(issueId: string, labels: string[]): Promise<void>;
  removeLabels(issueId: string, labels: string[]): Promise<void>;

  comment(issueId: string, author: string, body: string): Promise<void>;
  setArtifact(issueId: string, key: string, value: string): Promise<void>;

  openDraftPR(issueId: string, headBranch: string, baseBranch: string): Promise<void>;
  markPRReady(issueId: string): Promise<void>;
  mergePR(issueId: string): Promise<void>;
  closeIssue(issueId: string): Promise<void>;

  on(listener: (event: TrackerEvent) => void): () => void;
}

// ---------------------------------------------------------------------------
// Stage seam — IStage
// ---------------------------------------------------------------------------

export interface StageContext {
  tracker: ITracker;
  jam: IJamSource;
  issue: Issue;
  fixture: JamFixture;
}

/**
 * A stage performs exactly one unit of work and ends by swapping the
 * jam:state/* label (or, for human gates, leaves it for a person). It is the
 * unit the real pipeline replaces with a headless Claude Code invocation.
 */
export type Stage = (ctx: StageContext) => Promise<void>;

// ---------------------------------------------------------------------------
// Verify seam — IDeployTarget (Phase B/C; declared now so the shape is fixed)
// ---------------------------------------------------------------------------

export interface IDeployTarget {
  /** Ensure a deploy of the *current* (edited) code is reachable, return base URL. */
  ensure(branch: string): Promise<string>;
}
