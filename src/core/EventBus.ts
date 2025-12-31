/**
 * EventBus - Pub/sub system for widget-host communication
 * Provides type-safe event handling for internal and external events
 */

import type { Issue, Comment, Project } from '@/models';

/** All possible event types */
export type TrakletEventType =
  // Issue events
  | 'issue:created'
  | 'issue:updated'
  | 'issue:deleted'
  | 'issue:selected'
  // Comment events
  | 'comment:created'
  | 'comment:updated'
  | 'comment:deleted'
  // Project events
  | 'project:changed'
  | 'project:added'
  | 'project:removed'
  // Connection events
  | 'connection:connected'
  | 'connection:disconnected'
  | 'connection:error'
  // Offline events
  | 'offline:queued'
  | 'offline:synced'
  | 'offline:failed'
  // UI events
  | 'widget:opened'
  | 'widget:closed'
  | 'widget:minimized';

/** Event payload types */
export interface TrakletEventPayloads {
  'issue:created': { issue: Issue };
  'issue:updated': { issue: Issue; changes: Record<string, unknown> };
  'issue:deleted': { issueId: string; projectId: string };
  'issue:selected': { issue: Issue | null };
  'comment:created': { issueId: string; comment: Comment };
  'comment:updated': { issueId: string; comment: Comment };
  'comment:deleted': { issueId: string; commentId: string };
  'project:changed': { project: Project; previousProjectId?: string };
  'project:added': { project: Project };
  'project:removed': { projectId: string };
  'connection:connected': { projects: readonly Project[] };
  'connection:disconnected': Record<string, never>;
  'connection:error': { error: Error; recoverable: boolean };
  'offline:queued': { operationId: string; type: string };
  'offline:synced': { operationId: string; result: unknown };
  'offline:failed': { operationId: string; error: Error };
  'widget:opened': Record<string, never>;
  'widget:closed': Record<string, never>;
  'widget:minimized': Record<string, never>;
}

export type TrakletEventHandler<T extends TrakletEventType> = (
  payload: TrakletEventPayloads[T]
) => void;

interface Subscription {
  readonly type: TrakletEventType;
  readonly handler: TrakletEventHandler<TrakletEventType>;
  readonly once: boolean;
}

export class EventBus {
  private subscriptions: Map<TrakletEventType, Set<Subscription>> = new Map();
  private eventHistory: Array<{ type: TrakletEventType; payload: unknown; timestamp: Date }> = [];
  private readonly maxHistorySize = 100;

  /**
   * Subscribe to an event type
   */
  on<T extends TrakletEventType>(type: T, handler: TrakletEventHandler<T>): () => void {
    const subscription: Subscription = {
      type,
      handler: handler as TrakletEventHandler<TrakletEventType>,
      once: false,
    };

    this.addSubscription(type, subscription);

    // Return unsubscribe function
    return () => this.removeSubscription(type, subscription);
  }

  /**
   * Subscribe to an event type, automatically unsubscribe after first call
   */
  once<T extends TrakletEventType>(type: T, handler: TrakletEventHandler<T>): () => void {
    const subscription: Subscription = {
      type,
      handler: handler as TrakletEventHandler<TrakletEventType>,
      once: true,
    };

    this.addSubscription(type, subscription);

    return () => this.removeSubscription(type, subscription);
  }

  /**
   * Emit an event to all subscribers
   */
  emit<T extends TrakletEventType>(type: T, payload: TrakletEventPayloads[T]): void {
    // Record in history
    this.recordEvent(type, payload);

    const subs = this.subscriptions.get(type);
    if (!subs) return;

    const toRemove: Subscription[] = [];

    for (const sub of subs) {
      try {
        sub.handler(payload);
        if (sub.once) {
          toRemove.push(sub);
        }
      } catch (error) {
        console.error(`Error in event handler for ${type}:`, error);
      }
    }

    // Remove one-time subscriptions
    for (const sub of toRemove) {
      subs.delete(sub);
    }
  }

  /**
   * Remove all subscriptions for a specific event type
   */
  off(type: TrakletEventType): void {
    this.subscriptions.delete(type);
  }

  /**
   * Remove all subscriptions
   */
  clear(): void {
    this.subscriptions.clear();
  }

  /**
   * Get the count of subscribers for an event type
   */
  subscriberCount(type: TrakletEventType): number {
    return this.subscriptions.get(type)?.size ?? 0;
  }

  /**
   * Get recent event history (for debugging)
   */
  getHistory(): ReadonlyArray<{ type: TrakletEventType; payload: unknown; timestamp: Date }> {
    return [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  private addSubscription(type: TrakletEventType, subscription: Subscription): void {
    let subs = this.subscriptions.get(type);
    if (!subs) {
      subs = new Set();
      this.subscriptions.set(type, subs);
    }
    subs.add(subscription);
  }

  private removeSubscription(type: TrakletEventType, subscription: Subscription): void {
    const subs = this.subscriptions.get(type);
    if (subs) {
      subs.delete(subscription);
      if (subs.size === 0) {
        this.subscriptions.delete(type);
      }
    }
  }

  private recordEvent(type: TrakletEventType, payload: unknown): void {
    this.eventHistory.push({
      type,
      payload,
      timestamp: new Date(),
    });

    // Trim history if too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }
}

// Singleton instance for global event bus
let globalEventBus: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  return globalEventBus;
}

export function resetEventBus(): void {
  if (globalEventBus) {
    globalEventBus.clear();
    globalEventBus.clearHistory();
  }
  globalEventBus = null;
}
