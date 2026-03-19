/**
 * AzureDevOpsAdapter Unit Tests
 * Tests the adapter against mocked Azure DevOps REST API responses
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AzureDevOpsAdapter } from '../AzureDevOpsAdapter';
import type { AdapterConfig } from '@/contracts';
import { createAdapterContractTests } from './adapter.contract.test';

interface AdoWorkItem {
  readonly id: number;
  readonly rev: number;
  readonly fields: Record<string, unknown>;
  readonly url: string;
}

interface JsonPatchOperation {
  readonly op: string;
  readonly path: string;
  readonly value?: unknown;
}

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockConfig(): AdapterConfig {
  return {
    type: 'azure-devops',
    token: 'test-pat-token',
    baseUrl: 'https://dev.azure.com/testorg',
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
  id: 'project-guid',
  name: 'test-project',
  description: 'A test project',
};

const MOCK_WORK_ITEM = {
  id: 1,
  rev: 1,
  fields: {
    'System.Id': 1,
    'System.Title': 'Test Issue',
    'System.Description': 'Test description',
    'System.State': 'New',
    'System.WorkItemType': 'Issue',
    'System.CreatedBy': {
      displayName: 'Test User',
      uniqueName: 'test@example.com',
      id: 'user-guid',
    },
    'System.CreatedDate': '2026-03-01T00:00:00Z',
    'System.ChangedDate': '2026-03-01T00:00:00Z',
    'System.Tags': 'bug; test-case',
    'System.CommentCount': 0,
    'System.AreaPath': 'test-project',
    'System.IterationPath': 'test-project\\Sprint 1',
    'Microsoft.VSTS.Common.Priority': 2,
  },
  url: 'https://dev.azure.com/testorg/test-project/_apis/wit/workitems/1',
};

const MOCK_WORK_ITEM_TYPE = {
  states: [
    { name: 'To Do', category: 'Proposed' },
    { name: 'Doing', category: 'InProgress' },
    { name: 'Done', category: 'Completed' },
  ],
};

function setupConnectMock(): void {
  mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_PROJECT));
  mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_WORK_ITEM_TYPE));
}

describe('AzureDevOpsAdapter', () => {
  let adapter: AzureDevOpsAdapter;
  let config: AdapterConfig;

  beforeEach(() => {
    adapter = new AzureDevOpsAdapter();
    config = createMockConfig();
    mockFetch.mockReset();
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  describe('Type and Capabilities', () => {
    it('should have type azure-devops', () => {
      expect(adapter.type).toBe('azure-devops');
    });

    it('should declare correct capabilities', () => {
      const caps = adapter.getCapabilities();
      expect(caps.canDeleteIssues).toBe(true);
      expect(caps.hasAttachments).toBe(true);
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
      expect(result.projects?.[0]?.name).toBe('test-project');
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

    it('should fail when project does not exist', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: 'Project not found' }, 404)
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
  });

  describe('getIssues', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should return empty result when no work items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ workItems: [] }));

      const result = await adapter.getIssues('test-project');
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should return mapped issues', async () => {
      // WIQL query
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ workItems: [{ id: 1, url: '' }] })
      );
      // Batch get
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ value: [MOCK_WORK_ITEM] })
      );

      const result = await adapter.getIssues('test-project');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);

      const issue = result.items[0]!;
      expect(issue.id).toBe('1');
      expect(issue.number).toBe(1);
      expect(issue.title).toBe('Test Issue');
      expect(issue.body).toBe('Test description');
      expect(issue.state).toBe('open');
      expect(issue.priority).toBe('high');
      expect(issue.labels).toHaveLength(2);
      expect(issue.labels[0]?.name).toBe('bug');
      expect(issue.labels[1]?.name).toBe('test-case');
      expect(issue.createdBy.name).toBe('Test User');
      expect(issue.createdBy.email).toBe('test@example.com');
      expect(issue.projectId).toBe('test-project');
    });

    it('should filter by state=open', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ workItems: [{ id: 1, url: '' }] })
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ value: [MOCK_WORK_ITEM] })
      );

      await adapter.getIssues('test-project', { state: 'open' });

      const wiqlCall = mockFetch.mock.calls[2]!;
      const body = JSON.parse(wiqlCall[1]?.body as string);
      expect(body.query).toContain(`[System.State] <> 'Closed'`);
    });

    it('should filter by labels', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ workItems: [] })
      );

      await adapter.getIssues('test-project', { labels: ['bug', 'test-case'] });

      const wiqlCall = mockFetch.mock.calls[2]!;
      const body = JSON.parse(wiqlCall[1]?.body as string);
      expect(body.query).toContain(`[System.Tags] Contains 'bug'`);
      expect(body.query).toContain(`[System.Tags] Contains 'test-case'`);
    });

    it('should paginate results', async () => {
      const workItemRefs = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        url: '',
      }));

      mockFetch.mockResolvedValueOnce(
        jsonResponse({ workItems: workItemRefs })
      );

      const batchItems = Array.from({ length: 10 }, (_, i) => ({
        ...MOCK_WORK_ITEM,
        id: i + 11,
        fields: { ...MOCK_WORK_ITEM.fields, 'System.Id': i + 11 },
      }));

      mockFetch.mockResolvedValueOnce(
        jsonResponse({ value: batchItems })
      );

      const result = await adapter.getIssues('test-project', { page: 2, limit: 10 });
      expect(result.total).toBe(25);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('getIssue', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should fetch and map a single work item', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_WORK_ITEM));

      const issue = await adapter.getIssue('test-project', '1');
      expect(issue.id).toBe('1');
      expect(issue.title).toBe('Test Issue');
      expect(issue.metadata?.['workItemType']).toBe('Issue');
    });

    it('should throw when work item not found', async () => {
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

    it('should return true for existing work item', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_WORK_ITEM));
      expect(await adapter.issueExists('test-project', '1')).toBe(true);
    });

    it('should return false for non-existing work item', async () => {
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

    it('should create a work item with JSON Patch', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_WORK_ITEM));

      const issue = await adapter.createIssue('test-project', {
        title: 'New Issue',
        body: 'Issue body',
        labels: ['bug'],
        priority: 'high',
      });

      expect(issue.id).toBe('1');

      const createCall = mockFetch.mock.calls[2]!;
      expect(createCall[1]?.method).toBe('POST');
      expect(createCall[1]?.headers?.['Content-Type']).toBe('application/json-patch+json');

      const patchOps = JSON.parse(createCall[1]?.body as string);
      expect(patchOps).toContainEqual({
        op: 'add',
        path: '/fields/System.Title',
        value: 'New Issue',
      });
      expect(patchOps).toContainEqual({
        op: 'add',
        path: '/fields/System.Tags',
        value: 'bug',
      });
      expect(patchOps).toContainEqual({
        op: 'add',
        path: '/fields/Microsoft.VSTS.Common.Priority',
        value: 2,
      });
    });

    it('should create without optional fields', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_WORK_ITEM));

      await adapter.createIssue('test-project', {
        title: 'Minimal Issue',
        body: 'Just title and body',
      });

      const patchOps = JSON.parse(mockFetch.mock.calls[2]![1]?.body as string);
      expect(patchOps).toHaveLength(2); // Only title and description
    });
  });

  describe('updateIssue', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should update fields via JSON Patch', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        ...MOCK_WORK_ITEM,
        fields: { ...MOCK_WORK_ITEM.fields, 'System.Title': 'Updated Title' },
      }));

      const issue = await adapter.updateIssue('test-project', '1', {
        title: 'Updated Title',
        state: 'closed',
      });

      const patchOps = JSON.parse(mockFetch.mock.calls[2]![1]?.body as string);
      expect(patchOps).toContainEqual({
        op: 'replace',
        path: '/fields/System.Title',
        value: 'Updated Title',
      });
      expect(patchOps).toContainEqual({
        op: 'replace',
        path: '/fields/System.State',
        value: 'Done', // Resolved from cached states: To Do / Doing / Done
      });
    });

    it('should return current issue when no updates provided', async () => {
      // Should call getIssue instead of PATCH
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_WORK_ITEM));

      const issue = await adapter.updateIssue('test-project', '1', {});
      expect(issue.title).toBe('Test Issue');
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

      const deleteCall = mockFetch.mock.calls[2]!;
      expect(deleteCall[1]?.method).toBe('DELETE');
      expect(deleteCall[0]).toContain('/workitems/1');
    });
  });

  describe('Comments', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    const MOCK_COMMENT = {
      id: 42,
      text: 'This is a comment',
      createdBy: {
        displayName: 'Commenter',
        uniqueName: 'commenter@example.com',
        id: 'commenter-guid',
      },
      createdDate: '2026-03-01T12:00:00Z',
      modifiedBy: {
        displayName: 'Commenter',
        uniqueName: 'commenter@example.com',
        id: 'commenter-guid',
      },
      modifiedDate: '2026-03-01T12:00:00Z',
    };

    it('should get comments', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ comments: [MOCK_COMMENT], totalCount: 1 })
      );

      const comments = await adapter.getComments('test-project', '1');
      expect(comments).toHaveLength(1);
      expect(comments[0]?.id).toBe('42');
      expect(comments[0]?.body).toBe('This is a comment');
      expect(comments[0]?.author.name).toBe('Commenter');
    });

    it('should add a comment', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(MOCK_COMMENT));

      const comment = await adapter.addComment('test-project', '1', {
        body: 'New comment',
      });

      expect(comment.id).toBe('42');
      const addCall = mockFetch.mock.calls[2]!;
      expect(addCall[1]?.method).toBe('POST');
      expect(JSON.parse(addCall[1]?.body as string)).toEqual({ text: 'New comment' });
    });

    it('should update a comment', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ ...MOCK_COMMENT, text: 'Updated comment' })
      );

      const comment = await adapter.updateComment('test-project', '1', '42', {
        body: 'Updated comment',
      });

      expect(comment.body).toBe('Updated comment');
      const updateCall = mockFetch.mock.calls[2]!;
      expect(updateCall[1]?.method).toBe('PATCH');
    });

    it('should delete a comment', async () => {
      mockFetch.mockResolvedValueOnce(emptyResponse());

      await adapter.deleteComment('test-project', '1', '42');

      const deleteCall = mockFetch.mock.calls[2]!;
      expect(deleteCall[1]?.method).toBe('DELETE');
      expect(deleteCall[0]).toContain('/comments/42');
    });
  });

  describe('Labels (Tags)', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it('should extract unique tags from work items', async () => {
      // WIQL for tagged items
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ workItems: [{ id: 1, url: '' }, { id: 2, url: '' }] })
      );
      // Batch get with tags
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          value: [
            { id: 1, fields: { 'System.Tags': 'bug; test-case' } },
            { id: 2, fields: { 'System.Tags': 'bug; feature' } },
          ],
        })
      );

      const labels = await adapter.getLabels('test-project');
      expect(labels).toHaveLength(3); // bug, feature, test-case (sorted)
      expect(labels.map((l) => l.name)).toEqual(['bug', 'feature', 'test-case']);
    });

    it('should return empty when no tagged items', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ workItems: [] }));

      const labels = await adapter.getLabels('test-project');
      expect(labels).toHaveLength(0);
    });
  });

  describe('Priority Mapping', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it.each([
      [1, 'critical'],
      [2, 'high'],
      [3, 'medium'],
      [4, 'low'],
    ])('should map ADO priority %d to %s', async (adoPriority, expected) => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ...MOCK_WORK_ITEM,
          fields: {
            ...MOCK_WORK_ITEM.fields,
            'Microsoft.VSTS.Common.Priority': adoPriority,
          },
        })
      );

      const issue = await adapter.getIssue('test-project', '1');
      expect(issue.priority).toBe(expected);
    });
  });

  describe('State Mapping', () => {
    beforeEach(async () => {
      setupConnectMock();
      await adapter.connect(config);
    });

    it.each([
      ['New', 'open'],
      ['Active', 'open'],
      ['Closed', 'closed'],
      ['Done', 'closed'],
      ['Resolved', 'closed'],
      ['Removed', 'closed'],
    ])('should map ADO state %s to %s', async (adoState, expected) => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ...MOCK_WORK_ITEM,
          fields: { ...MOCK_WORK_ITEM.fields, 'System.State': adoState },
        })
      );

      const issue = await adapter.getIssue('test-project', '1');
      expect(issue.state).toBe(expected);
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

// Run the shared contract tests against AzureDevOpsAdapter with mocks.
// Set up a persistent mock implementation that handles all ADO API patterns.
let contractWorkItemCounter = 0;
const contractWorkItemStore = new Map<number, AdoWorkItem>();

function setupContractMocks(): void {
  contractWorkItemCounter = 0;
  contractWorkItemStore.clear();

  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    const urlStr = String(url);

    // Project info
    if (urlStr.includes('/_apis/projects/')) {
      return Promise.resolve(jsonResponse(MOCK_PROJECT));
    }

    // Work item type (states cache during connect)
    if (urlStr.includes('/_apis/wit/workitemtypes/')) {
      return Promise.resolve(jsonResponse({
        states: [
          { name: 'To Do', category: 'Proposed' },
          { name: 'Doing', category: 'InProgress' },
          { name: 'Done', category: 'Completed' },
        ],
      }));
    }

    // Connection data (validateToken)
    if (urlStr.includes('/_apis/connectionData')) {
      return Promise.resolve(jsonResponse({ authenticatedUser: { id: 'user-guid' } }));
    }

    // WIQL query
    if (urlStr.includes('/_apis/wit/wiql')) {
      return Promise.resolve(jsonResponse({ workItems: [] }));
    }

    // Create work item
    if (urlStr.includes('/_apis/wit/workitems/$') && init?.method === 'POST') {
      contractWorkItemCounter++;
      const body = JSON.parse(init.body as string) as JsonPatchOperation[];
      const title = body.find((op) => op.path.includes('System.Title'))?.value ?? 'Untitled';
      const description =
        body.find((op) => op.path.includes('System.Description'))?.value ?? '';
      const tags = body.find((op) => op.path.includes('System.Tags'))?.value ?? '';
      const priority =
        body.find((op) => op.path.includes('Priority'))?.value ?? 3;

      const wi: AdoWorkItem = {
        id: contractWorkItemCounter,
        rev: 1,
        fields: {
          ...MOCK_WORK_ITEM.fields,
          'System.Id': contractWorkItemCounter,
          'System.Title': title,
          'System.Description': description,
          'System.State': 'New',
          'System.Tags': tags,
          'Microsoft.VSTS.Common.Priority': priority,
        },
        url: `https://dev.azure.com/testorg/test-project/_apis/wit/workitems/${contractWorkItemCounter}`,
      };
      contractWorkItemStore.set(contractWorkItemCounter, wi);
      return Promise.resolve(jsonResponse(wi));
    }

    // Update work item (PATCH)
    if (urlStr.match(/\/workitems\/\d+/) && init?.method === 'PATCH') {
      const idMatch = urlStr.match(/\/workitems\/(\d+)/);
      const id = idMatch ? Number(idMatch[1]) : 1;
      const body = JSON.parse(init.body as string) as JsonPatchOperation[];
      const existing = contractWorkItemStore.get(id);
      const stateOp = body.find((op) => op.path.includes('System.State'));
      const titleOp = body.find((op) => op.path.includes('System.Title'));
      const bodyOp = body.find((op) => op.path.includes('System.Description'));

      const wi: AdoWorkItem = {
        id,
        rev: (existing?.rev ?? 1) + 1,
        fields: {
          ...(existing?.fields ?? MOCK_WORK_ITEM.fields),
          'System.Id': id,
          'System.Title':
            (titleOp?.value as string) ??
            (existing?.fields['System.Title'] as string) ??
            MOCK_WORK_ITEM.fields['System.Title'],
          'System.Description':
            (bodyOp?.value as string) ??
            (existing?.fields['System.Description'] as string) ??
            MOCK_WORK_ITEM.fields['System.Description'],
          'System.State':
            (stateOp?.value as string) ??
            (existing?.fields['System.State'] as string) ??
            MOCK_WORK_ITEM.fields['System.State'],
        },
        url: `https://dev.azure.com/testorg/test-project/_apis/wit/workitems/${id}`,
      };
      contractWorkItemStore.set(id, wi);
      return Promise.resolve(jsonResponse(wi));
    }

    // Get single work item
    if (urlStr.match(/\/workitems\/\d+/) && (!init?.method || init.method === 'GET')) {
      const idMatch = urlStr.match(/\/workitems\/(\d+)/);
      const id = idMatch ? Number(idMatch[1]) : 1;
      const stored = contractWorkItemStore.get(id);
      if (stored) {
        return Promise.resolve(jsonResponse(stored));
      }
      return Promise.resolve(jsonResponse({ message: 'Not Found' }, 404));
    }

    // Batch get work items
    if (urlStr.includes('/workitems?ids=')) {
      const idsParam = new URL(urlStr).searchParams.get('ids') ?? '';
      const ids = idsParam.split(',').map(Number);
      const value = ids
        .map((id) => contractWorkItemStore.get(id))
        .filter((wi): wi is AdoWorkItem => wi !== undefined);
      return Promise.resolve(jsonResponse({ value }));
    }

    return Promise.resolve(jsonResponse({ message: 'Not Found' }, 404));
  });
}

createAdapterContractTests(
  'AzureDevOpsAdapter',
  () => {
    setupContractMocks();
    return new AzureDevOpsAdapter();
  },
  () => createMockConfig()
);
