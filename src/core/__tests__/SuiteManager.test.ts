import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SuiteManager,
  getSuiteManager,
  resetSuiteManager,
} from '../SuiteManager';
import type { SuiteInfo } from '../SuiteManager';
import type { Label, PaginatedResult, Issue, IssueQuery } from '@/models';

/**
 * Minimal stub implementing ILabelReader + IIssueReader for testing.
 */
function createMockAdapter(options: {
  labels: Label[];
  issueCounts?: Record<string, number>;
}) {
  const { labels, issueCounts = {} } = options;

  return {
    getLabels: async (_projectId: string): Promise<readonly Label[]> => {
      return labels;
    },
    getIssues: async (
      _projectId: string,
      query?: IssueQuery
    ): Promise<PaginatedResult<Issue>> => {
      // Find the suite label in the query to determine which count to return
      const suiteLabel = query?.labels?.find((l) => l.startsWith('suite:'));
      const total = suiteLabel ? (issueCounts[suiteLabel] ?? 0) : 0;
      return {
        items: [],
        total,
        page: 1,
        limit: query?.limit ?? 25,
        hasMore: false,
      };
    },
  };
}

function makeLabel(name: string): Label {
  return { id: `label-${name}`, name, color: '#000000' };
}

describe('SuiteManager', () => {
  let manager: SuiteManager;

  beforeEach(() => {
    resetSuiteManager();
    manager = getSuiteManager();
  });

  afterEach(() => {
    resetSuiteManager();
  });

  describe('discoverSuites', () => {
    it('should discover suites from "suite:*" labels and ignore non-suite labels', async () => {
      const adapter = createMockAdapter({
        labels: [
          makeLabel('suite:auth'),
          makeLabel('suite:dashboard'),
          makeLabel('bug'),
          makeLabel('test-case'),
          makeLabel('enhancement'),
        ],
        issueCounts: {
          'suite:auth': 5,
          'suite:dashboard': 12,
        },
      });

      const suites = await manager.discoverSuites(adapter, 'my-project');

      expect(suites).toHaveLength(2);
      const suiteIds = suites.map((s) => s.suiteId);
      expect(suiteIds).toContain('auth');
      expect(suiteIds).toContain('dashboard');
    });

    it('should return correct issue counts from getIssues total', async () => {
      const adapter = createMockAdapter({
        labels: [makeLabel('suite:auth'), makeLabel('suite:reporting')],
        issueCounts: {
          'suite:auth': 7,
          'suite:reporting': 3,
        },
      });

      const suites = await manager.discoverSuites(adapter, 'proj-1');

      const authSuite = suites.find((s) => s.suiteId === 'auth');
      const reportingSuite = suites.find((s) => s.suiteId === 'reporting');
      expect(authSuite?.issueCount).toBe(7);
      expect(reportingSuite?.issueCount).toBe(3);
    });
  });

  describe('display names', () => {
    it('should map known suites to predefined display names', async () => {
      const adapter = createMockAdapter({
        labels: [
          makeLabel('suite:auth'),
          makeLabel('suite:dashboard'),
          makeLabel('suite:admin'),
        ],
        issueCounts: {
          'suite:auth': 1,
          'suite:dashboard': 1,
          'suite:admin': 1,
        },
      });

      const suites = await manager.discoverSuites(adapter, 'proj');

      const auth = suites.find((s) => s.suiteId === 'auth');
      const dashboard = suites.find((s) => s.suiteId === 'dashboard');
      const admin = suites.find((s) => s.suiteId === 'admin');
      expect(auth?.displayName).toBe('Authentication');
      expect(dashboard?.displayName).toBe('Dashboard');
      expect(admin?.displayName).toBe('Administration');
    });

    it('should title-case unknown suite IDs for display names', async () => {
      const adapter = createMockAdapter({
        labels: [
          makeLabel('suite:custom-suite'),
          makeLabel('suite:api-tests'),
        ],
        issueCounts: {
          'suite:custom-suite': 2,
          'suite:api-tests': 4,
        },
      });

      const suites = await manager.discoverSuites(adapter, 'proj');

      const custom = suites.find((s) => s.suiteId === 'custom-suite');
      const api = suites.find((s) => s.suiteId === 'api-tests');
      expect(custom?.displayName).toBe('Custom Suite');
      expect(api?.displayName).toBe('Api Tests');
    });
  });

  describe('ordering', () => {
    it('should order known suites by predefined priority', async () => {
      const adapter = createMockAdapter({
        labels: [
          makeLabel('suite:reporting'),
          makeLabel('suite:auth'),
          makeLabel('suite:dashboard'),
        ],
        issueCounts: {
          'suite:reporting': 1,
          'suite:auth': 1,
          'suite:dashboard': 1,
        },
      });

      const suites = await manager.discoverSuites(adapter, 'proj');

      expect(suites[0]?.suiteId).toBe('auth');
      expect(suites[1]?.suiteId).toBe('dashboard');
      expect(suites[2]?.suiteId).toBe('reporting');
      expect(suites[0]?.order).toBe(0);
      expect(suites[1]?.order).toBe(2);
      expect(suites[2]?.order).toBe(4);
    });

    it('should sort unknown suites alphabetically after known ones', async () => {
      const adapter = createMockAdapter({
        labels: [
          makeLabel('suite:zebra'),
          makeLabel('suite:auth'),
          makeLabel('suite:alpha'),
        ],
        issueCounts: {
          'suite:zebra': 1,
          'suite:auth': 1,
          'suite:alpha': 1,
        },
      });

      const suites = await manager.discoverSuites(adapter, 'proj');

      // auth (known, order=0) should come first
      expect(suites[0]?.suiteId).toBe('auth');
      // then unknown suites alphabetically: alpha, zebra
      expect(suites[1]?.suiteId).toBe('alpha');
      expect(suites[2]?.suiteId).toBe('zebra');
      // unknown suites get order >= 100
      expect(suites[1]!.order).toBeGreaterThanOrEqual(100);
      expect(suites[2]!.order).toBeGreaterThan(suites[1]!.order);
    });
  });

  describe('setSuiteOrder', () => {
    it('should override auto-ordering with explicit order', async () => {
      const adapter = createMockAdapter({
        labels: [
          makeLabel('suite:auth'),
          makeLabel('suite:dashboard'),
          makeLabel('suite:reporting'),
        ],
        issueCounts: {
          'suite:auth': 1,
          'suite:dashboard': 1,
          'suite:reporting': 1,
        },
      });

      await manager.discoverSuites(adapter, 'proj');

      // Override: reporting first, then auth, then dashboard
      manager.setSuiteOrder(['reporting', 'auth', 'dashboard']);

      const suites = manager.getSuites();
      expect(suites[0]?.suiteId).toBe('reporting');
      expect(suites[0]?.order).toBe(0);
      expect(suites[1]?.suiteId).toBe('auth');
      expect(suites[1]?.order).toBe(1);
      expect(suites[2]?.suiteId).toBe('dashboard');
      expect(suites[2]?.order).toBe(2);
    });

    it('should place suites not in the explicit order at the end', async () => {
      const adapter = createMockAdapter({
        labels: [
          makeLabel('suite:auth'),
          makeLabel('suite:dashboard'),
          makeLabel('suite:reporting'),
        ],
        issueCounts: {
          'suite:auth': 1,
          'suite:dashboard': 1,
          'suite:reporting': 1,
        },
      });

      await manager.discoverSuites(adapter, 'proj');

      // Only specify order for auth, leaving dashboard and reporting unordered
      manager.setSuiteOrder(['auth']);

      const suites = manager.getSuites();
      expect(suites[0]?.suiteId).toBe('auth');
      expect(suites[0]?.order).toBe(0);
      // Remaining suites should come after, order >= 1
      expect(suites.length).toBe(3);
      expect(suites[1]!.order).toBeGreaterThan(0);
      expect(suites[2]!.order).toBeGreaterThan(0);
    });
  });

  describe('getSuites', () => {
    it('should return empty array before discovery', () => {
      const suites = manager.getSuites();
      expect(suites).toEqual([]);
    });

    it('should return cached suites after discovery', async () => {
      const adapter = createMockAdapter({
        labels: [makeLabel('suite:auth')],
        issueCounts: { 'suite:auth': 3 },
      });

      await manager.discoverSuites(adapter, 'proj');

      const suites = manager.getSuites();
      expect(suites).toHaveLength(1);
      expect(suites[0]?.suiteId).toBe('auth');
      expect(suites[0]?.issueCount).toBe(3);
    });
  });

  describe('clear', () => {
    it('should reset cached suites', async () => {
      const adapter = createMockAdapter({
        labels: [makeLabel('suite:auth')],
        issueCounts: { 'suite:auth': 2 },
      });

      await manager.discoverSuites(adapter, 'proj');
      expect(manager.getSuites()).toHaveLength(1);

      manager.clear();
      expect(manager.getSuites()).toEqual([]);
    });
  });

  describe('no suite labels', () => {
    it('should return empty array when no suite:* labels exist', async () => {
      const adapter = createMockAdapter({
        labels: [
          makeLabel('bug'),
          makeLabel('test-case'),
          makeLabel('enhancement'),
        ],
      });

      const suites = await manager.discoverSuites(adapter, 'proj');
      expect(suites).toEqual([]);
    });
  });

  describe('singleton', () => {
    it('should return the same instance from getSuiteManager', () => {
      const a = getSuiteManager();
      const b = getSuiteManager();
      expect(a).toBe(b);
    });

    it('should return a fresh instance after resetSuiteManager', async () => {
      const original = getSuiteManager();
      const adapter = createMockAdapter({
        labels: [makeLabel('suite:auth')],
        issueCounts: { 'suite:auth': 1 },
      });
      await original.discoverSuites(adapter, 'proj');

      const fresh = resetSuiteManager();
      expect(fresh).not.toBe(original);
      expect(fresh.getSuites()).toEqual([]);
    });
  });
});
