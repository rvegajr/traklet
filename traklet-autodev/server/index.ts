/**
 * server/index.ts — the local control plane.
 *
 * Wires LocalTracker + MockJamSource + PipelineOrchestrator together and exposes
 * a tiny HTTP API + Server-Sent Events stream for the Lit dashboard. This file
 * plays the role the GitHub Actions runner + webhook relay play in production:
 * it receives "record a Jam", drives the label state machine, and surfaces the
 * two human gates (triage, merge) as endpoints.
 *
 * Run with:  vite-node traklet-autodev/server/index.ts   (no build step)
 */

import { createServer, type ServerResponse, type IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { LocalTracker } from '../pipeline/tracker/LocalTracker';
import { MockJamSource } from '../pipeline/jam/MockJamSource';
import { PipelineOrchestrator } from '../pipeline/orchestrator';
import { CONTROL, VERDICT } from '../pipeline/labels';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = Number(process.env.AUTODEV_PORT ?? 8787);
const BOT = 'autodev[bot]';

const tracker = new LocalTracker(join(ROOT, '.state', 'tracker.json'));
const jam = new MockJamSource(join(ROOT, 'fixtures', 'jams'));
const orchestrator = new PipelineOrchestrator(tracker, jam, {
  stepDelayMs: Number(process.env.AUTODEV_STEP_MS ?? 700),
  log: (m) => console.log(`[orchestrator] ${m}`),
});
orchestrator.start();

// -- SSE fan-out ------------------------------------------------------------

const clients = new Set<ServerResponse>();
tracker.on((event) => {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(payload);
});

// -- helpers ----------------------------------------------------------------

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(json);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// -- routing ----------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') return send(res, 204, {});

  try {
    // SSE stream
    if (path === '/api/events' && method === 'GET') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'access-control-allow-origin': '*',
      });
      res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
      clients.add(res);
      const beat = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => {
        clearInterval(beat);
        clients.delete(res);
      });
      return;
    }

    if (path === '/api/fixtures' && method === 'GET') {
      const fixtures = await jam.list();
      return send(
        res,
        200,
        fixtures.map((f) => ({
          id: f.id,
          title: f.title,
          author: f.author,
          category: f.category,
          route: f.route,
        }))
      );
    }

    if (path === '/api/issues' && method === 'GET') {
      return send(res, 200, await tracker.listIssues());
    }

    const detailMatch = path.match(/^\/api\/issues\/([^/]+)$/);
    if (detailMatch && method === 'GET') {
      const issue = await tracker.getIssue(detailMatch[1]);
      return issue ? send(res, 200, issue) : send(res, 404, { error: 'not found' });
    }

    // Ingest — "record a Jam" (Stage 0)
    if (path === '/api/record' && method === 'POST') {
      const body = await readBody(req);
      const jamId = String(body.jamId ?? '');
      const fixture = await jam.get(jamId);
      if (!fixture) return send(res, 400, { error: `unknown jam: ${jamId}` });
      const short = fixture.id.slice(-8);
      const existing = await tracker.findByJamId(short);
      if (existing) return send(res, 200, { issue: existing, deduped: true });
      const issue = await tracker.createIssueFromJam(fixture);
      return send(res, 201, { issue, deduped: false });
    }

    // Human gate helper — "Start Work" (mirrors the Traklet widget button)
    const startMatch = path.match(/^\/api\/issues\/([^/]+)\/start-work$/);
    if (startMatch && method === 'POST') {
      await tracker.addLabels(startMatch[1], [CONTROL.approveFix]);
      return send(res, 200, await tracker.getIssue(startMatch[1]));
    }

    // Human gate 1 — triage a GREEN result
    const triageMatch = path.match(/^\/api\/issues\/([^/]+)\/triage$/);
    if (triageMatch && method === 'POST') {
      const id = triageMatch[1];
      const body = await readBody(req);
      const verdict = String(body.verdict ?? '');
      if (verdict === 'wad') {
        await tracker.addLabels(id, [VERDICT.worksAsDesigned, 'wontfix']);
        await tracker.comment(id, BOT, 'Human triage: **works-as-designed**. No production code touched.');
        await tracker.setStateLabel(id, 'wont-fix');
        await tracker.closeIssue(id);
      } else if (verdict === 'bug') {
        // Human overrides the classifier: this IS a bug. Move to the RED gate so
        // the (still-gated) fix path can proceed once a human approves.
        await tracker.addLabels(id, [VERDICT.bug, 'bug']);
        await tracker.removeLabels(id, [VERDICT.worksAsDesigned]);
        await tracker.comment(id, BOT, 'Human triage: **confirmed bug**. Advancing to RED; awaiting fix approval.');
        await tracker.setStateLabel(id, 'red');
      } else {
        return send(res, 400, { error: 'verdict must be "bug" or "wad"' });
      }
      return send(res, 200, await tracker.getIssue(id));
    }

    // Human gate 2 — merge the PR
    const mergeMatch = path.match(/^\/api\/issues\/([^/]+)\/merge$/);
    if (mergeMatch && method === 'POST') {
      await tracker.mergePR(mergeMatch[1]);
      return send(res, 200, await tracker.getIssue(mergeMatch[1]));
    }

    // Dev convenience — wipe all state
    if (path === '/api/reset' && method === 'POST') {
      const count = (await tracker.listIssues()).length;
      await tracker.reset();
      return send(res, 200, { cleared: count });
    }

    return send(res, 404, { error: `no route: ${method} ${path}` });
  } catch (err) {
    return send(res, 500, { error: String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`[autodev] control plane on http://localhost:${PORT}`);
  console.log(`[autodev] fixtures: ${join(ROOT, 'fixtures', 'jams')}`);
});
