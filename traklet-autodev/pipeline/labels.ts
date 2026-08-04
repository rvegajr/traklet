/**
 * labels.ts — the jam:* taxonomy and the §9 transition table.
 *
 * The GitHub/Azure issue label is the program counter. Exactly one jam:state/*
 * label is set at a time; swapping it is what advances the machine. This module
 * is the single source of truth for the vocabulary and the legal transitions.
 *
 * Mirrors JAM_TO_RESOLUTION_PIPELINE.md §8–9.
 */

export const STATE_PREFIX = 'jam:state/';
export const VERDICT_PREFIX = 'jam:verdict/';
export const CONTROL_PREFIX = 'jam:control/';
export const META_PREFIX = 'jam:meta/';

/** jam:state/* — the program counter (exactly ONE at a time). */
export const STATES = [
  'queued',
  'extracting',
  'authoring',
  'red',
  'green-triage',
  'spec-broken',
  'fixing',
  'verifying',
  'ready-for-review',
  'solved',
  'wont-fix',
  'needs-human',
] as const;

export type PipelineState = (typeof STATES)[number];

/** Terminal states — the machine rests here forever. */
export const TERMINAL_STATES: ReadonlySet<PipelineState> = new Set([
  'solved',
  'wont-fix',
]);

/**
 * Human-gated states — the machine rests here and waits for a person.
 * These are the irreducible gates from the recipe (triage + merge), plus the
 * escalation sink.
 */
export const HUMAN_GATES: ReadonlySet<PipelineState> = new Set([
  'green-triage', // gate 1: is it actually a bug?
  'ready-for-review', // gate 2: is the fix correct? (merge)
  'needs-human', // escalation
]);

export const CONTROL = {
  auto: `${CONTROL_PREFIX}auto`,
  approveFix: `${CONTROL_PREFIX}approve-fix`,
  regenerate: `${CONTROL_PREFIX}regenerate`,
  hold: `${CONTROL_PREFIX}hold`,
} as const;

export const VERDICT = {
  bug: `${VERDICT_PREFIX}bug`,
  worksAsDesigned: `${VERDICT_PREFIX}works-as-designed`,
  environmental: `${VERDICT_PREFIX}environmental`,
  flaky: `${VERDICT_PREFIX}flaky`,
} as const;

export const stateLabel = (s: PipelineState): string => `${STATE_PREFIX}${s}`;
export const metaId = (shortJamId: string): string => `${META_PREFIX}id-${shortJamId}`;
export const metaAttempt = (n: number): string => `${META_PREFIX}attempt-${n}`;

/** Extract the single jam:state/* value from a label list, if present. */
export function readState(labels: readonly string[]): PipelineState | null {
  for (const l of labels) {
    if (l.startsWith(STATE_PREFIX)) {
      const v = l.slice(STATE_PREFIX.length) as PipelineState;
      if ((STATES as readonly string[]).includes(v)) return v;
    }
  }
  return null;
}

/** Highest attempt-N currently recorded on the issue (0 if none). */
export function readAttempt(labels: readonly string[]): number {
  let max = 0;
  for (const l of labels) {
    if (l.startsWith(`${META_PREFIX}attempt-`)) {
      const n = Number(l.slice(`${META_PREFIX}attempt-`.length));
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return max;
}

export const isHeld = (labels: readonly string[]): boolean => labels.includes(CONTROL.hold);
export const isHumanGate = (s: PipelineState): boolean => HUMAN_GATES.has(s);
export const isTerminal = (s: PipelineState): boolean => TERMINAL_STATES.has(s);

/** Max fix/regenerate attempts before escalating to needs-human (§12 caps). */
export const ATTEMPT_CAP = 3;
