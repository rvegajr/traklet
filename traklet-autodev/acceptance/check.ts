/**
 * acceptance/check.ts — the pipeline's own regression suite.
 *
 * Runs every fixture in the golden corpus through the real state machine
 * headlessly and asserts:
 *   - it RESTS at the expected gate (held-out oracle `expected.restsAt`)
 *   - it reaches the expected terminal state after the right human action
 *   - the branch + safety invariants hold:
 *       INV-1  every pipeline PR bases onto `uat` (never develop/main)
 *       INV-2  verify runs against a UAT/preview env, never prod
 *       INV-3  the fix diff stays in app/**+lib/**; never tests/ or the widget
 *       INV-4  nothing in the loop targets `main`
 *       INV-5  a non-bug NEVER enters fixing/verifying (no auto-fix of a non-bug)
 *
 * This is the gate any change to the real pipeline must keep green.
 * Run:  npm run demo:check
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { LocalTracker } from '../pipeline/tracker/LocalTracker';
import { MockJamSource } from '../pipeline/jam/MockJamSource';
import { PipelineOrchestrator } from '../pipeline/orchestrator';
import { readState, CONTROL, VERDICT } from '../pipeline/labels';
import type { Issue, JamFixture } from '../pipeline/interfaces';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const tracker = new LocalTracker(join(ROOT, '.state', 'acceptance.json'));
const jam = new MockJamSource(join(ROOT, 'fixtures', 'jams'));
const orchestrator = new PipelineOrchestrator(tracker, jam, { stepDelayMs: 0 });

// Record each issue's state history so we can assert what it did (and didn't) do.
const history = new Map<string, string[]>();
tracker.on(async (e) => {
  const issue = await tracker.getIssue(e.issueId);
  if (!issue) return;
  const s = readState(issue.labels);
  if (!s) return;
  const arr = history.get(e.issueId) ?? [];
  if (arr[arr.length - 1] !== s) arr.push(s);
  history.set(e.issueId, arr);
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitForState(issueId: string, target: string, timeoutMs = 4000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const issue = await tracker.getIssue(issueId);
    if (issue && readState(issue.labels) === target) return true;
    await sleep(20);
  }
  return false;
}

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

function inv(name: string, ok: boolean, detail?: string): Check {
  return { name, ok, detail };
}

async function runFixture(fixture: JamFixture): Promise<{ fixture: JamFixture; checks: Check[] }> {
  const issue = await tracker.createIssueFromJam(fixture);
  const id = issue.id;
  const checks: Check[] = [];

  // 1. Auto stages must come to rest at the expected gate.
  const rested = await waitForState(id, fixture.expected.restsAt);
  const atRest = await tracker.getIssue(id);
  checks.push(
    inv(
      `rests at ${fixture.expected.restsAt}`,
      rested,
      rested ? undefined : `got ${atRest ? readState(atRest.labels) : 'none'}`
    )
  );

  // 2. Perform the human action, then expect the terminal state.
  if (rested) {
    if (fixture.expected.humanAction === 'approve-fix-then-merge') {
      await tracker.addLabels(id, [CONTROL.approveFix]);
      await waitForState(id, 'ready-for-review');
      await tracker.mergePR(id);
    } else if (fixture.expected.humanAction === 'triage-wad') {
      await tracker.addLabels(id, [VERDICT.worksAsDesigned, 'wontfix']);
      await tracker.setStateLabel(id, 'wont-fix');
      await tracker.closeIssue(id);
    }
  }
  const reachedTerminal = await waitForState(id, fixture.expected.terminal);
  const fin = (await tracker.getIssue(id)) as Issue;
  checks.push(
    inv(
      `reaches ${fixture.expected.terminal}`,
      reachedTerminal,
      reachedTerminal ? undefined : `got ${readState(fin.labels)}`
    )
  );

  // 3. Invariants.
  const seen = history.get(id) ?? [];
  if (fin.prNumber !== null) {
    checks.push(inv('INV-1 PR base = uat', fin.prBase === 'uat', `base=${fin.prBase}`));
    checks.push(inv('INV-4 no main target', fin.prBase !== 'main'));
  }
  if (fin.artifacts['verify.env']) {
    checks.push(
      inv('INV-2 verify not prod', fin.artifacts['verify.env'] !== 'prod', fin.artifacts['verify.env'])
    );
  }
  if (fin.artifacts['fix.diff']) {
    const diff = fin.artifacts['fix.diff'];
    const dirty = diff.includes('tests/') || diff.includes('TrakletDevWidget') || diff.includes('.github/');
    checks.push(inv('INV-3 fix blast radius', !dirty));
  }
  if (fixture.category !== 'bug') {
    const autofixed = seen.includes('fixing') || seen.includes('verifying');
    checks.push(inv('INV-5 non-bug never auto-fixed', !autofixed, autofixed ? seen.join('->') : undefined));
  }

  return { fixture, checks };
}

async function main(): Promise<void> {
  await tracker.reset();
  history.clear();
  orchestrator.start();

  const fixtures = (await jam.list()).sort((a, b) => a.id.localeCompare(b.id));
  const results = [];
  for (const f of fixtures) results.push(await runFixture(f));

  console.log('\n  Traklet AutoDev — acceptance check\n');
  let failed = 0;
  for (const { fixture, checks } of results) {
    const bad = checks.filter((c) => !c.ok);
    const mark = bad.length ? 'FAIL' : 'PASS';
    if (bad.length) failed++;
    console.log(`  [${mark}] ${fixture.category.padEnd(18)} ${fixture.id}`);
    for (const c of checks) {
      const cm = c.ok ? 'ok  ' : 'XX  ';
      console.log(`        ${cm}${c.name}${c.detail ? `  (${c.detail})` : ''}`);
    }
  }
  const total = results.length;
  console.log(`\n  ${total - failed}/${total} fixtures passed\n`);
  process.exit(failed ? 1 : 0);
}

void main();
