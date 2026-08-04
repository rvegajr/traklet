/**
 * Stage 1 — EXTRACT.
 *
 * PHASE A (this file): deterministically summarize the Jam fixture into a "bug
 * context" comment — author, repro steps, failing network calls (4xx/5xx),
 * console errors, environment. Advances extracting -> authoring.
 *
 * PHASE B/C: identical contract, but the body is produced by a headless agent
 * calling the Jam MCP (getUserEvents/getNetworkRequests/getConsoleLogs/...).
 */

import type { Stage } from '../interfaces';

const BOT = 'autodev[bot]';

export const extract: Stage = async ({ tracker, issue, fixture }) => {
  const steps = fixture.userEvents
    .map((e, i) => `  ${i + 1}. \`${e.type}\` ${e.target}${e.detail ? ` — ${e.detail}` : ''}`)
    .join('\n');

  const failing = fixture.networkRequests.filter((r) => r.status >= 400);
  const failingBlock = failing.length
    ? failing.map((r) => `  - ${r.method} ${r.url} -> **${r.status}**${r.responseBody ? ` \`${r.responseBody}\`` : ''}`).join('\n')
    : '  - none (no 4xx/5xx observed)';

  const errors = fixture.consoleLogs.filter((l) => l.level === 'error');
  const errorBlock = errors.length
    ? errors.map((l) => `  - ${l.text}`).join('\n')
    : '  - none';

  const meta = Object.entries(fixture.metadata)
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ');

  const body =
    `### Extracted bug context\n\n` +
    `**Reporter:** ${fixture.author}\n` +
    `**Route:** \`${fixture.route}\` · **Suite:** \`${fixture.suite}\`\n` +
    `**Environment:** ${meta}\n\n` +
    `**Steps**\n${steps}\n\n` +
    `**Failing network calls (4xx/5xx)**\n${failingBlock}\n\n` +
    `**Console errors**\n${errorBlock}\n\n` +
    `**Reported expectation:** ${fixture.expectedBehavior}`;

  await tracker.comment(issue.id, BOT, body);
  await tracker.setStateLabel(issue.id, 'authoring');
};
