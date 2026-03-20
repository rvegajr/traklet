/**
 * RestAdapter Unit Tests
 * Tests the adapter against mocked generic REST API responses
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RestAdapter } from '../RestAdapter';
import type { AdapterConfig } from '@/contracts';
import { createAdapterContractTests } from './adapter.contract.test';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockConfig(): AdapterConfig {
  return {
    type: 'rest',
    token: 'test-bearer-token',
    baseUrl: 'https://api.example.com',
    projects: [
      {
        id: 'test-project',
        name: 'Test Project',
        identifier: 'test-project',
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

const MOCK_PROJECT = {
  id: 'test-project',
  name: 'Test Project',
  description: 'A test project',
};

const MOCK_ISSUE = {
  id: '1',
  number: 1,
  title: 'Test Issue',
  body: 'Test description',
  state: 'open',
  priority: 'high',
  labels: [
    { id: 'lbl-1', name: 'bug', color: '#ff0000' },
    { id: 'lbl-2', name: 'test-case', color: '#00ff00' },
  ],
  createdBy: {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
  },
  assignees: [],
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
  attachments: [],
  commentCount: 0,
  projectId: 'test-project',
};

const MOCK_COMMENT = {
  id: '42',
  body: 'This is a comment',
  author: {
    id: 'commenter-1',
    name: 'Commenter',
    email: 'commenter@example.com',
  },
  createdAt: '2026-03-01T12:00:00Z',
  updatedAt: '2026-03-01T12:00:00Z',
  attachments: [],
};

function setupConnectMock(): void {
  mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_PROJECT));
}

describe('RestAdapter', () => {
  let adapter: RestAdapter;
  let config: AdapterConfig;

  beforeEach(() => {
    adapter = new RestAdapter();
    config = createMockConfig();
    mockFetch.mockReset();
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  describe('Type and Capabilities', () => {
    it('should have type rest', () => {
      expect(adapter.type).toBe('rest');
    });

    it('should declare correct capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.canDeleteIssues).toBe(true);
      expect(caps.hasAttachments).toBe(false);
      expect(caps.hasPriority).toBe(true);
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
      expect(result.projects?.[0]?.name).toBe('Test Project');
      expect(adapter.isConnected()).toBe(true);
    });

    it('should fail without baseUrl', async () => {
      const badConfig = { ...config, baseUrl: undefined };
      const result = await adapter.connect(badConfig);
      expect(result.success).toBe(false);
      expect(result.error).toContain('baseUrl');
    });

    it('should fail without token', async () => {
      const badConfig = { ...config, token: undefined };
      const result = await adapter.connect(badConfig);
      expect(result.success).toBe(false);
      expect(result.error).toContain('token');
    });

    it('should fail when project endpoint returns error', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: 'Not found' }, 404)
      );
      const result = await adapter.connect(config);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to connect');
    });

    it('should disconnect', async () => {
      setupConnectMock();
      await adapter.connect(config);
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });

    it('should send Bearer token in Authorization header', async () => {
      setupConnectMock();
      await adapter.connect(config);

      const call = mockFetch.mock.calls[0]!;
      expect(call[1]?.headers?.['Authorization']).toBe('Bearer test-bearer-token');
    });

    it('should include custom headers from options', async () => {
      const customConfig = {
        ...config,
        options: { headers: { 'X-Custom': 'value' } },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_PROJECT));
      await adapter.connect(customConfig);

      const call = mockFetch.mock.calls[0]!;
      expect(call[1]?.headers?.['X-Custom']).toBe('value');
    });
  });

  describe('getIssues', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should return paginated issues', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          items: [MOCK_ISSUE],
          total: 1,
          page: 1,
          limit: 50,
          hasMore: false,
        })
      );

      const result = await adapter.getIssues('test-project');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);

      const issue = result.items[0]!;
      expect(issue.id).toBe('1');
      expect(issue.title).toBe('Test Issue');
      expect(issue.body).toBe('Test description');
      expect(issue.state).toBe('open');
      expect(issue.priority).toBe('high');
      expect(issue.labels).toHaveLength(2);
      expect(issue.createdBy.name).toBe('Test User');
      expect(issue.projectId).toBe('test-project');
      expect(issue.createdAt).toBeInstanceOf(Date);
      expect(issue.updatedAt).toBeInstanceOf(Date);
    });

    it('should pass query params for state filter', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ items: [], total: 0, page: 1, limit: 50, hasMore: false })
      );

      await adapter.getIssues('test-project', { state: 'open' });

      const call = mockFetch.mock.calls[1]!;
      const url = new URL(call[0] as string);
      expect(url.searchParams.get('state')).toBe('open');
    });

    it('should pass query params for labels filter', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ items: [], total: 0, page: 1, limit: 50, hasMore: false })
      );

      await adapter.getIssues('test-project', { labels: ['bug', 'feature'] });

      const call = mockFetch.mock.calls[1]!;
      const url = new URL(call[0] as string);
      expect(url.searchParams.get('labels')).toBe('bug,feature');
    });

    it('should pass query params for pagination', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ items: [], total: 25, page: 2, limit: 10, hasMore: true })
      );

      const result = await adapter.getIssues('test-project', { page: 2, limit: 10 });

      const call = mockFetch.mock.calls[1]!;
      const url = new URL(call[0] as string);
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('limit')).toBe('10');
      expect(result.total).toBe(25);
      expect(result.page).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    it('should pass query params for search', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ items: [], total: 0, page: 1, limit: 50, hasMore: false })
      );

      await adapter.getIssues('test-project', { search: 'some text' });

      const call = mockFetch.mock.calls[1]!;
      const url = new URL(call[0] as string);
      expect(url.searchParams.get('search')).toBe('some text');
    });

    it('should pass query params for sort and order', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ items: [], total: 0, page: 1, limit: 50, hasMore: false })
      );

      await adapter.getIssues('test-project', { sort: 'updated', order: 'asc' });

      const call = mockFetch.mock.calls[1]!;
      const url = new URL(call[0] as string);
      expect(url.searchParams.get('sort')).toBe('updated');
      expect(url.searchParams.get('order')).toBe('asc');
    });

    it('should pass query params for assignee', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ items: [], total: 0, page: 1, limit: 50, hasMore: false })
      );

      await adapter.getIssues('test-project', { assignee: 'user@example.com' });

      const call = mockFetch.mock.calls[1]!;
      const url = new URL(call[0] as string);
      expect(url.searchParams.get('assignee')).toBe('user@example.com');
    });
  });

  describe('getIssue', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should fetch and return a single issue', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_ISSUE));

      const issue = await adapter.getIssue('test-project', '1');
      expect(issue.id).toBe('1');
      expect(issue.title).toBe('Test Issue');
      expect(issue.createdAt).toBeInstanceOf(Date);
    });

    it('should throw when issue not found', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: 'Not found' }, 404)
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
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_ISSUE));
      expect(await adapter.issueExists('test-project', '1')).toBe(true);
    });

    it('should return false for non-existing issue', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: 'Not found' }, 404)
      );
      expect(await adapter.issueExists('test-project', '999')).toBe(false);
    });
  });

  describe('createIssue', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should create an issue via POST', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_ISSUE));

      const issue = await adapter.createIssue('test-project', {
        title: 'New Issue',
        body: 'Issue body',
        labels: ['bug'],
        priority: 'high',
      });

      expect(issue.id).toBe('1');

      const createCall = mockFetch.mock.calls[1]!;
      expect(createCall[1]?.method).toBe('POST');
      const url = new URL(createCall[0] as string);
      expect(url.pathname).toBe('/projects/test-project/issues');

      const body = JSON.parse(createCall[1]?.body as string);
      expect(body.title).toBe('New Issue');
      expect(body.body).toBe('Issue body');
      expect(body.labels).toEqual(['bug']);
      expect(body.priority).toBe('high');
    });

    it('should create with only required fields', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_ISSUE));

      await adapter.createIssue('test-project', {
        title: 'Minimal Issue',
        body: 'Just title and body',
      });

      const body = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(body.title).toBe('Minimal Issue');
      expect(body.body).toBe('Just title and body');
    });
  });

  describe('updateIssue', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should update via PATCH', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ ...MOCK_ISSUE, title: 'Updated Title', state: 'closed' })
      );

      const issue = await adapter.updateIssue('test-project', '1', {
        title: 'Updated Title',
        state: 'closed',
      });

      expect(issue.title).toBe('Updated Title');

      const patchCall = mockFetch.mock.calls[1]!;
      expect(patchCall[1]?.method).toBe('PATCH');
      const body = JSON.parse(patchCall[1]?.body as string);
      expect(body.title).toBe('Updated Title');
      expect(body.state).toBe('closed');
    });

    it('should return current issue when no updates provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_ISSUE));

      const issue = await adapter.updateIssue('test-project', '1', {});
      expect(issue.title).toBe('Test Issue');

      // Should have called GET (getIssue) not PATCH
      const call = mockFetch.mock.calls[1]!;
      expect(call[1]?.method).toBeUndefined(); // GET has no method set
    });
  });

  describe('deleteIssue', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should send DELETE request', async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await adapter.deleteIssue('test-project', '1');

      const deleteCall = mockFetch.mock.calls[1]!;
      expect(deleteCall[1]?.method).toBe('DELETE');
      expect(deleteCall[0]).toContain('/projects/test-project/issues/1');
    });
  });

  describe('Comments', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should get comments', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([MOCK_COMMENT]));

      const comments = await adapter.getComments('test-project', '1');
      expect(comments).toHaveLength(1);
      expect(comments[0]?.id).toBe('42');
      expect(comments[0]?.body).toBe('This is a comment');
      expect(comments[0]?.author.name).toBe('Commenter');
      expect(comments[0]?.createdAt).toBeInstanceOf(Date);
    });

    it('should add a comment', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_COMMENT));

      const comment = await adapter.addComment('test-project', '1', {
        body: 'New comment',
      });

      expect(comment.id).toBe('42');
      const addCall = mockFetch.mock.calls[1]!;
      expect(addCall[1]?.method).toBe('POST');
      expect(JSON.parse(addCall[1]?.body as string)).toEqual({ body: 'New comment' });
    });

    it('should update a comment', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ ...MOCK_COMMENT, body: 'Updated comment' })
      );

      const comment = await adapter.updateComment('test-project', '1', '42', {
        body: 'Updated comment',
      });

      expect(comment.body).toBe('Updated comment');
      const updateCall = mockFetch.mock.calls[1]!;
      expect(updateCall[1]?.method).toBe('PATCH');
      expect(updateCall[0]).toContain('/comments/42');
    });

    it('should delete a comment', async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await adapter.deleteComment('test-project', '1', '42');

      const deleteCall = mockFetch.mock.calls[1]!;
      expect(deleteCall[1]?.method).toBe('DELETE');
      expect(deleteCall[0]).toContain('/comments/42');
    });
  });

  describe('Labels', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should get labels', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([
          { id: 'lbl-1', name: 'bug', color: '#ff0000' },
          { id: 'lbl-2', name: 'feature', color: '#00ff00' },
        ])
      );

      const labels = await adapter.getLabels('test-project');
      expect(labels).toHaveLength(2);
      expect(labels[0]?.name).toBe('bug');
      expect(labels[1]?.name).toBe('feature');
    });

    it('should return empty array when no labels', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      const labels = await adapter.getLabels('test-project');
      expect(labels).toHaveLength(0);
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

  describe('Token Validation', () => {
    it('should validate token by making an authenticated request', async () => {
      setupConnectMock();
      await adapter.connect(config);

      mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));
      const valid = await adapter.validateToken();
      expect(valid).toBe(true);
    });

    it('should return false for invalid token', async () => {
      setupConnectMock();
      await adapter.connect(config);

      mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401));
      const valid = await adapter.validateToken();
      expect(valid).toBe(false);
    });
  });
});

// Run the shared contract tests against RestAdapter with mocks.
let contractIssueCounter = 0;
const contractIssueStore = new Map<string, Record<string, unknown>>();

function setupContractMocks(): void {
  contractIssueCounter = 0;
  contractIssueStore.clear();

  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    const urlStr = String(url);
    const method = init?.method ?? 'GET';

    // Project info (connect)
    if (urlStr.match(/\/projects\/[^/]+$/) && method === 'GET') {
      return Promise.resolve(jsonResponse({
        id: 'test-project',
        name: 'Test Project',
        description: 'A test project',
      }));
    }

    // Health check
    if (urlStr.includes('/health')) {
      return Promise.resolve(jsonResponse({ status: 'ok' }));
    }

    // Create issue
    if (urlStr.match(/\/projects\/[^/]+\/issues$/) && method === 'POST') {
      contractIssueCounter++;
      const body = JSON.parse(init?.body as string);
      const issue = {
        id: String(contractIssueCounter),
        number: contractIssueCounter,
        title: body.title ?? 'Untitled',
        body: body.body ?? '',
        state: 'open' as const,
        priority: body.priority,
        labels: (body.labels ?? []).map((name: string, i: number) => ({
          id: `lbl-${i}`,
          name,
          color: '#cccccc',
        })),
        createdBy: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
        assignees: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attachments: [],
        commentCount: 0,
        projectId: 'test-project',
      };
      contractIssueStore.set(issue.id, issue);
      return Promise.resolve(jsonResponse(issue));
    }

    // Get single issue
    if (urlStr.match(/\/projects\/[^/]+\/issues\/[^/?]+$/) && method === 'GET') {
      const idMatch = urlStr.match(/\/issues\/([^/?]+)$/);
      const id = idMatch ? idMatch[1] : '';
      const stored = contractIssueStore.get(id!);
      if (stored) {
        return Promise.resolve(jsonResponse(stored));
      }
      return Promise.resolve(jsonResponse({ message: 'Not Found' }, 404));
    }

    // Update issue
    if (urlStr.match(/\/projects\/[^/]+\/issues\/[^/?]+$/) && method === 'PATCH') {
      const idMatch = urlStr.match(/\/issues\/([^/?]+)$/);
      const id = idMatch ? idMatch[1] : '';
      const body = JSON.parse(init?.body as string);
      const existing = contractIssueStore.get(id!);
      if (!existing) {
        return Promise.resolve(jsonResponse({ message: 'Not Found' }, 404));
      }
      const updated = { ...existing, ...body, updatedAt: new Date().toISOString() };
      contractIssueStore.set(id!, updated);
      return Promise.resolve(jsonResponse(updated));
    }

    // List issues
    if (urlStr.match(/\/projects\/[^/]+\/issues(\?|$)/) && method === 'GET') {
      const items = Array.from(contractIssueStore.values());
      const url = new URL(urlStr);
      const page = Number(url.searchParams.get('page') ?? '1');
      const limit = Number(url.searchParams.get('limit') ?? '50');
      const stateFilter = url.searchParams.get('state');
      const filtered = stateFilter
        ? items.filter((i) => (i as Record<string, unknown>).state === stateFilter)
        : items;
      const start = (page - 1) * limit;
      const paged = filtered.slice(start, start + limit);
      return Promise.resolve(jsonResponse({
        items: paged,
        total: filtered.length,
        page,
        limit,
        hasMore: start + limit < filtered.length,
      }));
    }

    return Promise.resolve(jsonResponse({ message: 'Not Found' }, 404));
  });
}

createAdapterContractTests(
  'RestAdapter',
  () => {
    setupContractMocks();
    return new RestAdapter();
  },
  () => createMockConfig()
);
