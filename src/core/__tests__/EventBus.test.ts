/**
 * EventBus tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus, getEventBus, resetEventBus } from '../EventBus';
import type { Issue, Project } from '@/models';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('on()', () => {
    it('should subscribe to events and receive payloads', () => {
      const handler = vi.fn();
      const mockIssue = createMockIssue();

      eventBus.on('issue:created', handler);
      eventBus.emit('issue:created', { issue: mockIssue });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith({ issue: mockIssue });
    });

    it('should allow multiple subscribers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const mockIssue = createMockIssue();

      eventBus.on('issue:created', handler1);
      eventBus.on('issue:created', handler2);
      eventBus.emit('issue:created', { issue: mockIssue });

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();

      const unsubscribe = eventBus.on('issue:created', handler);
      unsubscribe();
      eventBus.emit('issue:created', { issue: createMockIssue() });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should not affect other subscribers when unsubscribing', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsubscribe1 = eventBus.on('issue:created', handler1);
      eventBus.on('issue:created', handler2);

      unsubscribe1();
      eventBus.emit('issue:created', { issue: createMockIssue() });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledOnce();
    });
  });

  describe('once()', () => {
    it('should only fire handler once', () => {
      const handler = vi.fn();
      const mockIssue = createMockIssue();

      eventBus.once('issue:created', handler);
      eventBus.emit('issue:created', { issue: mockIssue });
      eventBus.emit('issue:created', { issue: mockIssue });

      expect(handler).toHaveBeenCalledOnce();
    });

    it('should allow manual unsubscribe before event fires', () => {
      const handler = vi.fn();

      const unsubscribe = eventBus.once('issue:created', handler);
      unsubscribe();
      eventBus.emit('issue:created', { issue: createMockIssue() });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('emit()', () => {
    it('should handle different event types', () => {
      const issueHandler = vi.fn();
      const projectHandler = vi.fn();

      eventBus.on('issue:created', issueHandler);
      eventBus.on('project:changed', projectHandler);

      eventBus.emit('issue:created', { issue: createMockIssue() });

      expect(issueHandler).toHaveBeenCalledOnce();
      expect(projectHandler).not.toHaveBeenCalled();
    });

    it('should not throw when emitting to no subscribers', () => {
      expect(() => {
        eventBus.emit('issue:created', { issue: createMockIssue() });
      }).not.toThrow();
    });

    it('should catch and log handler errors without affecting others', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const successHandler = vi.fn();

      eventBus.on('issue:created', errorHandler);
      eventBus.on('issue:created', successHandler);
      eventBus.emit('issue:created', { issue: createMockIssue() });

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('off()', () => {
    it('should remove all subscribers for event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('issue:created', handler1);
      eventBus.on('issue:created', handler2);
      eventBus.off('issue:created');
      eventBus.emit('issue:created', { issue: createMockIssue() });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('clear()', () => {
    it('should remove all subscribers for all events', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('issue:created', handler1);
      eventBus.on('project:changed', handler2);
      eventBus.clear();

      eventBus.emit('issue:created', { issue: createMockIssue() });
      eventBus.emit('project:changed', { project: createMockProject() });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('subscriberCount()', () => {
    it('should return correct subscriber count', () => {
      expect(eventBus.subscriberCount('issue:created')).toBe(0);

      eventBus.on('issue:created', vi.fn());
      expect(eventBus.subscriberCount('issue:created')).toBe(1);

      eventBus.on('issue:created', vi.fn());
      expect(eventBus.subscriberCount('issue:created')).toBe(2);
    });
  });

  describe('getHistory()', () => {
    it('should record emitted events', () => {
      const mockIssue = createMockIssue();
      eventBus.emit('issue:created', { issue: mockIssue });

      const history = eventBus.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0]?.type).toBe('issue:created');
      expect(history[0]?.payload).toEqual({ issue: mockIssue });
      expect(history[0]?.timestamp).toBeInstanceOf(Date);
    });

    it('should limit history size', () => {
      for (let i = 0; i < 150; i++) {
        eventBus.emit('issue:created', { issue: createMockIssue() });
      }

      const history = eventBus.getHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('singleton', () => {
    beforeEach(() => {
      resetEventBus();
    });

    it('should return same instance', () => {
      const bus1 = getEventBus();
      const bus2 = getEventBus();
      expect(bus1).toBe(bus2);
    });

    it('should reset instance correctly', () => {
      const bus1 = getEventBus();
      bus1.on('issue:created', vi.fn());
      expect(bus1.subscriberCount('issue:created')).toBe(1);

      resetEventBus();

      const bus2 = getEventBus();
      expect(bus2).not.toBe(bus1);
      expect(bus2.subscriberCount('issue:created')).toBe(0);
    });
  });
});

// Test helpers
function createMockIssue(): Issue {
  return {
    id: 'issue-1',
    number: 1,
    title: 'Test Issue',
    body: 'Test body',
    state: 'open',
    labels: [],
    createdBy: {
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
    },
    assignees: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    attachments: [],
    commentCount: 0,
    projectId: 'project-1',
  };
}

function createMockProject(): Project {
  return {
    id: 'project-1',
    name: 'Test Project',
  };
}
