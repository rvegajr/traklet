/**
 * Stage 2 — AUTHOR (spec + test case), then run the RED gate.
 *
 * PHASE A (this file): synthesize a representative Playwright spec + Traklet
 * test-case markdown from the fixture, record them as artifacts, open a draft PR,
 * then call the RED-gate classifier and swap to red / green-triage / spec-broken.
 *
 * PHASE B/C: the spec/TC are written to disk by the jam-to-playwright skill and
 * the RED gate runs the real spec; this stage's contract is unchanged.
 */

import type { Stage, JamFixture } from '../interfaces';
import { classify } from './redGate';
import { stateLabel } from '../labels';
import { BRANCHES } from '../branches';

const BOT = 'autodev[bot]';

function specFor(fixture: JamFixture): string {
  const slug = fixture.id;
  const a = fixture.assertion;
  const expectLine =
    a.expect === 'not-negative'
      ? `    await expect(page.getByTestId('${a.testid}')).not.toContainText('-');`
      : `    await expect(page.getByTestId('${a.testid}')).toContainText('Enterprise');`;
  return (
    `// Jam: ${fixture.url}\n` +
    `// Suite: ${fixture.suite}  Route: ${fixture.route}\n` +
    `import { test, expect } from '@playwright/test';\n\n` +
    `test('${fixture.title}', async ({ page }) => {\n` +
    `  await page.goto('${fixture.route}');\n` +
    fixture.userEvents
      .filter((e) => e.type === 'input' || e.type === 'click')
      .map((e) =>
        e.type === 'input'
          ? `  await page.locator('${e.target}').fill('${(e.detail ?? '').trim()}');`
          : `  await page.locator('${e.target}').click();`
      )
      .join('\n') +
    `\n  // expected: ${a.description}\n` +
    expectLine +
    `\n});\n`
  );
}

export const author: Stage = async ({ tracker, issue, fixture }) => {
  const branch = `jam/${fixture.id}-${fixture.suite}`;
  const specPath = `e2e/${fixture.id}.spec.ts`;
  const tcPath = `.traklet/test-cases/${fixture.suite}/TC-${issue.number}-${fixture.id}.md`;

  const spec = specFor(fixture);
  await tracker.setArtifact(issue.id, 'spec.path', specPath);
  await tracker.setArtifact(issue.id, 'spec.source', spec);
  await tracker.setArtifact(issue.id, 'testcase.path', tcPath);

  await tracker.openDraftPR(issue.id, branch, BRANCHES.pipelineBase);
  await tracker.comment(
    issue.id,
    BOT,
    `### Authored regression\n\n` +
      `- Spec: \`${specPath}\`\n- Test case: \`${tcPath}\`\n` +
      `- Draft PR \`${branch}\` -> \`${BRANCHES.pipelineBase}\` (\`Fixes #${issue.number}\`)\n\n` +
      `\`\`\`ts\n${spec}\`\`\``
  );

  // RED gate.
  const c = classify(fixture);
  const labels = [c.verdict, c.state === 'red' ? 'bug' : null].filter(
    (l): l is string => Boolean(l)
  );
  if (labels.length) await tracker.addLabels(issue.id, labels);

  await tracker.comment(
    issue.id,
    BOT,
    `### RED gate -> \`${stateLabel(c.state)}\`\n\n${c.reason}`
  );
  await tracker.setStateLabel(issue.id, c.state);
};
