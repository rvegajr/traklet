/**
 * TestCaseLoader - Scans .traklet/ folder, parses markdown test cases,
 * resolves dependency graphs, and seeds them to any backend adapter.
 *
 * Handles thousands of test cases efficiently through:
 * - Streaming file reads (no full directory in memory)
 * - Topological sort for dependency ordering
 * - Batch API calls (configurable concurrency)
 * - Idempotent sync (backend-id in frontmatter prevents duplicates)
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { glob } from 'glob';
import type { CreateIssueDTO, IssuePriority } from '@/models';

// ============================================
// Types
// ============================================

export interface TestCaseFrontmatter {
  /** Unique test case ID (e.g., TC-001) */
  id: string;
  /** Test case title */
  title: string;
  /** Priority level */
  priority?: IssuePriority | undefined;
  /** Labels/tags to apply */
  labels?: string[] | undefined;
  /** Assignee email or username */
  assignee?: string | undefined;
  /** IDs of test cases that must pass before this one is relevant */
  depends?: string[] | undefined;
  /** Group/suite name for organization */
  suite?: string | undefined;
  /** Backend work item ID (auto-populated after first sync) */
  'backend-id'?: string | undefined;
  /** ISO timestamp of last sync */
  'last-synced'?: string | undefined;
}

export interface ParsedTestCaseFile {
  /** Absolute file path */
  filePath: string;
  /** Relative path from .traklet/ root */
  relativePath: string;
  /** Parsed frontmatter */
  meta: TestCaseFrontmatter;
  /** Full markdown body (without frontmatter) */
  body: string;
  /** Raw file content (for writing back backend-id) */
  rawContent: string;
}

export interface DependencyNode {
  /** The test case */
  testCase: ParsedTestCaseFile;
  /** IDs this test case depends on */
  dependsOn: string[];
  /** IDs that depend on this test case */
  dependedBy: string[];
  /** Depth in dependency tree (0 = no dependencies) */
  depth: number;
}

export interface SyncResult {
  /** Total files scanned */
  scanned: number;
  /** Successfully synced (created or already existed) */
  synced: number;
  /** Skipped (already has backend-id) */
  skipped: number;
  /** Failed to sync */
  failed: number;
  /** Details per file */
  details: SyncDetail[];
  /** Dependency warnings */
  warnings: string[];
}

export interface SyncDetail {
  id: string;
  title: string;
  filePath: string;
  action: 'created' | 'skipped' | 'failed';
  backendId?: string;
  error?: string;
}

export interface LoaderOptions {
  /** Root directory to scan (default: process.cwd()) */
  rootDir?: string;
  /** .traklet subfolder for test cases (default: test-cases) */
  testCasesDir?: string;
  /** Force re-sync even if backend-id exists */
  force?: boolean;
  /** Dry run - parse and validate without syncing */
  dryRun?: boolean;
  /** Max concurrent API calls (default: 5) */
  concurrency?: number;
}

// ============================================
// Scanner
// ============================================

/**
 * Scan the .traklet/ folder and return all parsed test case files.
 */
export async function scanTestCases(options: LoaderOptions = {}): Promise<ParsedTestCaseFile[]> {
  const rootDir = options.rootDir ?? process.cwd();
  const testCasesDir = options.testCasesDir ?? 'test-cases';
  const trakletDir = path.join(rootDir, '.traklet', testCasesDir);

  if (!fs.existsSync(trakletDir)) {
    return [];
  }

  const pattern = path.join(trakletDir, '**/*.md');
  const files = await glob(pattern, { nodir: true });

  const testCases: ParsedTestCaseFile[] = [];

  for (const filePath of files.sort()) {
    const parsed = parseTestCaseFile(filePath, rootDir);
    if (parsed) {
      testCases.push(parsed);
    }
  }

  return testCases;
}

/**
 * Parse a single markdown test case file.
 */
export function parseTestCaseFile(
  filePath: string,
  rootDir: string
): ParsedTestCaseFile | null {
  const rawContent = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(rawContent);

  // Validate required frontmatter (bracket access for index-signature type)
  const id = data['id'];
  const title = data['title'];
  if (!id || !title) {
    return null;
  }

  const labels = data['labels'];
  const depends = data['depends'];

  const meta: TestCaseFrontmatter = {
    id: String(id),
    title: String(title),
    priority: validatePriority(data['priority']),
    labels: Array.isArray(labels) ? labels.map(String) : undefined,
    assignee: data['assignee'] ? String(data['assignee']) : undefined,
    depends: Array.isArray(depends) ? depends.map(String) : undefined,
    suite: data['suite'] ? String(data['suite']) : undefined,
    'backend-id': data['backend-id'] ? String(data['backend-id']) : undefined,
    'last-synced': data['last-synced'] ? String(data['last-synced']) : undefined,
  };

  const trakletRoot = path.join(rootDir, '.traklet');
  const relativePath = path.relative(trakletRoot, filePath);

  return {
    filePath,
    relativePath,
    meta,
    body: content.trim(),
    rawContent,
  };
}

