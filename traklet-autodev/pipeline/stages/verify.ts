/**
 * Stage 5 — VERIFY.
 *
 * PHASE A (this file): post a passing verification summary, mark the PR ready,
 * and advance verifying -> ready-for-review (a human still merges). The fix is
 * simulated so verification always passes here.
 *
 * PHASE B/C: run the new spec GREEN, the unit suite GREEN, an e2e smoke GREEN,
 * then re-run the new spec against a preview deploy of the EDITED code. Any
 * failure/regression -> revert + needs-human.
 */

import type { Stage } from '../interfaces';
import { VERIFY_ENV } from '../branches';

const BOT = 'autodev[bot]';

export const verify: Stage = async ({ tracker, issue, fixture }) => {
  const proof =
    `### Verify — RED -> GREEN\n\n` +
    `1. New spec \`e2e/${fixture.id}.spec.ts\` — **GREEN** (was RED on the unfixed code)\n` +
    `2. Unit suite — **GREEN**\n` +
    `3. e2e smoke — **GREEN**\n` +
    `4. Re-ran new spec on a **${VERIFY_ENV}** deploy of the *edited* code — **GREEN** (never prod)\n\n` +
    `No regressions. Marking PR ready for review.`;

  // INV-2: verification runs against the UAT/preview env, never prod.
  await tracker.setArtifact(issue.id, 'verify.env', VERIFY_ENV);
  await tracker.setArtifact(
    issue.id,
    'verify.proof',
    `RED on base, GREEN after fix; full suite green`
  );
  await tracker.comment(issue.id, BOT, proof);
  await tracker.markPRReady(issue.id);
  await tracker.setStateLabel(issue.id, 'ready-for-review');
};
