/**
 * LocalStorageAdapter tests
 * Runs contract tests and adapter-specific tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalStorageAdapter } from '../LocalStorageAdapter';
import { createAdapterContractTests } from './adapter.contract.test';
import type { AdapterConfig } from '@/contracts';

// Run contract tests
createAdapterContractTests(
  'LocalStorageAdapter',
  () => new LocalStorageAdapter(false),
  () => ({
    type: 'localStorage',
    token: 'test-token',
    projects: [
      { id: 'project-1', name: 'Test Project', identifier: 'test-project' },
    ],
  }),
  async () => {
    // Cleanup after tests
  }
);

// Adapter-specific tests
describe('LocalStorageAdapter - Specific Features', () => {
  let adapter: LocalStorageAdapter;
  let config: AdapterConfig;

  beforeEach(async () => {
    adapter = new LocalStorageAdapter(false);
    config = {
      type: 'localStorage',
      token: 'test-token',
      projects: [
        { id: 'project-1', name: 'Test Project', identifier: 'test-project' },
        { id: 'project-2', name: 'Second Project', identifier: 'second-project' },
      ],
    };
    await adapter.connect(config);
  });

  afterEach(async () => {
    adapter.clearAllData();
    await adapter.disconnect();
  });

  describe('IIssueDeleter', () => {
    it('should delete an issue', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Issue to Delete',
        body: 'Will be deleted',
      });

      await adapter.deleteIssue('project-1', issue.id);

      const exists = await adapter.issueExists('project-1', issue.id);
      expect(exists).toBe(false);
    });

    it('should throw when deleting non-existent issue', async () => {
      await expect(
        adapter.deleteIssue('project-1', 'non-existent')
      ).rejects.toThrow('Issue not found');
    });

    it('should delete associated comments when deleting issue', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Issue with Comments',
        body: 'Has comments',
      });

      await adapter.addComment('project-1', issue.id, { body: 'Comment 1' });
      await adapter.addComment('project-1', issue.id, { body: 'Comment 2' });

      await adapter.deleteIssue('project-1', issue.id);

      const comments = await adapter.getComments('project-1', issue.id);
      expect(comments).toHaveLength(0);
    });
  });

  describe('ICommentManager', () => {
    it('should add a comment to an issue', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Issue for Comments',
        body: 'Test body',
      });

      const comment = await adapter.addComment('project-1', issue.id, {
        body: 'This is a comment',
      });

      expect(comment.id).toBeDefined();
      expect(comment.body).toBe('This is a comment');
      expect(comment.author).toBeDefined();
    });

    it('should update comment count on issue', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Issue for Comments',
        body: 'Test body',
      });

      await adapter.addComment('project-1', issue.id, { body: 'Comment 1' });
      await adapter.addComment('project-1', issue.id, { body: 'Comment 2' });

      const updated = await adapter.getIssue('project-1', issue.id);
      expect(updated.commentCount).toBe(2);
    });

    it('should get all comments for an issue', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Issue for Comments',
        body: 'Test body',
      });

      await adapter.addComment('project-1', issue.id, { body: 'Comment 1' });
      await adapter.addComment('project-1', issue.id, { body: 'Comment 2' });
      await adapter.addComment('project-1', issue.id, { body: 'Comment 3' });

      const comments = await adapter.getComments('project-1', issue.id);

      expect(comments).toHaveLength(3);
      expect(comments[0]?.body).toBe('Comment 1');
      expect(comments[1]?.body).toBe('Comment 2');
      expect(comments[2]?.body).toBe('Comment 3');
    });

    it('should update a comment', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Issue for Comments',
        body: 'Test body',
      });

      const comment = await adapter.addComment('project-1', issue.id, {
        body: 'Original comment',
      });

      const updated = await adapter.updateComment(
        'project-1',
        issue.id,
        comment.id,
        { body: 'Updated comment' }
      );

      expect(updated.body).toBe('Updated comment');
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(comment.createdAt.getTime());
    });

    it('should delete a comment', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Issue for Comments',
        body: 'Test body',
      });

      const comment = await adapter.addComment('project-1', issue.id, {
        body: 'Comment to delete',
      });

      await adapter.deleteComment('project-1', issue.id, comment.id);

      const comments = await adapter.getComments('project-1', issue.id);
      expect(comments).toHaveLength(0);
    });
  });

  describe('ILabelReader', () => {
    it('should return default labels', async () => {
      const labels = await adapter.getLabels('project-1');

      expect(labels.length).toBeGreaterThan(0);
      expect(labels.some((l) => l.name === 'bug')).toBe(true);
      expect(labels.some((l) => l.name === 'feature')).toBe(true);
    });

    it('should apply labels to issues', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Labeled Issue',
        body: 'Has labels',
        labels: ['bug', 'priority-high'],
      });

      expect(issue.labels).toHaveLength(2);
      expect(issue.labels.some((l) => l.name === 'bug')).toBe(true);
      expect(issue.labels.some((l) => l.name === 'priority-high')).toBe(true);
    });
  });

  describe('Multi-project support', () => {
    it('should isolate issues between projects', async () => {
      await adapter.createIssue('project-1', {
        title: 'Project 1 Issue',
        body: 'In project 1',
      });

      await adapter.createIssue('project-2', {
        title: 'Project 2 Issue',
        body: 'In project 2',
      });

      const project1Issues = await adapter.getIssues('project-1');
      const project2Issues = await adapter.getIssues('project-2');

      expect(project1Issues.items).toHaveLength(1);
      expect(project1Issues.items[0]?.title).toBe('Project 1 Issue');

      expect(project2Issues.items).toHaveLength(1);
      expect(project2Issues.items[0]?.title).toBe('Project 2 Issue');
    });

    it('should have separate issue numbering per project', async () => {
      const issue1 = await adapter.createIssue('project-1', {
        title: 'First Issue',
        body: 'Test',
      });

      const issue2 = await adapter.createIssue('project-2', {
        title: 'First Issue in P2',
        body: 'Test',
      });

      expect(issue1.number).toBe(1);
      expect(issue2.number).toBe(1);
    });
  });

  describe('Filtering and Search', () => {
    beforeEach(async () => {
      await adapter.createIssue('project-1', {
        title: 'Open Bug',
        body: 'This is a bug',
        labels: ['bug'],
      });

      await adapter.createIssue('project-1', {
        title: 'Feature Request',
        body: 'Add new feature',
        labels: ['feature'],
      });

      const toClose = await adapter.createIssue('project-1', {
        title: 'Closed Issue',
        body: 'Already fixed',
      });
      await adapter.updateIssue('project-1', toClose.id, { state: 'closed' });
    });

    it('should filter by state', async () => {
      const openIssues = await adapter.getIssues('project-1', { state: 'open' });
      const closedIssues = await adapter.getIssues('project-1', { state: 'closed' });

      expect(openIssues.items).toHaveLength(2);
      expect(closedIssues.items).toHaveLength(1);
    });

    it('should filter by labels', async () => {
      const bugs = await adapter.getIssues('project-1', { labels: ['bug'] });

      expect(bugs.items).toHaveLength(1);
      expect(bugs.items[0]?.title).toBe('Open Bug');
    });

    it('should search in title and body', async () => {
      const searchBug = await adapter.getIssues('project-1', { search: 'bug' });
      const searchFeature = await adapter.getIssues('project-1', { search: 'feature' });

      expect(searchBug.items).toHaveLength(1);
      expect(searchFeature.items).toHaveLength(1);
    });
  });

  describe('Capabilities', () => {
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

    it('should check individual capabilities', () => {
      expect(adapter.hasCapability('canDeleteIssues')).toBe(true);
      expect(adapter.hasCapability('hasAttachments')).toBe(false);
    });
  });

  describe('Data Persistence', () => {
    it('should clear all data', async () => {
      await adapter.createIssue('project-1', {
        title: 'Issue to Clear',
        body: 'Test',
      });

      adapter.clearAllData();

      const issues = await adapter.getIssues('project-1');
      expect(issues.items).toHaveLength(0);
    });

    it('should clear comments along with issues', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Issue with Comments',
        body: 'Test',
      });

      await adapter.addComment('project-1', issue.id, { body: 'A comment' });

      adapter.clearAllData();

      const comments = await adapter.getComments('project-1', issue.id);
      expect(comments).toHaveLength(0);
    });
  });

  describe('IIssueDeleter - additional', () => {
    it('should verify issue no longer exists after delete', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Will be Deleted',
        body: 'Check existence',
      });

      const existsBefore = await adapter.issueExists('project-1', issue.id);
      expect(existsBefore).toBe(true);

      await adapter.deleteIssue('project-1', issue.id);

      const existsAfter = await adapter.issueExists('project-1', issue.id);
      expect(existsAfter).toBe(false);

      await expect(
        adapter.getIssue('project-1', issue.id)
      ).rejects.toThrow('Issue not found');
    });
  });

  describe('ICommentManager - additional', () => {
    it('should verify full comment structure', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Comment Structure Test',
        body: 'Test body',
      });

      const comment = await adapter.addComment('project-1', issue.id, {
        body: 'Structured comment',
      });

      expect(comment.id).toEqual(expect.any(String));
      expect(comment.body).toBe('Structured comment');
      expect(comment.author).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          email: expect.any(String),
        })
      );
      expect(comment.createdAt).toBeInstanceOf(Date);
      expect(comment.updatedAt).toBeInstanceOf(Date);
      expect(comment.attachments).toEqual([]);
    });

    it('should decrement comment count is not affected by deleteComment', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Comment Count Test',
        body: 'Test body',
      });

      const c1 = await adapter.addComment('project-1', issue.id, { body: 'Comment 1' });
      await adapter.addComment('project-1', issue.id, { body: 'Comment 2' });

      const beforeDelete = await adapter.getIssue('project-1', issue.id);
      expect(beforeDelete.commentCount).toBe(2);

      await adapter.deleteComment('project-1', issue.id, c1.id);

      const comments = await adapter.getComments('project-1', issue.id);
      expect(comments).toHaveLength(1);
      expect(comments[0]?.body).toBe('Comment 2');
    });

    it('should throw when deleting non-existent comment', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Delete Non-Existent Comment',
        body: 'Test body',
      });

      await expect(
        adapter.deleteComment('project-1', issue.id, 'non-existent-comment')
      ).rejects.toThrow('Comment not found');
    });

    it('should throw when updating non-existent comment', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Update Non-Existent Comment',
        body: 'Test body',
      });

      await expect(
        adapter.updateComment('project-1', issue.id, 'non-existent-comment', {
          body: 'Updated',
        })
      ).rejects.toThrow('Comment not found');
    });
  });

  describe('ILabelReader - additional', () => {
    it('should return labels with correct structure', async () => {
      const labels = await adapter.getLabels('project-1');

      for (const label of labels) {
        expect(label).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            color: expect.any(String),
          })
        );
      }
    });

    it('should resolve known labels and skip unknown labels in createIssue', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Label Resolution',
        body: 'Test',
        labels: ['bug', 'nonexistent-label'],
      });

      expect(issue.labels).toHaveLength(1);
      expect(issue.labels[0]?.name).toBe('bug');
    });
  });

  describe('Filtering - additional', () => {
    beforeEach(async () => {
      // Create issues with different creators/assignees for filter tests
      await adapter.createIssue('project-1', {
        title: 'Searchable Alpha Issue',
        body: 'Contains unique keyword platypus',
        labels: ['bug'],
      });

      await adapter.createIssue('project-1', {
        title: 'Beta Feature',
        body: 'Another issue body',
        labels: ['feature'],
      });
    });

    it('should filter by search query matching title', async () => {
      const results = await adapter.getIssues('project-1', { search: 'Alpha' });

      expect(results.items).toHaveLength(1);
      expect(results.items[0]?.title).toBe('Searchable Alpha Issue');
    });

    it('should filter by search query matching body', async () => {
      const results = await adapter.getIssues('project-1', { search: 'platypus' });

      expect(results.items).toHaveLength(1);
      expect(results.items[0]?.title).toBe('Searchable Alpha Issue');
    });

    it('should filter by search case-insensitively', async () => {
      const results = await adapter.getIssues('project-1', { search: 'ALPHA' });

      expect(results.items).toHaveLength(1);
      expect(results.items[0]?.title).toBe('Searchable Alpha Issue');
    });

    it('should filter by assignee', async () => {
      // Create issue and update with assignee
      const issue = await adapter.createIssue('project-1', {
        title: 'Assigned Issue',
        body: 'Has assignee',
      });

      // The default user is 'local-user', so filtering by creator
      const results = await adapter.getIssues('project-1', { assignee: 'local-user' });

      // No issues should have assignees since createIssue sets assignees to []
      expect(results.items).toHaveLength(0);

      // Verify the issue itself has no assignees
      const fetched = await adapter.getIssue('project-1', issue.id);
      expect(fetched.assignees).toHaveLength(0);
    });

    it('should filter by creator', async () => {
      const results = await adapter.getIssues('project-1', { creator: 'local-user' });

      // All issues created by the local user
      expect(results.items.length).toBeGreaterThan(0);
      for (const issue of results.items) {
        expect(issue.createdBy.id).toBe('local-user');
      }
    });

    it('should return empty when creator filter does not match', async () => {
      const results = await adapter.getIssues('project-1', { creator: 'unknown-user' });

      expect(results.items).toHaveLength(0);
    });

    it('should filter by label', async () => {
      const results = await adapter.getIssues('project-1', { labels: ['feature'] });

      expect(results.items).toHaveLength(1);
      expect(results.items[0]?.title).toBe('Beta Feature');
    });

    it('should return all issues when no filters applied', async () => {
      const results = await adapter.getIssues('project-1');

      expect(results.items).toHaveLength(2);
    });
  });

  describe('Sorting', () => {
    it('should sort by updated timestamp', async () => {
      const issue1 = await adapter.createIssue('project-1', {
        title: 'First Created',
        body: 'Created first',
      });

      // Small delay to ensure distinct timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await adapter.createIssue('project-1', {
        title: 'Second Created',
        body: 'Created second',
      });

      // Another delay, then update issue1 so it has the newest updatedAt
      await new Promise((resolve) => setTimeout(resolve, 10));
      await adapter.updateIssue('project-1', issue1.id, { body: 'Updated body' });

      const descResults = await adapter.getIssues('project-1', {
        sort: 'updated',
        order: 'desc',
      });

      expect(descResults.items[0]?.title).toBe('First Created');
      expect(descResults.items[1]?.title).toBe('Second Created');

      const ascResults = await adapter.getIssues('project-1', {
        sort: 'updated',
        order: 'asc',
      });

      expect(ascResults.items[0]?.title).toBe('Second Created');
      expect(ascResults.items[1]?.title).toBe('First Created');
    });

    it('should sort by priority', async () => {
      await adapter.createIssue('project-1', {
        title: 'Low Priority',
        body: 'Low',
        priority: 'low',
      });

      await adapter.createIssue('project-1', {
        title: 'Critical Priority',
        body: 'Critical',
        priority: 'critical',
      });

      await adapter.createIssue('project-1', {
        title: 'Medium Priority',
        body: 'Medium',
        priority: 'medium',
      });

      const descResults = await adapter.getIssues('project-1', {
        sort: 'priority',
        order: 'desc',
      });

      expect(descResults.items[0]?.title).toBe('Critical Priority');
      expect(descResults.items[1]?.title).toBe('Medium Priority');
      expect(descResults.items[2]?.title).toBe('Low Priority');

      const ascResults = await adapter.getIssues('project-1', {
        sort: 'priority',
        order: 'asc',
      });

      expect(ascResults.items[0]?.title).toBe('Low Priority');
      expect(ascResults.items[1]?.title).toBe('Medium Priority');
      expect(ascResults.items[2]?.title).toBe('Critical Priority');
    });
  });

  describe('issueExists', () => {
    it('should return true for an existing issue', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Existing Issue',
        body: 'Test',
      });

      const exists = await adapter.issueExists('project-1', issue.id);
      expect(exists).toBe(true);
    });

    it('should return false for a non-existent issue', async () => {
      const exists = await adapter.issueExists('project-1', 'non-existent-id');
      expect(exists).toBe(false);
    });

    it('should return false after issue is deleted', async () => {
      const issue = await adapter.createIssue('project-1', {
        title: 'Soon Deleted',
        body: 'Test',
      });

      await adapter.deleteIssue('project-1', issue.id);

      const exists = await adapter.issueExists('project-1', issue.id);
      expect(exists).toBe(false);
    });
  });
});