// ============================================
// Dependency Resolution
// ============================================

/**
 * Build a dependency graph from parsed test cases.
 * Returns nodes in topological order (dependencies first).
 * Detects cycles and missing dependencies.
 */
export function resolveDependencies(
  testCases: ParsedTestCaseFile[]
): { ordered: DependencyNode[]; warnings: string[] } {
  const warnings: string[] = [];
  const byId = new Map<string, ParsedTestCaseFile>();
  const nodes = new Map<string, DependencyNode>();

  // Index by ID
  for (const tc of testCases) {
    if (byId.has(tc.meta.id)) {
      warnings.push(`Duplicate test case ID: ${tc.meta.id} (${tc.relativePath} and ${byId.get(tc.meta.id)!.relativePath})`);
    }
    byId.set(tc.meta.id, tc);
  }

  // Build nodes
  for (const tc of testCases) {
    const dependsOn = tc.meta.depends ?? [];
    const node: DependencyNode = {
      testCase: tc,
      dependsOn,
      dependedBy: [],
      depth: 0,
    };

    // Validate dependencies exist
    for (const depId of dependsOn) {
      if (!byId.has(depId)) {
        warnings.push(`${tc.meta.id}: depends on '${depId}' which does not exist`);
      }
    }

    nodes.set(tc.meta.id, node);
  }

  // Build reverse edges (dependedBy)
  for (const [id, node] of nodes) {
    for (const depId of node.dependsOn) {
      const depNode = nodes.get(depId);
      if (depNode) {
        depNode.dependedBy.push(id);
      }
    }
  }

  // Topological sort (Kahn's algorithm) with cycle detection
  const inDegree = new Map<string, number>();
  for (const [id, node] of nodes) {
    // Only count dependencies that actually exist in our set
    const validDeps = node.dependsOn.filter((d) => nodes.has(d));
    inDegree.set(id, validDeps.length);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const ordered: DependencyNode[] = [];
  let depth = 0;

  while (queue.length > 0) {
    const levelSize = queue.length;
    const nextQueue: string[] = [];

    for (let i = 0; i < levelSize; i++) {
      const id = queue[i]!;
      const node = nodes.get(id)!;
      node.depth = depth;
      ordered.push(node);

      for (const dependentId of node.dependedBy) {
        const deg = (inDegree.get(dependentId) ?? 1) - 1;
        inDegree.set(dependentId, deg);
        if (deg === 0) {
          nextQueue.push(dependentId);
        }
      }
    }

    queue.length = 0;
    queue.push(...nextQueue);
    depth++;
  }

  // Detect cycles
  if (ordered.length < nodes.size) {
    const inCycle = new Set<string>();
    for (const [id] of nodes) {
      if (!ordered.some((n) => n.testCase.meta.id === id)) {
        inCycle.add(id);
      }
    }
    warnings.push(
      `Circular dependency detected involving: ${Array.from(inCycle).join(', ')}`
    );
    // Add remaining nodes at the end (break cycles)
    for (const id of inCycle) {
      const node = nodes.get(id)!;
      node.depth = depth;
      ordered.push(node);
    }
  }

  return { ordered, warnings };
}

/**
 * Inject dependency context into a test case body.
 * Adds a prerequisites note listing dependent test cases and their status.
 */
export function injectDependencyContext(
  body: string,
  node: DependencyNode,
  allNodes: Map<string, DependencyNode>
): string {
  if (node.dependsOn.length === 0) return body;

  const depLines: string[] = [];
  for (const depId of node.dependsOn) {
    const depNode = allNodes.get(depId);
    if (depNode) {
      depLines.push(`- **${depId}**: ${depNode.testCase.meta.title}`);
    } else {
      depLines.push(`- **${depId}**: _(not found)_`);
    }
  }

  const depNote = [
    '',
    '> **Prerequisite test cases** (must be verified before this test):',
    ...depLines.map((l) => `> ${l}`),
    '',
  ].join('\n');

  // Insert after the prerequisites section if it exists, otherwise at the top
  if (body.includes('{traklet:section:prerequisites}')) {
    return body.replace(
      '{/traklet:section:prerequisites}',
      depNote + '\n{/traklet:section:prerequisites}'
    );
  }

  // Insert before the first section
  const firstSection = body.indexOf('{traklet:section:');
  if (firstSection > 0) {
    return body.slice(0, firstSection) + depNote + '\n' + body.slice(firstSection);
  }

  return depNote + '\n' + body;
}

// ============================================
// Sync Engine
// ============================================

export interface SyncAdapter {
  createIssue(projectId: string, dto: CreateIssueDTO): Promise<{ id: string; number: number }>;
  issueExists(projectId: string, issueId: string): Promise<boolean>;
}

/**
 * Sync parsed test cases to a backend adapter.
 * Creates work items in dependency order.
 * Writes backend-id back to frontmatter after successful creation.
 */
export async function syncToBackend(
  testCases: ParsedTestCaseFile[],
  adapter: SyncAdapter,
  projectId: string,
  options: LoaderOptions = {}
): Promise<SyncResult> {
  const force = options.force ?? false;
  const dryRun = options.dryRun ?? false;
  const concurrency = options.concurrency ?? 5;

  // Resolve dependency order
  const { ordered, warnings } = resolveDependencies(testCases);
  const nodeMap = new Map(ordered.map((n) => [n.testCase.meta.id, n]));

  const result: SyncResult = {
    scanned: testCases.length,
    synced: 0,
    skipped: 0,
    failed: 0,
    details: [],
    warnings,
  };

  // Group by depth for parallel execution within each level
  const byDepth = new Map<number, DependencyNode[]>();
  for (const node of ordered) {
    const level = byDepth.get(node.depth) ?? [];
    level.push(node);
    byDepth.set(node.depth, level);
  }

  // Process each depth level (dependencies first)
  const maxDepth = Math.max(...Array.from(byDepth.keys()), 0);
  for (let d = 0; d <= maxDepth; d++) {
    const level = byDepth.get(d) ?? [];

    // Process in batches of `concurrency`
    for (let i = 0; i < level.length; i += concurrency) {
      const batch = level.slice(i, i + concurrency);
      const promises = batch.map((node) =>
        syncSingleTestCase(node, adapter, projectId, nodeMap, force, dryRun)
      );
      const batchResults = await Promise.all(promises);

      for (const detail of batchResults) {
        result.details.push(detail);
        switch (detail.action) {
          case 'created':
            result.synced++;
            break;
          case 'skipped':
            result.skipped++;
            break;
          case 'failed':
            result.failed++;
            break;
        }
      }
    }
  }

  return result;
}

async function syncSingleTestCase(
  node: DependencyNode,
  adapter: SyncAdapter,
  projectId: string,
  allNodes: Map<string, DependencyNode>,
  force: boolean,
  dryRun: boolean
): Promise<SyncDetail> {
  const tc = node.testCase;
  const detail: SyncDetail = {
    id: tc.meta.id,
    title: tc.meta.title,
    filePath: tc.relativePath,
    action: 'skipped',
  };

  // Skip if already synced (unless force)
  if (tc.meta['backend-id'] && !force) {
    // Verify it still exists
    try {
      const exists = await adapter.issueExists(projectId, tc.meta['backend-id']);
      if (exists) {
        detail.backendId = tc.meta['backend-id'];
        return detail;
      }
      // Backend item was deleted — re-create
    } catch {
      // Can't verify — skip to be safe
      detail.backendId = tc.meta['backend-id'];
      return detail;
    }
  }

  if (dryRun) {
    detail.action = 'created';
    detail.backendId = '(dry-run)';
    return detail;
  }

  try {
    // Inject dependency context into body
    const body = injectDependencyContext(tc.body, node, allNodes);

    // Build labels: include suite name, configured labels, and 'test-case'
    const labels = new Set<string>(tc.meta.labels ?? []);
    labels.add('test-case');
    if (tc.meta.suite) {
      labels.add(`suite:${tc.meta.suite}`);
    }
    // Add dependency labels for filtering
    if (node.dependsOn.length > 0) {
      labels.add('has-prerequisites');
    }
    if (node.dependedBy.length > 0) {
      labels.add('is-prerequisite');
    }

    const dto: CreateIssueDTO = {
      title: `${tc.meta.id}: ${tc.meta.title}`,
      body,
      labels: Array.from(labels),
      priority: tc.meta.priority,
      assignees: tc.meta.assignee ? [tc.meta.assignee] : undefined,
    };

    const created = await adapter.createIssue(projectId, dto);
    detail.action = 'created';
    detail.backendId = created.id;

    // Write backend-id back to the frontmatter
    writeBackendId(tc.filePath, tc.rawContent, created.id);

    return detail;
  } catch (error) {
    detail.action = 'failed';
    detail.error = error instanceof Error ? error.message : String(error);
    return detail;
  }
}

/**
 * Write backend-id and last-synced back into the file's frontmatter.
 */
function writeBackendId(filePath: string, rawContent: string, backendId: string): void {
  const { data, content } = matter(rawContent);
  data['backend-id'] = backendId;
  data['last-synced'] = new Date().toISOString();
  const updated = matter.stringify(content, data);
  fs.writeFileSync(filePath, updated, 'utf-8');
}

// ============================================
// Helpers
// ============================================

function validatePriority(value: unknown): IssuePriority | undefined {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
    return value;
  }
  return undefined;
}
