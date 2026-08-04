/**
 * orchestrator.ts — the state-machine driver.
 *
 * This is the platform-independent core. It advances each issue ONE stage per
 * step by reading the jam:state/* label and running the matching stage, exactly
 * as JAM_TO_RESOLUTION_PIPELINE.md §9 prescribes. It is deliberately ignorant of
 * GitHub/Azure/Jam — it only talks to the ITracker/IJamSource/Stage seams.
 *
 * Two rules it never breaks:
 *   - It rests at the human gates (green-triage, ready-for-review, needs-human)
 *     and at the control labels (approve-fix / merge gate the only advances out).
 *   - It respects jam:control/hold (freeze) at every step.
 */

import type { ITracker, IJamSource, Stage, StageContext } from './interfaces';
import {
  readState,
  readAttempt,
  isHeld,
  metaAttempt,
  ATTEMPT_CAP,
  CONTROL,
  type PipelineState,
} from './labels';
import { extract } from './stages/extract';
import { author } from './stages/author';
import { fix } from './stages/fix';
import { verify } from './stages/verify';
import { resolve } from './stages/resolve';

export interface OrchestratorOptions {
  /** Pause before each stage so the dashboard animates the cascade. */
  stepDelayMs?: number;
  log?: (msg: string) => void;
}

export class PipelineOrchestrator {
  private readonly stepDelayMs: number;
  private readonly log: (msg: string) => void;
  private readonly running = new Set<string>();
  private readonly pending = new Set<string>();

  constructor(
    private readonly tracker: ITracker,
    private readonly jam: IJamSource,
    options: OrchestratorOptions = {}
  ) {
    this.stepDelayMs = options.stepDelayMs ?? 700;
    this.log = options.log ?? (() => {});
  }

  /** Subscribe to tracker changes and kick the loop for each affected issue. */
  start(): () => void {
    return this.tracker.on((event) => {
      void this.tick(event.issueId);
    });
  }

  private delay(): Promise<void> {
    return new Promise((r) => setTimeout(r, this.stepDelayMs));
  }

  /**
   * Drive one issue through as many auto stages as it can take, resting at the
   * first human gate. Serialized per issue; concurrent kicks coalesce.
   */
  private async tick(issueId: string): Promise<void> {
    if (this.running.has(issueId)) {
      this.pending.add(issueId);
      return;
    }
    this.running.add(issueId);
    try {
      // Keep advancing until we hit a state with no auto-action.
      for (;;) {
        const issue = await this.tracker.getIssue(issueId);
        if (!issue || issue.state === 'closed') break;
        if (isHeld(issue.labels)) {
          this.log(`#${issue.number} held — skipping`);
          break;
        }
        const state = readState(issue.labels);
        if (!state) break;

        const action = this.actionFor(state, issue.labels, issue.prState);
        if (!action) break; // rest (human gate / terminal / awaiting control)

        await this.delay();
        this.log(`#${issue.number} ${state} -> running stage`);

        const fixture = await this.jam.get(issue.jamId);
        if (!fixture) {
          this.log(`#${issue.number} missing fixture ${issue.jamId} — needs-human`);
          await this.tracker.setStateLabel(issueId, 'needs-human');
          break;
        }
        const ctx: StageContext = { tracker: this.tracker, jam: this.jam, issue, fixture };
        await action(ctx);

        const after = await this.tracker.getIssue(issueId);
        if (after && readState(after.labels) === state) {
          // Safety: an auto-action that didn't advance would loop forever.
          this.log(`#${issue.number} stage did not advance from ${state} — stopping`);
          break;
        }
      }
    } catch (err) {
      this.log(`#${issueId} stage error: ${String(err)}`);
      try {
        await this.tracker.comment(issueId, 'autodev[bot]', `Stage error: ${String(err)}`);
        await this.tracker.setStateLabel(issueId, 'needs-human');
      } catch {
        /* best effort */
      }
    } finally {
      this.running.delete(issueId);
      if (this.pending.delete(issueId)) void this.tick(issueId);
    }
  }

  /** The §9 transition table: state -> the auto stage to run (or null to rest). */
  private actionFor(
    state: PipelineState,
    labels: readonly string[],
    prState: string
  ): Stage | null {
    switch (state) {
      case 'queued':
        return async ({ tracker, issue }) => tracker.setStateLabel(issue.id, 'extracting');
      case 'extracting':
        return extract;
      case 'authoring':
        return author;
      case 'red':
        // Gated: advance only with explicit approval (or full autonomy).
        if (labels.includes(CONTROL.approveFix) || labels.includes(CONTROL.auto)) {
          return async ({ tracker, issue }) => tracker.setStateLabel(issue.id, 'fixing');
        }
        return null; // rest — a human clicks "Start Work"
      case 'fixing':
        return fix;
      case 'verifying':
        return verify;
      case 'ready-for-review':
        // Gated: advance only once the PR is merged (the human merge gate).
        if (prState === 'merged') return resolve;
        return null;
      case 'spec-broken':
        return async ({ tracker, issue }) => {
          const n = readAttempt(issue.labels);
          if (n < ATTEMPT_CAP) {
            await tracker.addLabels(issue.id, [metaAttempt(n + 1)]);
            await tracker.comment(issue.id, 'autodev[bot]', `Regenerating spec (attempt ${n + 1}/${ATTEMPT_CAP}).`);
            await tracker.setStateLabel(issue.id, 'authoring');
          } else {
            await tracker.comment(issue.id, 'autodev[bot]', `Attempt cap reached — escalating.`);
            await tracker.setStateLabel(issue.id, 'needs-human');
          }
        };
      // Human gates + terminals: rest.
      case 'green-triage':
      case 'needs-human':
      case 'solved':
      case 'wont-fix':
        return null;
      default:
        return null;
    }
  }
}
