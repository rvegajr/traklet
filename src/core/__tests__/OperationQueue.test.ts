/**
 * OperationQueue tests - TDD: RED -> GREEN -> REFACTOR
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OperationQueue,
  getOperationQueue,
  resetOperationQueue,
} from '../OperationQueue';
import type { QueuedOperation, OperationType, SyncResult } from '../OperationQueue';
import type { IBackendAdapter } from '@contracts/IBackendAdapter';
import type { ICommentWriter, ICommentDeleter } from '@contracts/ICommentManager';
import type { IIssueDeleter } from '@contracts/IIssueDeleter';

// Minimal mock adapter that satisfies the interfaces we need
function createMockAdapter(): IBackendAdapter & ICommentWriter & ICommentDeleter & IIssueDeleter {
  return {
    type: 'localStorage' as const,
    connect: vi.fn().mockResolvedValue({ success: true }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    getToken: vi.fn().mockResolvedValue('token'),
    validateToken: vi.fn().mockResolvedValue(true),
    getCapabilities: vi.fn().mockReturnValue({}),
    getIssues: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, hasMore: false }),
    getIssue: vi.fn().mockResolvedValue(null),
    createIssue: vi.fn().mockResolvedValue({ id: 'new-1', title: 'Created' }),
    updateIssue: vi.fn().mockResolvedValue({ id: '1', title: 'Updated' }),
    deleteIssue: vi.fn().mockResolvedValue(undefined),
    addComment: vi.fn().mockResolvedValue({ id: 'c1', body: 'Comment' }),
    updateComment: vi.fn().mockResolvedValue({ id: 'c1', body: 'Updated' }),
    deleteComment: vi.fn().mockResolvedValue(undefined),
  };
}

describe('OperationQueue', () => {
  let queue: OperationQueue;

  beforeEach(() => {
    resetOperationQueue();
    queue = new OperationQueue();
  });

  afterEach(() => {
    queue.destroy();
    resetOperationQueue();
  });

  describe('enqueue()', () => {
    it('should add an operation to the queue and return an id', async () => {
      const id = await queue.enqueue({
        type: 'CREATE_ISSUE',
        projectId: 'proj-1',
        payload: { title: 'Test', body: 'Body' },
        timestamp: Date.now(),
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should set correct default fields on queued operation', async () => {
      const now = Date.now();
      const id = await queue.enqueue({
        type: 'UPDATE_ISSUE',
        projectId: 'proj-1',
        payload: { issueId: '1', updates: { title: 'New Title' } },
        timestamp: now,
      });

      const pending = queue.getPending();
      const op = pending.find((o) => o.id === id);
      expect(op).toBeDefined();
      expect(op!.type).toBe('UPDATE_ISSUE');
      expect(op!.projectId).toBe('proj-1');
      expect(op!.timestamp).toBe(now);
      expect(op!.retries).toBe(0);
      expect(op!.status).toBe('pending');
    });
  });

  describe('getPending()', () => {
    it('should return empty array when no operations queued', () => {
      expect(queue.getPending()).toEqual([]);
    });

    it('should return all pending operations in order', async () => {
      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: { title: 'A', body: '' }, timestamp: 1 });
      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: { title: 'B', body: '' }, timestamp: 2 });
      await queue.enqueue({ type: 'DELETE_ISSUE', projectId: 'p1', payload: { issueId: '3' }, timestamp: 3 });

      const pending = queue.getPending();
      expect(pending).toHaveLength(3);
      expect(pending[0]!.timestamp).toBe(1);
      expect(pending[1]!.timestamp).toBe(2);
      expect(pending[2]!.timestamp).toBe(3);
    });
  });

  describe('getCount()', () => {
    it('should return 0 when empty', () => {
      expect(queue.getCount()).toBe(0);
    });

    it('should return number of pending operations', async () => {
      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: {}, timestamp: 1 });
      await queue.enqueue({ type: 'ADD_COMMENT', projectId: 'p1', payload: {}, timestamp: 2 });

      expect(queue.getCount()).toBe(2);
    });
  });

  describe('Operation structure', () => {
    it('should have all required fields', async () => {
      await queue.enqueue({
        type: 'ADD_COMMENT',
        projectId: 'proj-2',
        payload: { issueId: '5', body: 'Hello' },
        timestamp: 1234567890,
      });

      const op = queue.getPending()[0]!;
      expect(op).toMatchObject({
        id: expect.any(String),
        type: 'ADD_COMMENT',
        projectId: 'proj-2',
        payload: { issueId: '5', body: 'Hello' },
        timestamp: 1234567890,
        retries: 0,
        status: 'pending',
      });
    });

    it('should support all operation types', async () => {
      const types: OperationType[] = [
        'CREATE_ISSUE', 'UPDATE_ISSUE', 'DELETE_ISSUE',
        'ADD_COMMENT', 'UPDATE_COMMENT', 'DELETE_COMMENT',
      ];

      for (const type of types) {
        await queue.enqueue({ type, projectId: 'p1', payload: {}, timestamp: Date.now() });
      }

      expect(queue.getCount()).toBe(6);
      const pendingTypes = queue.getPending().map((o) => o.type);
      expect(pendingTypes).toEqual(types);
    });
  });

  describe('sync()', () => {
    it('should process pending operations in order', async () => {
      const adapter = createMockAdapter();
      queue.setAdapter(adapter);

      await queue.enqueue({
        type: 'CREATE_ISSUE',
        projectId: 'p1',
        payload: { dto: { title: 'First', body: 'Body1' } },
        timestamp: 1,
      });
      await queue.enqueue({
        type: 'CREATE_ISSUE',
        projectId: 'p1',
        payload: { dto: { title: 'Second', body: 'Body2' } },
        timestamp: 2,
      });

      const result = await queue.sync();

      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);

      // Verify order
      const calls = (adapter.createIssue as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]).toEqual(['p1', { title: 'First', body: 'Body1' }]);
      expect(calls[1]).toEqual(['p1', { title: 'Second', body: 'Body2' }]);
    });

    it('should call the appropriate adapter method for each operation type', async () => {
      const adapter = createMockAdapter();
      queue.setAdapter(adapter);

      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: { dto: { title: 'T', body: 'B' } }, timestamp: 1 });
      await queue.enqueue({ type: 'UPDATE_ISSUE', projectId: 'p1', payload: { issueId: '1', dto: { title: 'U' } }, timestamp: 2 });
      await queue.enqueue({ type: 'DELETE_ISSUE', projectId: 'p1', payload: { issueId: '2' }, timestamp: 3 });
      await queue.enqueue({ type: 'ADD_COMMENT', projectId: 'p1', payload: { issueId: '3', dto: { body: 'C' } }, timestamp: 4 });
      await queue.enqueue({ type: 'UPDATE_COMMENT', projectId: 'p1', payload: { issueId: '3', commentId: 'c1', dto: { body: 'UC' } }, timestamp: 5 });
      await queue.enqueue({ type: 'DELETE_COMMENT', projectId: 'p1', payload: { issueId: '3', commentId: 'c2' }, timestamp: 6 });

      await queue.sync();

      expect(adapter.createIssue).toHaveBeenCalledWith('p1', { title: 'T', body: 'B' });
      expect(adapter.updateIssue).toHaveBeenCalledWith('p1', '1', { title: 'U' });
      expect(adapter.deleteIssue).toHaveBeenCalledWith('p1', '2');
      expect(adapter.addComment).toHaveBeenCalledWith('p1', '3', { body: 'C' });
      expect(adapter.updateComment).toHaveBeenCalledWith('p1', '3', 'c1', { body: 'UC' });
      expect(adapter.deleteComment).toHaveBeenCalledWith('p1', '3', 'c2');
    });

    it('should remove successful operations from the queue', async () => {
      const adapter = createMockAdapter();
      queue.setAdapter(adapter);

      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: { dto: { title: 'T', body: 'B' } }, timestamp: 1 });

      expect(queue.getCount()).toBe(1);
      await queue.sync();
      expect(queue.getCount()).toBe(0);
    });

    it('should mark failed operations with incremented retry count', async () => {
      const adapter = createMockAdapter();
      (adapter.createIssue as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
      queue.setAdapter(adapter);

      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: { dto: { title: 'T', body: 'B' } }, timestamp: 1 });

      const result = await queue.sync();

      expect(result.failed).toBe(1);
      const pending = queue.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.retries).toBe(1);
      expect(pending[0]!.status).toBe('failed');
    });

    it('should discard operations that exceed maxRetries', async () => {
      const adapter = createMockAdapter();
      (adapter.createIssue as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Permanent failure'));
      queue.setAdapter(adapter);

      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: { dto: { title: 'T', body: 'B' } }, timestamp: 1 });

      // Sync 3 times (maxRetries default = 3)
      await queue.sync();
      expect(queue.getCount()).toBe(1);
      expect(queue.getPending()[0]!.retries).toBe(1);

      await queue.sync();
      expect(queue.getCount()).toBe(1);
      expect(queue.getPending()[0]!.retries).toBe(2);

      await queue.sync();
      // After 3rd failure, operation should be discarded
      expect(queue.getCount()).toBe(0);
    });

    it('should return correct SyncResult', async () => {
      const adapter = createMockAdapter();
      (adapter.createIssue as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ id: '1' })
        .mockRejectedValueOnce(new Error('fail'));
      queue.setAdapter(adapter);

      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: { dto: { title: 'OK', body: '' } }, timestamp: 1 });
      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: { dto: { title: 'FAIL', body: '' } }, timestamp: 2 });

      const result = await queue.sync();

      expect(result).toEqual({ processed: 2, succeeded: 1, failed: 1 });
    });

    it('should return zeros when queue is empty', async () => {
      const adapter = createMockAdapter();
      queue.setAdapter(adapter);

      const result = await queue.sync();
      expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    });

    it('should throw if no adapter is set', async () => {
      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: {}, timestamp: 1 });
      await expect(queue.sync()).rejects.toThrow('No adapter set');
    });
  });

  describe('clear()', () => {
    it('should remove all operations', async () => {
      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: {}, timestamp: 1 });
      await queue.enqueue({ type: 'DELETE_ISSUE', projectId: 'p1', payload: {}, timestamp: 2 });

      expect(queue.getCount()).toBe(2);
      queue.clear();
      expect(queue.getCount()).toBe(0);
      expect(queue.getPending()).toEqual([]);
    });
  });

  describe('online/offline detection', () => {
    it('should detect navigator.onLine status', () => {
      // jsdom defaults navigator.onLine to true
      expect(queue.isOnline()).toBe(true);
    });

    it('should auto-sync when coming back online', async () => {
      const adapter = createMockAdapter();
      queue.setAdapter(adapter);

      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: { dto: { title: 'T', body: '' } }, timestamp: 1 });

      // Simulate going online
      const syncSpy = vi.spyOn(queue, 'sync');
      window.dispatchEvent(new Event('online'));

      // Give the event handler time to fire
      await vi.waitFor(() => {
        expect(syncSpy).toHaveBeenCalled();
      });
    });

    it('should listen for offline events', () => {
      const listenerSpy = vi.spyOn(window, 'addEventListener');
      const q = new OperationQueue();

      // Check that online/offline listeners were registered
      const eventTypes = listenerSpy.mock.calls.map((c) => c[0]);
      expect(eventTypes).toContain('online');
      expect(eventTypes).toContain('offline');

      q.destroy();
      listenerSpy.mockRestore();
    });
  });

  describe('singleton', () => {
    it('getOperationQueue returns same instance', () => {
      const a = getOperationQueue();
      const b = getOperationQueue();
      expect(a).toBe(b);
      a.destroy();
    });

    it('resetOperationQueue creates fresh instance', () => {
      const a = getOperationQueue();
      resetOperationQueue();
      const b = getOperationQueue();
      expect(a).not.toBe(b);
      b.destroy();
    });
  });

  describe('subscribe()', () => {
    it('should notify subscribers on enqueue', async () => {
      const callback = vi.fn();
      queue.subscribe(callback);

      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: {}, timestamp: 1 });

      expect(callback).toHaveBeenCalledWith(queue.getPending());
    });

    it('should notify subscribers on sync completion', async () => {
      const adapter = createMockAdapter();
      queue.setAdapter(adapter);
      const callback = vi.fn();

      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: { dto: { title: 'T', body: '' } }, timestamp: 1 });
      queue.subscribe(callback);

      await queue.sync();

      expect(callback).toHaveBeenCalled();
    });

    it('should return an unsubscribe function', async () => {
      const callback = vi.fn();
      const unsub = queue.subscribe(callback);

      unsub();
      await queue.enqueue({ type: 'CREATE_ISSUE', projectId: 'p1', payload: {}, timestamp: 1 });

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
