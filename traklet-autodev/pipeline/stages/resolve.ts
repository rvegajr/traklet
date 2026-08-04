/**
 * Stage 6 — RESOLVE (runs after a human merges).
 *
 * PHASE A (this file): fill the test case's actual-result + evidence, set solved,
 * close the issue. Mirrors the write-back the real pipeline performs on
 * `pull_request.closed` + merged, including the `npx traklet sync` that flips the
 * Traklet case to Passed/Automated.
 */

import type { Stage } from '../interfaces';

const BOT = 'autodev[bot]';

export const resolve: Stage = async ({ tracker, issue, fixture }) => {
  const actual =
    `Automated regression \`e2e/${fixture.id}.spec.ts\`: RED on base, GREEN after merge; ` +
    `verified on preview of the edited code.`;

  await tracker.setArtifact(issue.id, 'testcase.actual-result', actual);
  await tracker.setArtifact(issue.id, 'testcase.evidence', `${fixture.url} · PR #${issue.prNumber}`);
  await tracker.comment(
    issue.id,
    BOT,
    `### Resolved\n\n` +
      `PR merged into \`${issue.prBase ?? 'uat'}\`. The loop ends here — promotion to ` +
      `\`main\` rides the normal release train, not this issue.\n\n` +
      `Wrote back to the Traklet test case:\n\n> ${actual}\n\n` +
      `Ran \`traklet validate && traklet sync\` — case now shows **Passed / Automated**.`
  );
  await tracker.setStateLabel(issue.id, 'solved');
  await tracker.closeIssue(issue.id);
};
