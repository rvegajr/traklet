/**
 * MockJamSource — an IJamSource backed by JSON fixtures on disk.
 *
 * Local stand-in for the Jam MCP. Reads traklet-autodev/fixtures/jams/*.json so
 * the EXTRACT and AUTHOR stages run deterministically with no Jam account. The
 * real pipeline swaps this for the Jam MCP tools (getUserEvents,
 * getNetworkRequests, getConsoleLogs, getMetadata, analyzeVideo).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IJamSource, JamFixture } from '../interfaces';

export class MockJamSource implements IJamSource {
  constructor(private readonly fixturesDir: string) {}

  async list(): Promise<JamFixture[]> {
    return readdirSync(this.fixturesDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => this.read(join(this.fixturesDir, f)));
  }

  async get(id: string): Promise<JamFixture | null> {
    const all = await this.list();
    return all.find((j) => j.id === id) ?? null;
  }

  private read(path: string): JamFixture {
    return JSON.parse(readFileSync(path, 'utf8')) as JamFixture;
  }
}
