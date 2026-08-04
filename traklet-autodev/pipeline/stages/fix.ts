/**
 * Stage 4 — FIX AGENT (RED only, gated).
 *
 * PHASE A (this file): apply a simulated, scenario-appropriate patch and record
 * it as the diff artifact. There is no real code to edit yet, so the "fix" is
 * represented, not executed. Advances fixing -> verifying.
 *
 * PHASE B/C: a SEPARATE headless agent edits app/** + lib/** only, treating the
 * spec as an immutable oracle. Anti-cheat (reject any change under tests/) and
 * the attempt cap live in the orchestrator/verify, not here.
 */

import type { Stage } from '../interfaces';

const BOT = 'autodev[bot]';

export const fix: Stage = async ({ tracker, issue, fixture }) => {
  const diff =
    fixture.assertion.expect === 'not-negative'
      ? `--- a/app/src/coupon.ts\n+++ b/app/src/coupon.ts\n@@\n-  const total = subtotal - discount;\n-  return total;\n+  const total = subtotal - discount;\n+  // floor at zero; coupons must never produce a negative order total\n+  return Math.max(0, total);\n`
      : `--- a/app/src/checkout.ts\n+++ b/app/src/checkout.ts\n@@\n-  // (scenario-specific fix)\n+  // (scenario-specific fix)\n`;

  await tracker.setArtifact(issue.id, 'fix.diff', diff);
  await tracker.addLabels(issue.id, ['jam:meta/attempt-1']);
  await tracker.comment(
    issue.id,
    BOT,
    `### Fix agent (sandboxed: app/** + lib/** only)\n\n` +
      `Applied a candidate fix. Touched **0** files under \`tests/\` (anti-cheat clean).\n\n` +
      `\`\`\`diff\n${diff}\`\`\``
  );
  await tracker.setStateLabel(issue.id, 'verifying');
};
