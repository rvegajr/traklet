/**
 * Stage 3 — RED GATE (the critical gate).
 *
 * PHASE A (this file): classify from the fixture's declared `signal` corroborated
 * by real failure evidence (a 4xx/5xx or a console error). This encodes the
 * §12 *false-RED guard*: a spec that "fails" with no corroborating network/console
 * signal is suspect -> spec-broken, never red.
 *
 * PHASE B: identical decision, but the inputs come from actually running the
 * authored Playwright spec against the deployed (unfixed) app and reading the
 * exit code, then cross-checking the Jam's network/console evidence.
 */

import type { JamFixture } from '../interfaces';
import type { PipelineState } from '../labels';
import { VERDICT } from '../labels';

export interface Classification {
  state: Extract<PipelineState, 'red' | 'green-triage' | 'spec-broken'>;
  verdict: string | null;
  reason: string;
}

export function hasFailureSignal(fixture: JamFixture): boolean {
  const net = fixture.networkRequests.some((r) => r.status >= 400);
  const con = fixture.consoleLogs.some((l) => l.level === 'error');
  return net || con;
}

/**
 * Classify from the spec result + the corroborating evidence ONLY. It must never
 * read `fixture.category` or `fixture.expected` — those are the held-out answer.
 */
export function classify(fixture: JamFixture): Classification {
  const evidence = hasFailureSignal(fixture);

  switch (fixture.specOutcome) {
    case 'error':
      return {
        state: 'spec-broken',
        verdict: null,
        reason: 'Authored spec errored (selectors/helpers did not resolve).',
      };
    case 'pass':
      // The recorded behavior is the current, intended path.
      return {
        state: 'green-triage',
        verdict: VERDICT.worksAsDesigned,
        reason:
          'Spec PASSES on current code — likely works-as-designed or the bug was not captured. Human triage required; the fix agent must NOT run.',
      };
    case 'fail':
      if (evidence) {
        return {
          state: 'red',
          verdict: VERDICT.bug,
          reason:
            'Spec FAILS on current code and the failure correlates with a real 4xx/5xx or console error. Bug confirmed.',
        };
      }
      // False-RED guard: a failing spec with no corroborating evidence is suspect.
      return {
        state: 'spec-broken',
        verdict: null,
        reason:
          'Spec failed but NO corroborating network/console failure exists in the Jam. Treating as spec-broken, not red (false-RED guard).',
      };
  }
}
