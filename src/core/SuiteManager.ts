/**
 * SuiteManager - Discovers test case suites from backend labels,
 * orders them (foundational suites first), and caches suite metadata.
 */

import type { ILabelReader } from '@/contracts/ILabelManager';
import type { IIssueReader } from '@/contracts/IIssueReader';

export interface SuiteInfo {
  readonly suiteId: string;
  readonly displayName: string;
  readonly order: number;
  readonly issueCount: number;
}

const SUITE_PREFIX = 'suite:';

const KNOWN_SUITES: Record<string, { displayName: string; order: number }> = {
  'auth': { displayName: 'Authentication', order: 0 },
  'user-management': { displayName: 'User Management', order: 1 },
  'dashboard': { displayName: 'Dashboard', order: 2 },
  'data-entry': { displayName: 'Data Entry', order: 3 },
  'reporting': { displayName: 'Reporting', order: 4 },
  'export': { displayName: 'Export', order: 5 },
  'admin': { displayName: 'Administration', order: 6 },
  'integration': { displayName: 'Integration', order: 7 },
};

function titleCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildSuiteInfo(
  suiteId: string,
  issueCount: number,
  order: number,
  displayName?: string
): SuiteInfo {
  return {
    suiteId,
    displayName: displayName ?? titleCase(suiteId),
    order,
    issueCount,
  };
}

type SuiteAdapter = ILabelReader & IIssueReader;

export class SuiteManager {
  private suites: SuiteInfo[] = [];

  async discoverSuites(
    adapter: SuiteAdapter,
    projectId: string
  ): Promise<SuiteInfo[]> {
    const labels = await adapter.getLabels(projectId);

    const suiteLabels = labels.filter((label) =>
      label.name.startsWith(SUITE_PREFIX)
    );

    if (suiteLabels.length === 0) {
      this.suites = [];
      return [];
    }

    const suiteInfos: SuiteInfo[] = await Promise.all(
      suiteLabels.map(async (label) => {
        const suiteId = label.name.slice(SUITE_PREFIX.length);
        const result = await adapter.getIssues(projectId, {
          labels: [label.name, 'test-case'],
          limit: 1,
        });

        const known = KNOWN_SUITES[suiteId];
        if (known) {
          return buildSuiteInfo(
            suiteId,
            result.total,
            known.order,
            known.displayName
          );
        }
        // Unknown suite: will get order assigned after sorting
        return buildSuiteInfo(suiteId, result.total, -1);
      })
    );

    // Separate known and unknown suites
    const knownSuites = suiteInfos.filter((s) => s.order >= 0);
    const unknownSuites = suiteInfos.filter((s) => s.order < 0);

    // Sort known by predefined order
    knownSuites.sort((a, b) => a.order - b.order);

    // Sort unknown alphabetically, assign order 100+
    unknownSuites.sort((a, b) => a.suiteId.localeCompare(b.suiteId));
    const orderedUnknown = unknownSuites.map((s, i) =>
      buildSuiteInfo(s.suiteId, s.issueCount, 100 + i, s.displayName)
    );

    this.suites = [...knownSuites, ...orderedUnknown];
    return [...this.suites];
  }

  getSuites(): readonly SuiteInfo[] {
    return [...this.suites];
  }

  setSuiteOrder(order: string[]): void {
    const orderMap = new Map<string, number>();
    order.forEach((id, index) => {
      orderMap.set(id, index);
    });

    // Re-order suites: explicitly ordered first, then remaining by current order
    const ordered: SuiteInfo[] = [];
    const remaining: SuiteInfo[] = [];

    for (const suite of this.suites) {
      const explicitOrder = orderMap.get(suite.suiteId);
      if (explicitOrder !== undefined) {
        ordered.push(buildSuiteInfo(
          suite.suiteId,
          suite.issueCount,
          explicitOrder,
          suite.displayName
        ));
      } else {
        remaining.push(suite);
      }
    }

    ordered.sort((a, b) => a.order - b.order);

    // Assign remaining suites orders after the last explicit one
    const nextOrder = order.length;
    const reorderedRemaining = remaining.map((s, i) =>
      buildSuiteInfo(s.suiteId, s.issueCount, nextOrder + i, s.displayName)
    );

    this.suites = [...ordered, ...reorderedRemaining];
  }

  clear(): void {
    this.suites = [];
  }
}

// Singleton management
let instance: SuiteManager | null = null;

export function getSuiteManager(): SuiteManager {
  if (!instance) {
    instance = new SuiteManager();
  }
  return instance;
}

export function resetSuiteManager(): SuiteManager {
  instance = new SuiteManager();
  return instance;
}
