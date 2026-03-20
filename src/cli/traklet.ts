#!/usr/bin/env node

/**
 * Traklet CLI
 *
 * Usage:
 *   npx traklet sync              # Sync .traklet/ test cases to backend
 *   npx traklet sync --dry-run    # Preview without creating
 *   npx traklet sync --force      # Re-sync even if already synced
 *   npx traklet scan              # List discovered test cases
 *   npx traklet validate          # Validate test cases and dependencies
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import matter from 'gray-matter';
import {
  scanTestCases,
  resolveDependencies,
  syncToBackend,
} from './TestCaseLoader';
import type { SyncAdapter, LoaderOptions } from './TestCaseLoader';

const program = new Command();

program
  .name('traklet')
  .description('Traklet CLI - Sync test cases from .traklet/ to your issue tracker')
  .version('0.1.0');

// ============================================
// traklet scan
// ============================================

program
  .command('scan')
  .description('List all test cases discovered in .traklet/')
  .option('-d, --dir <path>', 'Project root directory', process.cwd())
  .action(async (opts: { dir: string }) => {
    const testCases = await scanTestCases({ rootDir: opts.dir });

    if (testCases.length === 0) {
      console.log('No test cases found in .traklet/test-cases/');
      console.log('Create markdown files with frontmatter (id, title) to get started.');
      return;
    }

    console.log(`Found ${testCases.length} test case(s):\n`);

    const { ordered, warnings } = resolveDependencies(testCases);

    for (const node of ordered) {
      const tc = node.testCase;
      const synced = tc.meta['backend-id'] ? `[synced: #${tc.meta['backend-id']}]` : '[not synced]';
      const deps = node.dependsOn.length > 0 ? ` (depends: ${node.dependsOn.join(', ')})` : '';
      const priority = tc.meta.priority ? ` [${tc.meta.priority}]` : '';
      console.log(`  ${tc.meta.id}: ${tc.meta.title}${priority}${deps} ${synced}`);
      console.log(`    ${tc.relativePath}`);
    }

    if (warnings.length > 0) {
      console.log('\nWarnings:');
      for (const w of warnings) {
        console.log(`  ! ${w}`);
      }
    }
  });

// ============================================
// traklet validate
// ============================================

program
  .command('validate')
  .description('Validate test cases and dependency graph')
  .option('-d, --dir <path>', 'Project root directory', process.cwd())
  .action(async (opts: { dir: string }) => {
    const testCases = await scanTestCases({ rootDir: opts.dir });

    if (testCases.length === 0) {
      console.log('No test cases found.');
      return;
    }

    const { ordered, warnings } = resolveDependencies(testCases);
    const errors: string[] = [];

    // Validate each test case
    for (const node of ordered) {
      const tc = node.testCase;
      if (!tc.meta.id) errors.push(`${tc.relativePath}: missing 'id' in frontmatter`);
      if (!tc.meta.title) errors.push(`${tc.relativePath}: missing 'title' in frontmatter`);
      if (!tc.body.includes('{traklet:section:')) {
        errors.push(`${tc.relativePath}: no {traklet:section:*} markers found in body`);
      }
    }

    // Report
    console.log(`Validated ${testCases.length} test case(s):`);
    console.log(`  Dependency levels: ${new Set(ordered.map((n) => n.depth)).size}`);
    console.log(`  Max depth: ${Math.max(...ordered.map((n) => n.depth))}`);

    const withDeps = ordered.filter((n) => n.dependsOn.length > 0);
    console.log(`  With dependencies: ${withDeps.length}`);
    console.log(`  Independent: ${ordered.length - withDeps.length}`);

    if (errors.length > 0) {
      console.log(`\nErrors (${errors.length}):`);
      for (const e of errors) console.log(`  x ${e}`);
    }

    if (warnings.length > 0) {
      console.log(`\nWarnings (${warnings.length}):`);
      for (const w of warnings) console.log(`  ! ${w}`);
    }

    if (errors.length === 0 && warnings.length === 0) {
      console.log('\nAll test cases valid.');
    }

    process.exit(errors.length > 0 ? 1 : 0);
  });

// ============================================
// traklet sync
// ============================================

program
  .command('sync')
  .description('Sync test cases from .traklet/ to the backend')
  .option('-d, --dir <path>', 'Project root directory', process.cwd())
  .option('--dry-run', 'Preview without creating work items', false)
  .option('--force', 'Re-sync even if already synced', false)
  .option('--concurrency <n>', 'Max concurrent API calls', '5')
  .option('--adapter <type>', 'Backend adapter (azure-devops, localStorage)', 'azure-devops')
  .option('--project <id>', 'Project ID to sync to')
  .action(async (opts: {
    dir: string;
    dryRun: boolean;
    force: boolean;
    concurrency: string;
    adapter: string;
    project?: string;
  }) => {
    // Read config from .traklet/config.md if it exists
    const config = readTrakletConfig(opts.dir);
    const projectId = opts.project ?? config?.project;

    if (!projectId) {
      console.error('Error: --project is required (or set project in .traklet/config.md)');
      process.exit(1);
    }

    const loaderOpts: LoaderOptions = {
      rootDir: opts.dir,
      dryRun: opts.dryRun,
      force: opts.force,
      concurrency: parseInt(opts.concurrency, 10),
    };

    // Scan test cases
    const testCases = await scanTestCases(loaderOpts);

    if (testCases.length === 0) {
      console.log('No test cases found in .traklet/test-cases/');
      return;
    }

    console.log(`Found ${testCases.length} test case(s). Syncing to ${projectId}...`);
    if (opts.dryRun) console.log('(dry run - no work items will be created)\n');

    // Create adapter
    const adapter = await createAdapter(opts.adapter, config);

    // Sync
    const result = await syncToBackend(testCases, adapter, projectId, loaderOpts);

    // Report
    console.log(`\nSync complete:`);
    console.log(`  Scanned:  ${result.scanned}`);
    console.log(`  Created:  ${result.synced}`);
    console.log(`  Skipped:  ${result.skipped} (already synced)`);
    console.log(`  Failed:   ${result.failed}`);

    if (result.warnings.length > 0) {
      console.log(`\nWarnings:`);
      for (const w of result.warnings) console.log(`  ! ${w}`);
    }

    if (result.failed > 0) {
      console.log(`\nFailures:`);
      for (const d of result.details.filter((d) => d.action === 'failed')) {
        console.log(`  x ${d.id}: ${d.error}`);
      }
      process.exit(1);
    }

    if (result.synced > 0 && !opts.dryRun) {
      console.log(`\nBackend IDs written to frontmatter. Commit the changes to track sync state.`);
    }
  });

// ============================================
// Config Reader
// ============================================

interface TrakletFolderConfig {
  adapter?: string | undefined;
  baseUrl?: string | undefined;
  project?: string | undefined;
  token?: string | undefined;
  tokenEnv?: string | undefined;
}

function readTrakletConfig(rootDir: string): TrakletFolderConfig | null {
  const configPath = path.join(rootDir, '.traklet', 'config.md');
  if (!fs.existsSync(configPath)) return null;

  const raw = fs.readFileSync(configPath, 'utf-8');
  const { data } = matter(raw);

  return {
    adapter: data['adapter'] ? String(data['adapter']) : undefined,
    baseUrl: data['baseUrl'] ? String(data['baseUrl']) : undefined,
    project: data['project'] ? String(data['project']) : undefined,
    token: data['token'] ? String(data['token']) : undefined,
    tokenEnv: data['tokenEnv'] ? String(data['tokenEnv']) : undefined,
  };
}

async function createAdapter(
  adapterType: string,
  config: TrakletFolderConfig | null
): Promise<SyncAdapter> {
  if (adapterType === 'azure-devops') {
    const { AzureDevOpsAdapter } = await import('@/adapters/AzureDevOpsAdapter');
    const adapter = new AzureDevOpsAdapter();

    const baseUrl = config?.baseUrl;
    if (!baseUrl) {
      console.error('Error: baseUrl required for azure-devops adapter (set in .traklet/config.md)');
      process.exit(1);
    }

    // Get token from config, env var, or az CLI
    let token = config?.token;
    if (!token && config?.tokenEnv) {
      token = process.env[config.tokenEnv];
    }
    if (!token) {
      // Try az CLI
      try {
        const { execSync } = await import('child_process');
        token = execSync(
          'az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv',
          { encoding: 'utf-8' }
        ).trim();
      } catch {
        console.error('Error: No token available. Set token/tokenEnv in config.md or login via az CLI.');
        process.exit(1);
      }
    }

    const projectId = config?.project ?? '';
    const result = await adapter.connect({
      type: 'azure-devops',
      token,
      baseUrl,
      projects: [{ id: projectId, name: projectId, identifier: projectId }],
    });

    if (!result.success) {
      console.error(`Error: Failed to connect to Azure DevOps: ${result.error}`);
      process.exit(1);
    }

    return adapter;
  }

  if (adapterType === 'localStorage') {
    const { LocalStorageAdapter } = await import('@/adapters/LocalStorageAdapter');
    const adapter = new LocalStorageAdapter(false);
    await adapter.connect({
      type: 'localStorage',
      projects: [{ id: config?.project ?? 'default', name: 'Default' }],
    });
    return adapter;
  }

  console.error(`Unknown adapter: ${adapterType}`);
  process.exit(1);
}

// ============================================
// Run
// ============================================

program.parse();
