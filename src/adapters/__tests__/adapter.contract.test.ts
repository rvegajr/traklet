/**
 * Adapter Contract Tests
 * These tests define the contract that ALL adapters must satisfy.
 * Run against each adapter implementation to ensure ISP compliance.
 *
 * This file exports a factory function. Import and call createAdapterContractTests()
 * from adapter-specific test files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IBackendAdapter, AdapterConfig, AdapterCapabilities } from '@/contracts';
import type { Issue, CreateIssueDTO, UpdateIssueDTO } from '@/models';

// Marker test to satisfy vitest's requirement for at least one test in the file
describe('Adapter Contract Test Factory', () => {
  it('exports createAdapterContractTests factory function', () => {
    expect(typeof createAdapterContractTests).toBe('function');
  });

  it('exports validateIssueStructure helper', () => {
    expect(typeof validateIssueStructure).toBe('function');
  });
});

/**
 * Contract test suite factory
 * Creates a test suite for any adapter implementation
 */
export function createAdapterContractTests(
  name: string,
  createAdapter: () => IBackendAdapter,
  createConfig: () => AdapterConfig,
  cleanup?: () => Promise<void>
): void {
  describe(`${name} - Adapter Contract Tests`, () => {
    let adapter: IBackendAdapter;
    let config: AdapterConfig;

    beforeEach(() => {
      adapter = createAdapter();
      config = createConfig();
    });

    afterEach(async () => {
      if (adapter.isConnected()) {
        await adapter.disconnect();
      }
      if (cleanup) {
        await cleanup();
      }
    });

    describe('ICapabilityProvider', () => {
      it('should return capabilities object', () => {
        const capabilities = adapter.getCapabilities();

        expect(capabilities).toBeDefined();
        expect(typeof capabilities.canDeleteIssues).toBe('boolean');
        expect(typeof capabilities.hasAttachments).toBe('boolean');
        expect(typeof capabilities.hasPriority).toBe('boolean');
        expect(typeof capabilities.hasLabels).toBe('boolean');
        expect(typeof capabilities.hasAssignees).toBe('boolean');
        expect(typeof capabilities.hasComments).toBe('boolean');
        expect(typeof capabilities.hasSearch).toBe('boolean');
        expect(typeof capabilities.maxAttachmentSize).toBe('number');
        expect(Array.isArray(capabilities.allowedMimeTypes)).toBe(true);
      });

      it('should check individual capabilities', () => {
        const capabilities = adapter.getCapabilities();

        for (const key of Object.keys(capabilities) as (keyof AdapterCapabilities)[]) {
          const result = adapter.hasCapability(key);
          expect(typeof result).toBe('boolean');
        }
      });
    });

    describe('Connection Lifecycle', () => {
      it('should start disconnected', () => {
        expect(adapter.isConnected()).toBe(false);
      });

      it('should connect successfully with valid config', async () => {
        const result = await adapter.connect(config);

        expect(result.success).toBe(true);
        expect(adapter.isConnected()).toBe(true);
      });

      it('should return projects after connecting', async () => {
        const result = await adapter.connect(config);

        expect(result.success).toBe(true);
        expect(result.projects).toBeDefined();
        expect(Array.isArray(result.projects)).toBe(true);
      });

      it('should disconnect successfully', async () => {
        await adapter.connect(config);
        await adapter.disconnect();

        expect(adapter.isConnected()).toBe(false);
      });

      it('should handle multiple connect calls gracefully', async () => {
        await adapter.connect(config);
        const result = await adapter.connect(config);

        expect(result.success).toBe(true);
        expect(adapter.isConnected()).toBe(true);
      });

      it('should handle disconnect when already disconnected', async () => {
        await expect(adapter.disconnect()).resolves.not.toThrow();
      });
    });

    describe('Token Management', () => {
      it('should return token after connecting', async () => {
        await adapter.connect(config);

        const token = await adapter.getToken();
        expect(token).toBeDefined();
      });

      it('should validate token', async () => {
        await adapter.connect(config);

        const isValid = await adapter.validateToken();
        expect(typeof isValid).toBe('boolean');
      });
    });

    describe('IIssueReader', () => {
      beforeEach(async () => {
        await adapter.connect(config);
      });

      it('should get issues with empty result', async () => {
        const projectId = config.projects[0]?.id ?? '';
        const result = await adapter.getIssues(projectId);

        expect(result).toBeDefined();
        expect(Array.isArray(result.items)).toBe(true);
        expect(typeof result.total).toBe('number');
        expect(typeof result.page).toBe('number');
        expect(typeof result.limit).toBe('number');
        expect(typeof result.hasMore).toBe('boolean');
      });

      it('should support pagination parameters', async () => {
        const projectId = config.projects[0]?.id ?? '';
        const result = await adapter.getIssues(projectId, {
          page: 1,
          limit: 10,
        });

        expect(result.page).toBe(1);
        expect(result.limit).toBe(10);
      });

      it('should support state filter', async () => {
        const projectId = config.projects[0]?.id ?? '';
        const result = await adapter.getIssues(projectId, {
          state: 'open',
        });

        // All returned issues should be open
        for (const issue of result.items) {
          expect(issue.state).toBe('open');
        }
      });

      it('should check if issue exists', async () => {
        const projectId = config.projects[0]?.id ?? '';
        const exists = await adapter.issueExists(projectId, 'non-existent-id');

        expect(typeof exists).toBe('boolean');
        expect(exists).toBe(false);
      });
    });

    describe('IIssueWriter', () => {
      beforeEach(async () => {
        await adapter.connect(config);
      });

      it('should create an issue', async () => {
        const projectId = config.projects[0]?.id ?? '';
        const dto: CreateIssueDTO = {
          title: 'Test Issue',
          body: 'This is a test issue body',
        };

        const issue = await adapter.createIssue(projectId, dto);

        expect(issue).toBeDefined();
        expect(issue.id).toBeDefined();
        expect(issue.title).toBe(dto.title);
        expect(issue.body).toBe(dto.body);
        expect(issue.state).toBe('open');
        expect(issue.projectId).toBe(projectId);
      });

      it('should create issue with labels', async () => {
        const projectId = config.projects[0]?.id ?? '';
        const capabilities = adapter.getCapabilities();

        if (!capabilities.hasLabels) {
          // Skip if labels not supported
          return;
        }

        const dto: CreateIssueDTO = {
          title: 'Issue with Labels',
          body: 'Test body',
          labels: ['bug', 'priority-high'],
        };

        const issue = await adapter.createIssue(projectId, dto);

        expect(issue.labels.length).toBeGreaterThan(0);
      });

      it('should update an issue', async () => {
        const projectId = config.projects[0]?.id ?? '';

        // First create an issue
        const created = await adapter.createIssue(projectId, {
          title: 'Original Title',
          body: 'Original body',
        });

        // Then update it
        const updateDto: UpdateIssueDTO = {
          title: 'Updated Title',
          body: 'Updated body',
        };

        const updated = await adapter.updateIssue(projectId, created.id, updateDto);

        expect(updated.id).toBe(created.id);
        expect(updated.title).toBe('Updated Title');
        expect(updated.body).toBe('Updated body');
      });

      it('should close an issue via update', async () => {
        const projectId = config.projects[0]?.id ?? '';

        const created = await adapter.createIssue(projectId, {
          title: 'Issue to Close',
          body: 'Will be closed',
        });

        const closed = await adapter.updateIssue(projectId, created.id, {
          state: 'closed',
        });

        expect(closed.state).toBe('closed');
      });
    });

    describe('Issue Data Structure', () => {
      beforeEach(async () => {
        await adapter.connect(config);
      });

      it('should return properly structured issue', async () => {
        const projectId = config.projects[0]?.id ?? '';

        const issue = await adapter.createIssue(projectId, {
          title: 'Structure Test',
          body: 'Testing issue structure',
        });

        // Required fields
        expect(typeof issue.id).toBe('string');
        expect(typeof issue.number).toBe('number');
        expect(typeof issue.title).toBe('string');
        expect(typeof issue.body).toBe('string');
        expect(['open', 'closed']).toContain(issue.state);
        expect(Array.isArray(issue.labels)).toBe(true);
        expect(issue.createdBy).toBeDefined();
        expect(typeof issue.createdBy.id).toBe('string');
        expect(typeof issue.createdBy.name).toBe('string');
        expect(Array.isArray(issue.assignees)).toBe(true);
        expect(issue.createdAt).toBeInstanceOf(Date);
        expect(issue.updatedAt).toBeInstanceOf(Date);
        expect(Array.isArray(issue.attachments)).toBe(true);
        expect(typeof issue.commentCount).toBe('number');
        expect(typeof issue.projectId).toBe('string');
      });

      it('should get single issue by ID', async () => {
        const projectId = config.projects[0]?.id ?? '';

        const created = await adapter.createIssue(projectId, {
          title: 'Get Single Issue',
          body: 'Test body',
        });

        const retrieved = await adapter.getIssue(projectId, created.id);

        expect(retrieved.id).toBe(created.id);
        expect(retrieved.title).toBe(created.title);
      });
    });
  });
}

/**
 * Helper to validate issue structure
 */
export function validateIssueStructure(issue: Issue): void {
  expect(typeof issue.id).toBe('string');
  expect(issue.id.length).toBeGreaterThan(0);
  expect(typeof issue.number).toBe('number');
  expect(typeof issue.title).toBe('string');
  expect(typeof issue.body).toBe('string');
  expect(['open', 'closed']).toContain(issue.state);
  expect(Array.isArray(issue.labels)).toBe(true);
  expect(issue.createdBy).toBeDefined();
  expect(Array.isArray(issue.assignees)).toBe(true);
  expect(issue.createdAt).toBeInstanceOf(Date);
  expect(issue.updatedAt).toBeInstanceOf(Date);
  expect(Array.isArray(issue.attachments)).toBe(true);
  expect(typeof issue.commentCount).toBe('number');
  expect(typeof issue.projectId).toBe('string');
}
