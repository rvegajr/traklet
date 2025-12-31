/**
 * StateManager - Reactive state container for the widget
 * Provides a simple, type-safe state management system
 */

import type { Issue, Project } from '@/models';

/** Widget UI state */
export type WidgetViewState = 'list' | 'detail' | 'create' | 'edit';

/** Connection status */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Complete widget state */
export interface TrakletState {
  // Connection
  readonly connectionStatus: ConnectionStatus;
  readonly connectionError: string | null;

  // Projects
  readonly projects: readonly Project[];
  readonly currentProjectId: string | null;

  // Issues
  readonly issues: readonly Issue[];
  readonly selectedIssue: Issue | null;
  readonly isLoadingIssues: boolean;
  readonly issuesError: string | null;

  // UI State
  readonly viewState: WidgetViewState;
  readonly isWidgetOpen: boolean;
  readonly isMinimized: boolean;

  // Offline
  readonly isOnline: boolean;
  readonly pendingOperations: number;

  // Filters
  readonly filters: IssueFilters;
}

export interface IssueFilters {
  readonly state: 'open' | 'closed' | 'all';
  readonly labels: readonly string[];
  readonly search: string;
  readonly assignee: string | null;
}

/** State subscriber callback */
export type StateSubscriber<T> = (state: T, prevState: T) => void;

/** Selector function to extract part of state */
export type StateSelector<T> = (state: TrakletState) => T;

const INITIAL_STATE: TrakletState = {
  connectionStatus: 'disconnected',
  connectionError: null,
  projects: [],
  currentProjectId: null,
  issues: [],
  selectedIssue: null,
  isLoadingIssues: false,
  issuesError: null,
  viewState: 'list',
  isWidgetOpen: false,
  isMinimized: false,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pendingOperations: 0,
  filters: {
    state: 'open',
    labels: [],
    search: '',
    assignee: null,
  },
};

export class StateManager {
  private state: TrakletState;
  private subscribers: Set<StateSubscriber<TrakletState>> = new Set();
  private selectorSubscribers: Map<
    StateSelector<unknown>,
    Set<{ selector: StateSelector<unknown>; callback: StateSubscriber<unknown> }>
  > = new Map();

  constructor(initialState: Partial<TrakletState> = {}) {
    this.state = { ...INITIAL_STATE, ...initialState };
  }

  /**
   * Get current state
   */
  getState(): TrakletState {
    return this.state;
  }

  /**
   * Get a specific slice of state
   */
  select<T>(selector: StateSelector<T>): T {
    return selector(this.state);
  }

  /**
   * Update state with partial updates
   */
  setState(updates: Partial<TrakletState>): void {
    const prevState = this.state;
    this.state = { ...this.state, ...updates };

    // Only notify if state actually changed
    if (this.state !== prevState) {
      this.notifySubscribers(prevState);
    }
  }

  /**
   * Update nested state (e.g., filters)
   */
  updateFilters(updates: Partial<IssueFilters>): void {
    this.setState({
      filters: { ...this.state.filters, ...updates },
    });
  }

  /**
   * Subscribe to all state changes
   */
  subscribe(callback: StateSubscriber<TrakletState>): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Subscribe to specific state slice changes
   */
  subscribeToSelector<T>(
    selector: StateSelector<T>,
    callback: StateSubscriber<T>
  ): () => void {
    const entry = { selector: selector as StateSelector<unknown>, callback: callback as StateSubscriber<unknown> };

    let entries = this.selectorSubscribers.get(selector as StateSelector<unknown>);
    if (!entries) {
      entries = new Set();
      this.selectorSubscribers.set(selector as StateSelector<unknown>, entries);
    }
    entries.add(entry);

    return () => {
      entries?.delete(entry);
      if (entries?.size === 0) {
        this.selectorSubscribers.delete(selector as StateSelector<unknown>);
      }
    };
  }

  /**
   * Reset state to initial values
   */
  reset(): void {
    const prevState = this.state;
    this.state = { ...INITIAL_STATE };
    this.notifySubscribers(prevState);
  }

  /**
   * Get a snapshot of current state (for debugging)
   */
  snapshot(): Readonly<TrakletState> {
    return Object.freeze({ ...this.state });
  }

  private notifySubscribers(prevState: TrakletState): void {
    // Notify full state subscribers
    for (const callback of this.subscribers) {
      try {
        callback(this.state, prevState);
      } catch (error) {
        console.error('Error in state subscriber:', error);
      }
    }

    // Notify selector subscribers
    for (const [selector, entries] of this.selectorSubscribers) {
      const prevValue = selector(prevState);
      const newValue = selector(this.state);

      // Only notify if selected value changed
      if (!Object.is(prevValue, newValue)) {
        for (const { callback } of entries) {
          try {
            callback(newValue, prevValue);
          } catch (error) {
            console.error('Error in selector subscriber:', error);
          }
        }
      }
    }
  }
}

// Singleton instance
let globalStateManager: StateManager | null = null;

export function getStateManager(): StateManager {
  if (!globalStateManager) {
    globalStateManager = new StateManager();
  }
  return globalStateManager;
}

export function resetStateManager(): void {
  if (globalStateManager) {
    globalStateManager.reset();
  }
  globalStateManager = null;
}

// Common selectors
export const selectConnectionStatus = (state: TrakletState): ConnectionStatus =>
  state.connectionStatus;
export const selectCurrentProject = (state: TrakletState): Project | undefined =>
  state.projects.find((p) => p.id === state.currentProjectId);
export const selectIssues = (state: TrakletState): readonly Issue[] => state.issues;
export const selectSelectedIssue = (state: TrakletState): Issue | null => state.selectedIssue;
export const selectViewState = (state: TrakletState): WidgetViewState => state.viewState;
export const selectIsOnline = (state: TrakletState): boolean => state.isOnline;
export const selectFilters = (state: TrakletState): IssueFilters => state.filters;
