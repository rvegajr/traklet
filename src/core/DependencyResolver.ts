/**
 * DependencyResolver - Browser-side dependency graph for test cases
 *
 * Extracts dependency information from issue titles and bodies,
 * builds an incremental graph, and determines which test cases
 * are blocked based on prerequisite test results.
 */

import type { Issue } from '@/models';
import type { TestRunManager, TestStatus } from './TestRunManager';

// ============================================
// Types
// ============================================

export interface ResolvedPrerequisite {
  readonly testCaseId: string;
  readonly issueId: string;
  readonly title: string;
  readonly status: TestStatus;
}

export interface DependencyInfo {
  readonly issueId: string;
  readonly testCaseId: string;
  readonly prerequisites: readonly ResolvedPrerequisite[];
  readonly isBlocked: boolean;
  readonly blockedBy: readonly string[];
}

// ============================================
// Internal types
// ============================================

interface RegisteredIssue {
  readonly issueId: string;
  readonly testCaseId: string;
  readonly title: string;
  readonly body: string;
}

// ============================================
// Regexes
// ============================================

const TC_ID_RE = /^(TC-\d+):/;

const SECTION_PREREQ_RE =
  /(?:<span[^>]*>)?\{traklet:section:prerequisites\}(?:<\/span>)?([\s\S]*?)(?:<span[^>]*>)?\{\/traklet:section:prerequisites\}(?:<\/span>)?/;

const PAREN_TC_RE = /\(TC-\d+\)/g;
const BOLD_TC_RE = /\*\*(TC-\d+)\*\*/g;

// ============================================
// DependencyResolver
// ============================================

export class DependencyResolver {
  /** TC-ID -> RegisteredIssue */
  private tcMap = new Map<string, RegisteredIssue>();
  /** issue ID -> TC-ID */
  private issueToTc = new Map<string, string>();

  // ----------------------------------------
  // Public API
  // ----------------------------------------

  registerIssues(issues: Issue[]): void {
    for (const issue of issues) {
      const tcId = this.extractTestCaseId(issue.title);
      if (tcId === null) continue;

      const entry: RegisteredIssue = {
        issueId: issue.id,
        testCaseId: tcId,
        title: issue.title,
        body: issue.body,
      };

      this.tcMap.set(tcId, entry);
      this.issueToTc.set(issue.id, tcId);
    }
  }

  extractTestCaseId(title: string): string | null {
    const match = TC_ID_RE.exec(title);
    return match ? match[1]! : null;
  }

  parsePrerequisites(body: string): string[] {
    if (!body) return [];

    const sectionMatch = SECTION_PREREQ_RE.exec(body);
    if (!sectionMatch) return [];

    const sectionContent = sectionMatch[1]!;
    const ids = new Set<string>();

    // Extract (TC-xxx) references
    let m: RegExpExecArray | null;
    PAREN_TC_RE.lastIndex = 0;
    while ((m = PAREN_TC_RE.exec(sectionContent)) !== null) {
      // strip parens: "(TC-001)" -> "TC-001"
      ids.add(m[0].slice(1, -1));
    }

    // Extract **TC-xxx** references
    BOLD_TC_RE.lastIndex = 0;
    while ((m = BOLD_TC_RE.exec(sectionContent)) !== null) {
      ids.add(m[1]!);
    }

    return [...ids];
  }

  isBlocked(issueId: string, testRunManager: TestRunManager): boolean {
    const tcId = this.issueToTc.get(issueId);
    if (!tcId) return false;

    const entry = this.tcMap.get(tcId);
    if (!entry) return false;

    const prereqIds = this.parsePrerequisites(entry.body);
    if (prereqIds.length === 0) return false;

    for (const prereqTcId of prereqIds) {
      const prereqEntry = this.tcMap.get(prereqTcId);
      if (!prereqEntry) continue; // unregistered => not blocking

      const status = testRunManager.getStatusForIssue(prereqEntry.issueId);
      if (status === 'failed') return true;
    }

    return false;
  }

  getBlockingInfo(issueId: string, testRunManager: TestRunManager): DependencyInfo {
    const tcId = this.issueToTc.get(issueId) ?? '';
    const entry = this.tcMap.get(tcId);

    if (!entry) {
      return {
        issueId,
        testCaseId: tcId,
        prerequisites: [],
        isBlocked: false,
        blockedBy: [],
      };
    }

    const prereqIds = this.parsePrerequisites(entry.body);
    const prerequisites: ResolvedPrerequisite[] = [];
    const blockedBy: string[] = [];

    for (const prereqTcId of prereqIds) {
      const prereqEntry = this.tcMap.get(prereqTcId);
      if (!prereqEntry) continue; // skip unregistered

      const status = testRunManager.getStatusForIssue(prereqEntry.issueId);
      prerequisites.push({
        testCaseId: prereqTcId,
        issueId: prereqEntry.issueId,
        title: prereqEntry.title,
        status,
      });

      if (status === 'failed') {
        blockedBy.push(prereqTcId);
      }
    }

    return {
      issueId,
      testCaseId: tcId,
      prerequisites,
      isBlocked: blockedBy.length > 0,
      blockedBy,
    };
  }

  getRegisteredIds(): string[] {
    return [...this.tcMap.keys()];
  }

  resolveTestCaseId(tcId: string): string | undefined {
    return this.tcMap.get(tcId)?.issueId;
  }

  clear(): void {
    this.tcMap.clear();
    this.issueToTc.clear();
  }
}

// ============================================
// Singleton
// ============================================

let instance: DependencyResolver | null = null;

export function getDependencyResolver(): DependencyResolver {
  if (!instance) {
    instance = new DependencyResolver();
  }
  return instance;
}

export function resetDependencyResolver(): DependencyResolver {
  instance = new DependencyResolver();
  return instance;
}
