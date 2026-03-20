/**
 * Tests for TestCaseLoader - scanning, parsing, dependency resolution, sync
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  scanTestCases,
  parseTestCaseFile,
  resolveDependencies,
  injectDependencyContext,
  syncToBackend,
} from '../TestCaseLoader';
import type { ParsedTestCaseFile, SyncAdapter } from '../TestCaseLoader';

// ============================================
// Helpers
// ============================================

let tmpDir: string;

function createTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'traklet-test-'));
  fs.mkdirSync(path.join(dir, '.traklet', 'test-cases'), { recursive: true });
  return dir;
}

function writeTestCase(dir: string, relativePath: string, content: string): string {
  const fullPath = path.join(dir, '.traklet', 'test-cases', relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  return fullPath;
}

function makeTc(id: string, title: string, depends?: string[], suite?: string): string {
  const depLine = depends ? `\ndepends: [${depends.join(', ')}]` : '';
  const suiteLine = suite ? `\nsuite: ${suite}` : '';
  return [
    '---',
    `id: ${id}`,
    `title: "${title}"`,
    `priority: medium`,
    `labels: [test-case]${depLine}${suiteLine}`,
    '---',
    '',
    '{traklet:test-case}',
    '',
    '{traklet:section:objective}',
    '## Objective',
    title,
    '{/traklet:section:objective}',
    '',
    '{traklet:section:steps}',
    '## Steps',
    '1. Do the thing',
    '{/traklet:section:steps}',
    '',
    '{traklet:section:expected-result}',
    '## Expected Result',
    'It works.',
    '{/traklet:section:expected-result}',
    '',
    '{traklet:section:actual-result}',
    '## Actual Result',
    '_Not yet tested._',
    '{/traklet:section:actual-result}',
  ].join('\n');
}

function createMockAdapter(): SyncAdapter & { calls: Array<{ projectId: string; dto: unknown }> } {
  let counter = 0;
  const calls: Array<{ projectId: string; dto: unknown }> = [];
  return {
    calls,
    async createIssue(projectId: string, dto: unknown) {
      counter++;
      calls.push({ projectId, dto });
      return { id: String(counter), number: counter };
    },
    async issueExists(_projectId: string, _issueId: string) {
      return false;
    },
  };
}

// ============================================
// Tests
// ============================================

describe('TestCaseLoader', () => {
  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('scanTestCases', () => {
    it('should find markdown files in .traklet/test-cases/', async () => {
      writeTestCase(tmpDir, 'TC-001.md', makeTc('TC-001', 'First test'));
      writeTestCase(tmpDir, 'TC-002.md', makeTc('TC-002', 'Second test'));

      const results = await scanTestCases({ rootDir: tmpDir });
      expect(results).toHaveLength(2);
      expect(results[0]!.meta.id).toBe('TC-001');
      expect(results[1]!.meta.id).toBe('TC-002');
    });

    it('should find files in nested subdirectories', async () => {
      writeTestCase(tmpDir, 'auth/TC-001.md', makeTc('TC-001', 'Login'));
      writeTestCase(tmpDir, 'export/TC-020.md', makeTc('TC-020', 'Export'));

      const results = await scanTestCases({ rootDir: tmpDir });
      expect(results).toHaveLength(2);
    });

    it('should return empty array when no .traklet/ folder', async () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'traklet-empty-'));
      const results = await scanTestCases({ rootDir: emptyDir });
      expect(results).toHaveLength(0);
      fs.rmSync(emptyDir, { recursive: true });
    });

    it('should skip files without required frontmatter', async () => {
      writeTestCase(tmpDir, 'bad.md', '---\ntitle: "No ID"\n---\nBody');
      writeTestCase(tmpDir, 'good.md', makeTc('TC-001', 'Good'));

      const results = await scanTestCases({ rootDir: tmpDir });
      expect(results).toHaveLength(1);
      expect(results[0]!.meta.id).toBe('TC-001');
    });
  });

  describe('parseTestCaseFile', () => {
    it('should parse frontmatter fields correctly', () => {
      const content = [
        '---',
        'id: TC-042',
        'title: "Test with all fields"',
        'priority: high',
        'labels: [auth, smoke]',
        'assignee: tester@sji.com',
        'depends: [TC-001, TC-002]',
        'suite: auth',
        '---',
        'Body content here.',
      ].join('\n');

      const filePath = writeTestCase(tmpDir, 'full.md', content);
      const result = parseTestCaseFile(filePath, tmpDir);

      expect(result).not.toBeNull();
      expect(result!.meta.id).toBe('TC-042');
      expect(result!.meta.title).toBe('Test with all fields');
      expect(result!.meta.priority).toBe('high');
      expect(result!.meta.labels).toEqual(['auth', 'smoke']);
      expect(result!.meta.assignee).toBe('tester@sji.com');
      expect(result!.meta.depends).toEqual(['TC-001', 'TC-002']);
      expect(result!.meta.suite).toBe('auth');
      expect(result!.body).toBe('Body content here.');
    });

    it('should return null for missing id', () => {
      const filePath = writeTestCase(tmpDir, 'no-id.md', '---\ntitle: "No ID"\n---\nBody');
      expect(parseTestCaseFile(filePath, tmpDir)).toBeNull();
    });

    it('should validate priority values', () => {
      const filePath = writeTestCase(tmpDir, 'bad-priority.md',
        '---\nid: X\ntitle: "X"\npriority: banana\n---\nBody');
      const result = parseTestCaseFile(filePath, tmpDir);
      expect(result!.meta.priority).toBeUndefined();
    });
  });

  describe('resolveDependencies', () => {
    function makeParsed(id: string, depends?: string[]): ParsedTestCaseFile {
      return {
        filePath: `/fake/${id}.md`,
        relativePath: `${id}.md`,
        meta: { id, title: `Test ${id}`, depends },
        body: 'body',
        rawContent: `---\nid: ${id}\ntitle: "Test ${id}"\n---\nbody`,
      };
    }

    it('should order independent test cases at depth 0', () => {
      const tcs = [makeParsed('A'), makeParsed('B'), makeParsed('C')];
      const { ordered, warnings } = resolveDependencies(tcs);

      expect(ordered).toHaveLength(3);
      expect(ordered.every((n) => n.depth === 0)).toBe(true);
      expect(warnings).toHaveLength(0);
    });

    it('should order dependencies before dependents', () => {
      const tcs = [
        makeParsed('C', ['B']),
        makeParsed('B', ['A']),
        makeParsed('A'),
      ];
      const { ordered } = resolveDependencies(tcs);

      expect(ordered[0]!.testCase.meta.id).toBe('A');
      expect(ordered[1]!.testCase.meta.id).toBe('B');
      expect(ordered[2]!.testCase.meta.id).toBe('C');
      expect(ordered[0]!.depth).toBe(0);
      expect(ordered[1]!.depth).toBe(1);
      expect(ordered[2]!.depth).toBe(2);
    });

    it('should handle diamond dependencies', () => {
      //   A
      //  / \
      // B   C
      //  \ /
      //   D
      const tcs = [
        makeParsed('D', ['B', 'C']),
        makeParsed('B', ['A']),
        makeParsed('C', ['A']),
        makeParsed('A'),
      ];
      const { ordered } = resolveDependencies(tcs);

      const aIdx = ordered.findIndex((n) => n.testCase.meta.id === 'A');
      const bIdx = ordered.findIndex((n) => n.testCase.meta.id === 'B');
      const cIdx = ordered.findIndex((n) => n.testCase.meta.id === 'C');
      const dIdx = ordered.findIndex((n) => n.testCase.meta.id === 'D');

      expect(aIdx).toBeLessThan(bIdx);
      expect(aIdx).toBeLessThan(cIdx);
      expect(bIdx).toBeLessThan(dIdx);
      expect(cIdx).toBeLessThan(dIdx);
    });

    it('should detect circular dependencies', () => {
      const tcs = [
        makeParsed('A', ['C']),
        makeParsed('B', ['A']),
        makeParsed('C', ['B']),
      ];
      const { warnings } = resolveDependencies(tcs);

      expect(warnings.some((w) => w.includes('Circular dependency'))).toBe(true);
    });

    it('should warn on missing dependencies', () => {
      const tcs = [makeParsed('A', ['NONEXISTENT'])];
      const { warnings } = resolveDependencies(tcs);

      expect(warnings.some((w) => w.includes('does not exist'))).toBe(true);
    });

    it('should warn on duplicate IDs', () => {
      const tcs = [makeParsed('A'), makeParsed('A')];
      const { warnings } = resolveDependencies(tcs);

      expect(warnings.some((w) => w.includes('Duplicate'))).toBe(true);
    });

    it('should populate dependedBy (reverse edges)', () => {
      const tcs = [makeParsed('B', ['A']), makeParsed('A')];
      const { ordered } = resolveDependencies(tcs);

      const nodeA = ordered.find((n) => n.testCase.meta.id === 'A')!;
      expect(nodeA.dependedBy).toContain('B');
    });

    it('should handle hundreds of test cases', () => {
      // Create a chain: TC-000 -> TC-001 -> ... -> TC-099
      const tcs: ParsedTestCaseFile[] = [];
      for (let i = 0; i < 100; i++) {
        const id = `TC-${String(i).padStart(3, '0')}`;
        const depends = i > 0 ? [`TC-${String(i - 1).padStart(3, '0')}`] : undefined;
        tcs.push(makeParsed(id, depends));
      }

      const { ordered, warnings } = resolveDependencies(tcs);
      expect(ordered).toHaveLength(100);
      expect(warnings).toHaveLength(0);
      expect(ordered[0]!.testCase.meta.id).toBe('TC-000');
      expect(ordered[99]!.testCase.meta.id).toBe('TC-099');
      expect(ordered[99]!.depth).toBe(99);
    });
  });

  describe('injectDependencyContext', () => {
    it('should add prerequisite note to body', () => {
      const body = '{traklet:section:steps}\n## Steps\n1. Do it\n{/traklet:section:steps}';
      const node = {
        testCase: { meta: { id: 'TC-002' } } as ParsedTestCaseFile,
        dependsOn: ['TC-001'],
        dependedBy: [],
        depth: 1,
      };
      const allNodes = new Map([
        ['TC-001', {
          testCase: { meta: { id: 'TC-001', title: 'Login test' } } as ParsedTestCaseFile,
          dependsOn: [], dependedBy: ['TC-002'], depth: 0,
        }],
      ]);

      const result = injectDependencyContext(body, node, allNodes);
      expect(result).toContain('Prerequisite test cases');
      expect(result).toContain('TC-001');
      expect(result).toContain('Login test');
    });

    it('should return unchanged body when no dependencies', () => {
      const body = 'some body';
      const node = { testCase: {} as ParsedTestCaseFile, dependsOn: [], dependedBy: [], depth: 0 };

      expect(injectDependencyContext(body, node, new Map())).toBe(body);
    });
  });

  describe('syncToBackend', () => {
    it('should create work items in dependency order', async () => {
      writeTestCase(tmpDir, 'B.md', makeTc('B', 'Second', ['A']));
      writeTestCase(tmpDir, 'A.md', makeTc('A', 'First'));

      const testCases = await scanTestCases({ rootDir: tmpDir });
      const adapter = createMockAdapter();

      const result = await syncToBackend(testCases, adapter, 'project-1');

      expect(result.synced).toBe(2);
      expect(result.failed).toBe(0);
      // A should be created before B
      expect(adapter.calls[0]!.dto).toHaveProperty('title', 'A: First');
      expect(adapter.calls[1]!.dto).toHaveProperty('title', 'B: Second');
    });

    it('should skip already-synced test cases', async () => {
      const content = [
        '---',
        'id: TC-001',
        'title: "Already synced"',
        'backend-id: "42"',
        '---',
        'Body',
      ].join('\n');
      writeTestCase(tmpDir, 'synced.md', content);

      const testCases = await scanTestCases({ rootDir: tmpDir });
      const adapter = createMockAdapter();
      // Mock issueExists to return true
      adapter.issueExists = async () => true;

      const result = await syncToBackend(testCases, adapter, 'project-1');

      expect(result.skipped).toBe(1);
      expect(result.synced).toBe(0);
      expect(adapter.calls).toHaveLength(0);
    });

    it('should force re-sync when force=true', async () => {
      const content = [
        '---',
        'id: TC-001',
        'title: "Force sync"',
        'backend-id: "42"',
        '---',
        'Body',
      ].join('\n');
      writeTestCase(tmpDir, 'force.md', content);

      const testCases = await scanTestCases({ rootDir: tmpDir });
      const adapter = createMockAdapter();

      const result = await syncToBackend(testCases, adapter, 'project-1', { force: true });

      expect(result.synced).toBe(1);
    });

    it('should add test-case label automatically', async () => {
      writeTestCase(tmpDir, 'tc.md', makeTc('TC-001', 'Test'));
      const testCases = await scanTestCases({ rootDir: tmpDir });
      const adapter = createMockAdapter();

      await syncToBackend(testCases, adapter, 'project-1');

      const dto = adapter.calls[0]!.dto as { labels: string[] };
      expect(dto.labels).toContain('test-case');
    });

    it('should add has-prerequisites label for dependent tests', async () => {
      writeTestCase(tmpDir, 'A.md', makeTc('A', 'First'));
      writeTestCase(tmpDir, 'B.md', makeTc('B', 'Second', ['A']));

      const testCases = await scanTestCases({ rootDir: tmpDir });
      const adapter = createMockAdapter();

      await syncToBackend(testCases, adapter, 'project-1');

      const dtoB = adapter.calls[1]!.dto as { labels: string[] };
      expect(dtoB.labels).toContain('has-prerequisites');
    });

    it('should write backend-id back to frontmatter', async () => {
      const filePath = writeTestCase(tmpDir, 'writeback.md', makeTc('TC-001', 'Writeback'));

      const testCases = await scanTestCases({ rootDir: tmpDir });
      const adapter = createMockAdapter();

      await syncToBackend(testCases, adapter, 'project-1');

      // Read the file back
      const updated = fs.readFileSync(filePath, 'utf-8');
      expect(updated).toContain('backend-id');
      expect(updated).toContain('last-synced');
    });

    it('should handle dry run without creating', async () => {
      writeTestCase(tmpDir, 'dry.md', makeTc('TC-001', 'Dry run'));

      const testCases = await scanTestCases({ rootDir: tmpDir });
      const adapter = createMockAdapter();

      const result = await syncToBackend(testCases, adapter, 'project-1', { dryRun: true });

      expect(result.synced).toBe(1);
      expect(adapter.calls).toHaveLength(0); // No actual API calls
    });
  });
});
