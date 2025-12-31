/**
 * StateManager tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StateManager,
  getStateManager,
  resetStateManager,
  selectConnectionStatus,
  selectIssues,
  selectFilters,
} from '../StateManager';
import type { TrakletState, IssueFilters } from '../StateManager';
import type { Issue } from '@/models';

describe('StateManager', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager();
  });

  describe('getState()', () => {
    it('should return initial state', () => {
      const state = stateManager.getState();

      expect(state.connectionStatus).toBe('disconnected');
      expect(state.projects).toEqual([]);
      expect(state.issues).toEqual([]);
      expect(state.selectedIssue).toBeNull();
      expect(state.viewState).toBe('list');
      expect(state.isWidgetOpen).toBe(false);
    });

    it('should accept initial state overrides', () => {
      const customManager = new StateManager({
        connectionStatus: 'connected',
        isWidgetOpen: true,
      });

      const state = customManager.getState();
      expect(state.connectionStatus).toBe('connected');
      expect(state.isWidgetOpen).toBe(true);
    });
  });

  describe('setState()', () => {
    it('should update state partially', () => {
      stateManager.setState({ connectionStatus: 'connecting' });

      const state = stateManager.getState();
      expect(state.connectionStatus).toBe('connecting');
      expect(state.viewState).toBe('list'); // unchanged
    });

    it('should handle complex state updates', () => {
      const mockIssue = createMockIssue();

      stateManager.setState({
        issues: [mockIssue],
        selectedIssue: mockIssue,
        viewState: 'detail',
      });

      const state = stateManager.getState();
      expect(state.issues).toHaveLength(1);
      expect(state.selectedIssue).toBe(mockIssue);
      expect(state.viewState).toBe('detail');
    });
  });

  describe('select()', () => {
    it('should select state slice using selector', () => {
      stateManager.setState({ connectionStatus: 'connected' });

      const status = stateManager.select(selectConnectionStatus);
      expect(status).toBe('connected');
    });

    it('should work with complex selectors', () => {
      const mockIssue = createMockIssue();
      stateManager.setState({ issues: [mockIssue] });

      const issues = stateManager.select(selectIssues);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toBe(mockIssue);
    });
  });

  describe('updateFilters()', () => {
    it('should update filters partially', () => {
      stateManager.updateFilters({ state: 'closed' });

      const filters = stateManager.select(selectFilters);
      expect(filters.state).toBe('closed');
      expect(filters.labels).toEqual([]); // unchanged
    });

    it('should update multiple filter properties', () => {
      stateManager.updateFilters({
        state: 'all',
        search: 'bug',
        labels: ['urgent'],
      });

      const filters = stateManager.select(selectFilters);
      expect(filters.state).toBe('all');
      expect(filters.search).toBe('bug');
      expect(filters.labels).toEqual(['urgent']);
    });
  });

  describe('subscribe()', () => {
    it('should notify subscribers on state change', () => {
      const callback = vi.fn();
      stateManager.subscribe(callback);

      stateManager.setState({ connectionStatus: 'connected' });

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ connectionStatus: 'connected' }),
        expect.objectContaining({ connectionStatus: 'disconnected' })
      );
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = stateManager.subscribe(callback);

      unsubscribe();
      stateManager.setState({ connectionStatus: 'connected' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should notify multiple subscribers', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      stateManager.subscribe(callback1);
      stateManager.subscribe(callback2);
      stateManager.setState({ connectionStatus: 'connected' });

      expect(callback1).toHaveBeenCalledOnce();
      expect(callback2).toHaveBeenCalledOnce();
    });

    it('should catch errors in subscribers without affecting others', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorCallback = vi.fn(() => {
        throw new Error('Subscriber error');
      });
      const successCallback = vi.fn();

      stateManager.subscribe(errorCallback);
      stateManager.subscribe(successCallback);
      stateManager.setState({ connectionStatus: 'connected' });

      expect(errorCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('subscribeToSelector()', () => {
    it('should only notify when selected value changes', () => {
      const callback = vi.fn();
      stateManager.subscribeToSelector(selectConnectionStatus, callback);

      // Change unrelated state - should not notify
      stateManager.setState({ isWidgetOpen: true });
      expect(callback).not.toHaveBeenCalled();

      // Change relevant state - should notify
      stateManager.setState({ connectionStatus: 'connected' });
      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith('connected', 'disconnected');
    });

    it('should work with array selectors', () => {
      const callback = vi.fn();
      stateManager.subscribeToSelector(selectIssues, callback);

      const mockIssue = createMockIssue();
      stateManager.setState({ issues: [mockIssue] });

      expect(callback).toHaveBeenCalledOnce();
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = stateManager.subscribeToSelector(selectConnectionStatus, callback);

      unsubscribe();
      stateManager.setState({ connectionStatus: 'connected' });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('reset()', () => {
    it('should reset to initial state', () => {
      stateManager.setState({
        connectionStatus: 'connected',
        isWidgetOpen: true,
        issues: [createMockIssue()],
      });

      stateManager.reset();

      const state = stateManager.getState();
      expect(state.connectionStatus).toBe('disconnected');
      expect(state.isWidgetOpen).toBe(false);
      expect(state.issues).toEqual([]);
    });

    it('should notify subscribers', () => {
      const callback = vi.fn();
      stateManager.setState({ connectionStatus: 'connected' });
      stateManager.subscribe(callback);

      stateManager.reset();

      expect(callback).toHaveBeenCalledOnce();
    });
  });

  describe('snapshot()', () => {
    it('should return frozen copy of state', () => {
      stateManager.setState({ connectionStatus: 'connected' });

      const snapshot = stateManager.snapshot();

      expect(snapshot.connectionStatus).toBe('connected');
      expect(Object.isFrozen(snapshot)).toBe(true);
    });
  });

  describe('singleton', () => {
    beforeEach(() => {
      resetStateManager();
    });

    it('should return same instance', () => {
      const manager1 = getStateManager();
      const manager2 = getStateManager();
      expect(manager1).toBe(manager2);
    });

    it('should reset instance correctly', () => {
      const manager1 = getStateManager();
      manager1.setState({ connectionStatus: 'connected' });

      resetStateManager();

      const manager2 = getStateManager();
      expect(manager2.getState().connectionStatus).toBe('disconnected');
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
