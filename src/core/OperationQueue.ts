/**
 * OperationQueue - Offline-first operation queue for Traklet
 * Queues write operations when offline and syncs when back online.
 * Stores operations in memory with optional IndexedDB persistence.
 */

import type { IBackendAdapter } from '@contracts/IBackendAdapter';
import type { IIssueDeleter } from '@contracts/IIssueDeleter';
import type { ICommentWriter, ICommentDeleter } from '@contracts/ICommentManager';
import type { CreateIssueDTO, UpdateIssueDTO, CreateCommentDTO, UpdateCommentDTO } from '@/models';

// ── Types ──────────────────────────────────────────────────────────────

export type OperationType =
  | 'CREATE_ISSUE'
  | 'UPDATE_ISSUE'
  | 'DELETE_ISSUE'
  | 'ADD_COMMENT'
  | 'UPDATE_COMMENT'
  | 'DELETE_COMMENT';

export interface QueuedOperation {
  readonly id: string;
  readonly type: OperationType;
  readonly projectId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly timestamp: number;
  retries: number;
  status: 'pending' | 'syncing' | 'failed';
}

export interface SyncResult {
  readonly processed: number;
  readonly succeeded: number;
  readonly failed: number;
}

interface EnqueueInput {
  readonly type: OperationType;
  readonly projectId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly timestamp: number;
}

type QueueSubscriber = (operations: readonly QueuedOperation[]) => void;

// ── Adapter with optional capabilities ─────────────────────────────────

type FullAdapter = IBackendAdapter &
  Partial<IIssueDeleter> &
  Partial<ICommentWriter> &
  Partial<ICommentDeleter>;

// ── Implementation ─────────────────────────────────────────────────────

const MAX_RETRIES = 3;

export class OperationQueue {
  private operations: QueuedOperation[] = [];
  private adapter: FullAdapter | null = null;
  private subscribers: Set<QueueSubscriber> = new Set();
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;
  private _isOnline = true;

  constructor() {
    if (typeof window !== 'undefined') {
      this._isOnline = navigator.onLine;

      this.onlineHandler = () => {
        this._isOnline = true;
        if (this.adapter && this.operations.length > 0) {
          void this.sync();
        }
      };

      this.offlineHandler = () => {
        this._isOnline = false;
      };

      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);
    }
  }

  /**
   * Set the adapter used to execute queued operations
   */
  setAdapter(adapter: FullAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Add an operation to the queue
   */
  async enqueue(input: EnqueueInput): Promise<string> {
    const id = generateId();
    const operation: QueuedOperation = {
      id,
      type: input.type,
      projectId: input.projectId,
      payload: input.payload,
      timestamp: input.timestamp,
      retries: 0,
      status: 'pending',
    };

    this.operations.push(operation);
    this.notify();
    return id;
  }

  /**
   * Get all pending/failed operations
   */
  getPending(): readonly QueuedOperation[] {
    return [...this.operations];
  }

  /**
   * Get number of queued operations
   */
  getCount(): number {
    return this.operations.length;
  }

  /**
   * Check if the browser is online
   */
  isOnline(): boolean {
    return this._isOnline;
  }

  /**
   * Process all pending operations
   */
  async sync(): Promise<SyncResult> {
    if (!this.adapter) {
      throw new Error('No adapter set on OperationQueue');
    }

    const toProcess = this.operations.filter(
      (op) => op.status === 'pending' || op.status === 'failed'
    );

    let succeeded = 0;
    let failed = 0;

    for (const op of toProcess) {
      op.status = 'syncing';

      try {
        await this.executeOperation(op);
        // Remove successful operation
        this.operations = this.operations.filter((o) => o.id !== op.id);
        succeeded++;
      } catch {
        op.retries++;
        if (op.retries >= MAX_RETRIES) {
          // Discard after max retries
          this.operations = this.operations.filter((o) => o.id !== op.id);
        } else {
          op.status = 'failed';
        }
        failed++;
      }
    }

    this.notify();

    return {
      processed: toProcess.length,
      succeeded,
      failed,
    };
  }

  /**
   * Remove all operations from the queue
   */
  clear(): void {
    this.operations = [];
    this.notify();
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(callback: QueueSubscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    if (typeof window !== 'undefined') {
      if (this.onlineHandler) {
        window.removeEventListener('online', this.onlineHandler);
      }
      if (this.offlineHandler) {
        window.removeEventListener('offline', this.offlineHandler);
      }
    }
    this.subscribers.clear();
    this.operations = [];
  }

  // ── Private ────────────────────────────────────────────────────────

  private async executeOperation(op: QueuedOperation): Promise<void> {
    const adapter = this.adapter!;
    const payload = op.payload;

    switch (op.type) {
      case 'CREATE_ISSUE':
        await adapter.createIssue(op.projectId, payload['dto'] as CreateIssueDTO);
        break;

      case 'UPDATE_ISSUE':
        await adapter.updateIssue(
          op.projectId,
          payload['issueId'] as string,
          payload['dto'] as UpdateIssueDTO
        );
        break;

      case 'DELETE_ISSUE':
        if (adapter.deleteIssue) {
          await adapter.deleteIssue(op.projectId, payload['issueId'] as string);
        }
        break;

      case 'ADD_COMMENT':
        if (adapter.addComment) {
          await adapter.addComment(
            op.projectId,
            payload['issueId'] as string,
            payload['dto'] as CreateCommentDTO
          );
        }
        break;

      case 'UPDATE_COMMENT':
        if (adapter.updateComment) {
          await adapter.updateComment(
            op.projectId,
            payload['issueId'] as string,
            payload['commentId'] as string,
            payload['dto'] as UpdateCommentDTO
          );
        }
        break;

      case 'DELETE_COMMENT':
        if (adapter.deleteComment) {
          await adapter.deleteComment(
            op.projectId,
            payload['issueId'] as string,
            payload['commentId'] as string
          );
        }
        break;
    }
  }

  private notify(): void {
    const snapshot = this.getPending();
    for (const cb of this.subscribers) {
      cb(snapshot);
    }
  }
}

// ── ID Generation ──────────────────────────────────────────────────────

function generateId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Singleton ──────────────────────────────────────────────────────────

let instance: OperationQueue | null = null;

export function getOperationQueue(): OperationQueue {
  if (!instance) {
    instance = new OperationQueue();
  }
  return instance;
}

export function resetOperationQueue(): void {
  if (instance) {
    instance.destroy();
  }
  instance = null;
}
