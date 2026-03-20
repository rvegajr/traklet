/**
 * GitHubAdapter Unit Tests
 * Tests the adapter against mocked GitHub REST API responses
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitHubAdapter } from '../GitHubAdapter';
import type { AdapterConfig } from '@/contracts';
import { createAdapterContractTests } from './adapter.contract.test';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockConfig(): AdapterConfig {
  return {
    type: 'github',
    token: 'test-pat-token',
    baseUrl: 'https://api.github.com',
    projects: [
      {
        id: 'test-project',
        name: 'Test Project',
        identifier: 'testowner/testrepo',
      },
    ],
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

function emptyResponse(status = 204): Response {
  return {
    ok: true,
    status,
    statusText: 'No Content',
    headers: new Headers({ 'content-length': '0' }),
    json: () => Promise.resolve(undefined),
    text: () => Promise.resolve(''),
  } as Response;
}

const MOCK_REPO = {
  id: 12345,
  name: 'testrepo',
  full_name: 'testowner/testrepo',
  description: 'A test repository',
  html_url: 'https://github.com/testowner/testrepo',
  owner: {
    login: 'testowner',
    id: 1,
    avatar_url: 'https://avatars.githubusercontent.com/u/1',
  },
};

const MOCK_GITHUB_ISSUE = {
  number: 1,
  title: 'Test Issue',
  body: 'Test description',
  state: 'open',
  labels: [
    { id: 101, name: 'bug', color: 'fc2929', description: 'Something is broken' },
    { id: 102, name: 'priority-high', color: 'e11d48', description: 'High priority' },
  ],
  user: {
    login: 'testuser',
    id: 42,
    avatar_url: 'https://avatars.githubusercontent.com/u/42',
  },
  assignees: [
    {
      login: 'assignee1',
      id: 99,
      avatar_url: 'https://avatars.githubusercontent.com/u/99',
    },
  ],
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T12:00:00Z',
  closed_at: null,
  comments: 3,
  html_url: 'https://github.com/testowner/testrepo/issues/1',
  pull_request: undefined,
};

const MOCK_GITHUB_COMMENT = {
  id: 555,
  body: 'This is a comment',
  user: {
    login: 'commenter',
    id: 77,
    avatar_url: 'https://avatars.githubusercontent.com/u/77',
  },
  created_at: '2026-03-01T12:00:00Z',
  updated_at: '2026-03-01T12:00:00Z',
};

function setupConnectMock(): void {
  mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_REPO));
}

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;
  let config: AdapterConfig;

  beforeEach(() => {
    adapter = new GitHubAdapter();
    config = createMockConfig();
    mockFetch.mockReset();
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  describe('Type and Capabilities', () => {
    it('should have type github', () => {
      expect(adapter.type).toBe('github');
    });

    it('should declare correct capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.canDeleteIssues).toBe(false);
      expect(caps.hasAttachments).toBe(false);
      expect(caps.hasPriority).toBe(false);
      expect(caps.hasLabels).toBe(true);
      expect(caps.hasAssignees).toBe(true);
      expect(caps.hasComments).toBe(true);
      expect(caps.hasSearch).toBe(true);
    });
  });

  describe('Connection', () => {
    it('should connect successfully with valid config', async () => {
      setupConnectMock();
      const result = await adapter.connect(config);
      expect(result.success).toBe(true);
      expect(result.projects).toHaveLength(1);
      expect(result.projects?.[0]?.name).toBe('testrepo');
      expect(adapter.isConnected()).toBe(true);
    });

    it('should fail without token', async () => {
      const badConfig = { ...config, token: undefined };
      const result = await adapter.connect(badConfig);
      expect(result.success).toBe(false);
      expect(result.error).toContain('token');
    });

    it('should fail when repo does not exist', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: 'Not Found' }, 404)
      );
      const result = await adapter.connect(config);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to connect');
    });

    it('should fail with invalid identifier format', async () => {
      const badConfig: AdapterConfig = {
        ...config,
        projects: [{ id: 'bad', name: 'Bad', identifier: 'no-slash' }],
      };
      const result = await adapter.connect(badConfig);
      expect(result.success).toBe(false);
      expect(result.error).toContain('owner/repo');
    });

    it('should disconnect', async () => {
      setupConnectMock();
      await adapter.connect(config);
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('getIssues', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should return empty result when no issues', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      const result = await adapter.getIssues('test-project');
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should return mapped issues and filter out pull requests', async () => {
      const prIssue = {
        ...MOCK_GITHUB_ISSUE,
        number: 2,
        pull_request: { url: 'https://api.github.com/repos/testowner/testrepo/pulls/2' },
      };
      mockFetch.mockResolvedValueOnce(
        jsonResponse([MOCK_GITHUB_ISSUE, prIssue])
      );

      const result = await adapter.getIssues('test-project');
      expect(result.items).toHaveLength(1);

      const issue = result.items[0]!;
      expect(issue.id).toBe('1');
      expect(issue.number).toBe(1);
      expect(issue.title).toBe('Test Issue');
      expect(issue.body).toBe('Test description');
      expect(issue.state).toBe('open');
      expect(issue.labels).toHaveLength(2);
      expect(issue.labels[0]?.name).toBe('bug');
      expect(issue.labels[1]?.name).toBe('priority-high');
      expect(issue.createdBy.name).toBe('testuser');
      expect(issue.createdBy.username).toBe('testuser');
      expect(issue.assignees).toHaveLength(1);
      expect(issue.assignees[0]?.username).toBe('assignee1');
      expect(issue.commentCount).toBe(3);
      expect(issue.projectId).toBe('test-project');
      expect(issue.attachments).toEqual([]);
    });

    it('should pass query params for state filter', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await adapter.getIssues('test-project', { state: 'open' });

      const fetchUrl = mockFetch.mock.calls[1]![0] as string;
      expect(fetchUrl).toContain('state=open');
    });

    it('should pass query params for labels filter', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await adapter.getIssues('test-project', { labels: ['bug', 'enhancement'] });

      const fetchUrl = mockFetch.mock.calls[1]![0] as string;
      expect(fetchUrl).toContain('labels=bug%2Cenhancement');
    });

    it('should pass pagination params', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await adapter.getIssues('test-project', { page: 2, limit: 25 });

      const fetchUrl = mockFetch.mock.calls[1]![0] as string;
      expect(fetchUrl).toContain('page=2');
      expect(fetchUrl).toContain('per_page=25');
    });

    it('should pass sort and direction params', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await adapter.getIssues('test-project', { sort: 'updated', order: 'asc' });

      const fetchUrl = mockFetch.mock.calls[1]![0] as string;
      expect(fetchUrl).toContain('sort=updated');
      expect(fetchUrl).toContain('direction=asc');
    });

    it('should detect hasMore from response length', async () => {
      const issues = Array.from({ length: 30 }, (_, i) => ({
        ...MOCK_GITHUB_ISSUE,
        number: i + 1,
        pull_request: undefined,
      }));
      mockFetch.mockResolvedValueOnce(jsonResponse(issues));

      const result = await adapter.getIssues('test-project', { limit: 30 });
      expect(result.hasMore).toBe(true);
    });
  });

  describe('getIssue', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should fetch and map a single issue', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_GITHUB_ISSUE));

      const issue = await adapter.getIssue('test-project', '1');
      expect(issue.id).toBe('1');
      expect(issue.title).toBe('Test Issue');
      expect(issue.metadata?.['htmlUrl']).toBe('https://github.com/testowner/testrepo/issues/1');
    });

    it('should throw when issue not found', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: 'Not Found' }, 404)
      );

      await expect(adapter.getIssue('test-project', '999')).rejects.toThrow();
    });
  });

  describe('issueExists', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should return true for existing issue', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_GITHUB_ISSUE));
      expect(await adapter.issueExists('test-project', '1')).toBe(true);
    });

    it('should return false for non-existing issue', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: 'Not Found' }, 404)
      );
      expect(await adapter.issueExists('test-project', '999')).toBe(false);
    });
  });

  describe('createIssue', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should create an issue with POST', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_GITHUB_ISSUE));

      const issue = await adapter.createIssue('test-project', {
        title: 'New Issue',
        body: 'Issue body',
        labels: ['bug'],
        assignees: ['assignee1'],
      });

      expect(issue.id).toBe('1');

      const createCall = mockFetch.mock.calls[1]!;
      expect(createCall[1]?.method).toBe('POST');

      const body = JSON.parse(createCall[1]?.body as string);
      expect(body.title).toBe('New Issue');
      expect(body.body).toBe('Issue body');
      expect(body.labels).toEqual(['bug']);
      expect(body.assignees).toEqual(['assignee1']);
    });

    it('should create without optional fields', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_GITHUB_ISSUE));

      await adapter.createIssue('test-project', {
        title: 'Minimal Issue',
        body: 'Just title and body',
      });

      const body = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(body.title).toBe('Minimal Issue');
      expect(body.body).toBe('Just title and body');
      expect(body.labels).toBeUndefined();
      expect(body.assignees).toBeUndefined();
    });
  });

  describe('updateIssue', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should update fields via PATCH', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        ...MOCK_GITHUB_ISSUE,
        title: 'Updated Title',
        state: 'closed',
      }));

      const issue = await adapter.updateIssue('test-project', '1', {
        title: 'Updated Title',
        state: 'closed',
      });

      const patchCall = mockFetch.mock.calls[1]!;
      expect(patchCall[1]?.method).toBe('PATCH');

      const body = JSON.parse(patchCall[1]?.body as string);
      expect(body.title).toBe('Updated Title');
      expect(body.state).toBe('closed');
    });

    it('should return current issue when no updates provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_GITHUB_ISSUE));

      const issue = await adapter.updateIssue('test-project', '1', {});
      expect(issue.title).toBe('Test Issue');
    });
  });

  describe('deleteIssue (close)', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should close issue instead of deleting', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        ...MOCK_GITHUB_ISSUE,
        state: 'closed',
      }));

      await adapter.deleteIssue('test-project', '1');

      const patchCall = mockFetch.mock.calls[1]!;
      expect(patchCall[1]?.method).toBe('PATCH');
      const body = JSON.parse(patchCall[1]?.body as string);
      expect(body.state).toBe('closed');
    });
  });

  describe('Comments', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should get comments', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([MOCK_GITHUB_COMMENT])
      );

      const comments = await adapter.getComments('test-project', '1');
      expect(comments).toHaveLength(1);
      expect(comments[0]?.id).toBe('555');
      expect(comments[0]?.body).toBe('This is a comment');
      expect(comments[0]?.author.name).toBe('commenter');
      expect(comments[0]?.author.username).toBe('commenter');
    });

    it('should add a comment', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_GITHUB_COMMENT));

      const comment = await adapter.addComment('test-project', '1', {
        body: 'New comment',
      });

      expect(comment.id).toBe('555');
      const addCall = mockFetch.mock.calls[1]!;
      expect(addCall[1]?.method).toBe('POST');
      expect(JSON.parse(addCall[1]?.body as string)).toEqual({ body: 'New comment' });
    });

    it('should update a comment', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ ...MOCK_GITHUB_COMMENT, body: 'Updated comment' })
      );

      const comment = await adapter.updateComment('test-project', '1', '555', {
        body: 'Updated comment',
      });

      expect(comment.body).toBe('Updated comment');
      const updateCall = mockFetch.mock.calls[1]!;
      expect(updateCall[1]?.method).toBe('PATCH');
    });

    it('should delete a comment', async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await adapter.deleteComment('test-project', '1', '555');

      const deleteCall = mockFetch.mock.calls[1]!;
      expect(deleteCall[1]?.method).toBe('DELETE');
      expect(deleteCall[0]).toContain('/comments/555');
    });
  });

  describe('Labels', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should fetch labels from GitHub API', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([
          { id: 1, name: 'bug', color: 'fc2929', description: 'Something broken' },
          { id: 2, name: 'enhancement', color: '84b6eb', description: 'New feature' },
        ])
      );

      const labels = await adapter.getLabels('test-project');
      expect(labels).toHaveLength(2);
      expect(labels[0]?.name).toBe('bug');
      expect(labels[0]?.color).toBe('#fc2929');
      expect(labels[1]?.name).toBe('enhancement');
    });

    it('should return empty when no labels', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      const labels = await adapter.getLabels('test-project');
      expect(labels).toHaveLength(0);
    });
  });

  describe('State Mapping', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it.each([
      ['open', 'open'],
      ['closed', 'closed'],
    ])('should map GitHub state %s to %s', async (ghState, expected) => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ...MOCK_GITHUB_ISSUE,
          state: ghState,
        })
      );

      const issue = await adapter.getIssue('test-project', '1');
      expect(issue.state).toBe(expected);
    });
  });

  describe('Priority Extraction from Labels', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it.each([
      [['priority-critical'], 'critical'],
      [['priority-high'], 'high'],
      [['priority-medium'], 'medium'],
      [['priority-low'], 'low'],
    ])('should extract priority from labels %s as %s', async (labelNames, expected) => {
      const labels = labelNames.map((name, i) => ({ id: i, name, color: '000000', description: '' }));
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ...MOCK_GITHUB_ISSUE,
          labels,
        })
      );

      const issue = await adapter.getIssue('test-project', '1');
      expect(issue.priority).toBe(expected);
    });

    it('should return undefined priority when no priority label', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ...MOCK_GITHUB_ISSUE,
          labels: [{ id: 1, name: 'bug', color: '000000', description: '' }],
        })
      );

      const issue = await adapter.getIssue('test-project', '1');
      expect(issue.priority).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw when not connected', async () => {
      await expect(adapter.getIssues('test-project')).rejects.toThrow('not connected');
    });

    it('should throw for unknown project', async () => {
      setupConnectMock();
      await adapter.connect(config);

      await expect(adapter.getIssues('unknown-project')).rejects.toThrow('Project not found');
    });
  });
});

// ============================================
// Contract Tests with stateful mock
// ============================================

interface GitHubIssueStore {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: Array<{ id: number; name: string; color: string; description: string }>;
  user: { login: string; id: number; avatar_url: string };
  assignees: Array<{ login: string; id: number; avatar_url: string }>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  comments: number;
  html_url: string;
  pull_request?: undefined;
}

let contractIssueCounter = 0;
const contractIssueStore = new Map<number, GitHubIssueStore>();
const contractCommentStore = new Map<string, Array<{ id: number; body: string; user: { login: string; id: number; avatar_url: string }; created_at: string; updated_at: string }>>();

function setupContractMocks(): void {
  contractIssueCounter = 0;
  contractIssueStore.clear();
  contractCommentStore.clear();

  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    const urlStr = String(url);
    const method = init?.method ?? 'GET';

    // Repo info (connect)
    if (urlStr.match(/\/repos\/[^/]+\/[^/]+$/) && method === 'GET') {
      return Promise.resolve(jsonResponse(MOCK_REPO));
    }

    // User info (validateToken)
    if (urlStr.includes('/user') && !urlStr.includes('/users/')) {
      return Promise.resolve(jsonResponse({ login: 'testuser', id: 42 }));
    }

    // Create issue
    if (urlStr.match(/\/repos\/[^/]+\/[^/]+\/issues$/) && method === 'POST') {
      contractIssueCounter++;
      const body = JSON.parse(init?.body as string);
      const issue: GitHubIssueStore = {
        number: contractIssueCounter,
        title: body.title ?? 'Untitled',
        body: body.body ?? '',
        state: 'open',
        labels: (body.labels ?? []).map((name: string, i: number) => ({
          id: i + 1, name, color: '000000', description: '',
        })),
        user: { login: 'testuser', id: 42, avatar_url: '' },
        assignees: (body.assignees ?? []).map((login: string, i: number) => ({
          login, id: i + 100, avatar_url: '',
        })),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        closed_at: null,
        comments: 0,
        html_url: `https://github.com/testowner/testrepo/issues/${contractIssueCounter}`,
        pull_request: undefined,
      };
      contractIssueStore.set(contractIssueCounter, issue);
      return Promise.resolve(jsonResponse(issue));
    }

    // Update issue (PATCH /repos/:owner/:repo/issues/:number)
    const patchMatch = urlStr.match(/\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/);
    if (patchMatch && method === 'PATCH') {
      const num = Number(patchMatch[1]);
      const body = JSON.parse(init?.body as string);
      const existing = contractIssueStore.get(num);
      if (!existing) {
        return Promise.resolve(jsonResponse({ message: 'Not Found' }, 404));
      }
      const updated: GitHubIssueStore = {
        ...existing,
        title: body.title ?? existing.title,
        body: body.body ?? existing.body,
        state: body.state ?? existing.state,
        labels: body.labels
          ? body.labels.map((name: string, i: number) => ({ id: i + 1, name, color: '000000', description: '' }))
          : existing.labels,
        updated_at: new Date().toISOString(),
        closed_at: body.state === 'closed' ? new Date().toISOString() : existing.closed_at,
      };
      contractIssueStore.set(num, updated);
      return Promise.resolve(jsonResponse(updated));
    }

    // Get single issue
    const getIssueMatch = urlStr.match(/\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/);
    if (getIssueMatch && method === 'GET') {
      const num = Number(getIssueMatch[1]);
      const stored = contractIssueStore.get(num);
      if (stored) {
        return Promise.resolve(jsonResponse(stored));
      }
      return Promise.resolve(jsonResponse({ message: 'Not Found' }, 404));
    }

    // List issues
    if (urlStr.match(/\/repos\/[^/]+\/[^/]+\/issues\?/) && method === 'GET') {
      const issues = Array.from(contractIssueStore.values()).filter((i) => !i.pull_request);
      return Promise.resolve(jsonResponse(issues));
    }

    // Labels
    if (urlStr.match(/\/repos\/[^/]+\/[^/]+\/labels/) && method === 'GET') {
      return Promise.resolve(jsonResponse([]));
    }

    // Comments
    if (urlStr.match(/\/issues\/\d+\/comments/) && method === 'GET') {
      return Promise.resolve(jsonResponse([]));
    }

    return Promise.resolve(jsonResponse({ message: 'Not Found' }, 404));
  });
}

createAdapterContractTests(
  'GitHubAdapter',
  () => {
    setupContractMocks();
    return new GitHubAdapter();
  },
  () => createMockConfig()
);
