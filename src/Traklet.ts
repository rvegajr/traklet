/**
 * Traklet - Main orchestrator class
 * Entry point for initializing and managing the issue tracking widget
 */

import type { IBackendAdapter, AdapterConfig, ProjectConfig } from './contracts';
import type { Project } from './models';
import {
  getConfigManager,
  getStateManager,
  getEventBus,
  resetConfigManager,
  resetStateManager,
  resetEventBus,
  resetAuthManager,
  resetPermissionManager,
  DiagnosticCollector,
  getDiagnosticCollector,
} from './core';
import type { TrakletConfig, DiagnosticData, RecordingSession } from './core';
import { LocalStorageAdapter } from './adapters';
import { IssueListPresenter, IssueDetailPresenter, IssueFormPresenter } from './presenters';
import type { IWidgetPresenter } from './presenters';

export interface TrakletInstance {
  /** Destroy the widget and clean up */
  destroy(): void;

  /** Get the current project */
  getCurrentProject(): Project | null;

  /** Switch to a different project */
  switchProject(projectId: string): Promise<void>;

  /** Get available projects */
  getProjects(): readonly Project[];

  /** Get the widget presenter for UI binding */
  getWidgetPresenter(): IWidgetPresenter;

  /** Get the issue list presenter */
  getIssueListPresenter(): IssueListPresenter;

  /** Get the issue detail presenter */
  getIssueDetailPresenter(): IssueDetailPresenter;

  /** Get the issue form presenter */
  getIssueFormPresenter(): IssueFormPresenter;

  /** Refresh the current view */
  refresh(): Promise<void>;

  /** Open the widget */
  open(): void;

  /** Close the widget */
  close(): void;

  /** Check if widget is open */
  isOpen(): boolean;

  /** Get diagnostic collector for attaching info to issues */
  getDiagnostics(): DiagnosticCollector;

  /** Get formatted diagnostics as markdown */
  getDiagnosticsMarkdown(): string;

  /** Get raw diagnostic data */
  getDiagnosticData(): DiagnosticData;

  // ============================================
  // Recording Session Methods (for multi-page bug reports)
  // ============================================

  /**
   * Start recording a bug report session.
   * User can navigate through multiple pages while recording.
   * Data persists across page navigations via sessionStorage.
   */
  startRecording(): RecordingSession;

  /**
   * Stop the recording session and prepare for submission.
   * Returns the complete session with all pages, actions, and errors.
   */
  stopRecording(): RecordingSession | null;

  /**
   * Cancel the current recording without saving
   */
  cancelRecording(): void;

  /**
   * Check if a recording session is currently active
   */
  isRecording(): boolean;

  /**
   * Get the current recording session (if any)
   */
  getRecordingSession(): RecordingSession | null;
}

/**
 * Main Traklet class - creates and manages the widget
 */
export class Traklet {
  private static instance: TrakletInstance | null = null;

  /**
   * Initialize the Traklet widget
   */
  static async init(config: TrakletConfig): Promise<TrakletInstance> {
    // Validate and store configuration
    const configManager = getConfigManager();
    const validation = configManager.setConfig(config);

    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    // Create adapter based on config
    const adapter = Traklet.createAdapter(config);

    // Connect adapter
    const adapterConfig: AdapterConfig = {
      type: config.adapter,
      token: config.token,
      getToken: config.getToken,
      baseUrl: config.baseUrl,
      projects: config.projects,
    };

    const connectionResult = await adapter.connect(adapterConfig);
    if (!connectionResult.success) {
      throw new Error(`Failed to connect: ${connectionResult.error ?? 'Unknown error'}`);
    }

    // Initialize state
    const stateManager = getStateManager();
    const projects = connectionResult.projects ?? Traklet.projectConfigsToProjects(config.projects);

    stateManager.setState({
      connectionStatus: 'connected',
      projects,
      currentProjectId: projects[0]?.id ?? null,
    });

    // Emit connection event
    getEventBus().emit('connection:connected', { projects });

    // Initialize diagnostic collector (auto-captures console/errors)
    const diagnosticCollector = getDiagnosticCollector({
      maxConsoleLogs: 50,
      maxJsErrors: 20,
      captureConsole: config.collectDiagnostics !== false,
      captureErrors: config.collectDiagnostics !== false,
    });
    diagnosticCollector.init();

    // Create presenters
    const currentProjectId = projects[0]?.id ?? '';
    const issueListPresenter = new IssueListPresenter(adapter, currentProjectId);
    const issueDetailPresenter = new IssueDetailPresenter(adapter, currentProjectId);
    const issueFormPresenter = new IssueFormPresenter(adapter, currentProjectId);

    // Create widget presenter
    const widgetPresenter = Traklet.createWidgetPresenter(
      projects,
      adapter,
      issueListPresenter,
      issueDetailPresenter,
      issueFormPresenter
    );

    // Create instance
    const instance: TrakletInstance = {
      destroy: () => Traklet.destroy(adapter),

      getCurrentProject: () => {
        const state = stateManager.getState();
        return state.projects.find((p) => p.id === state.currentProjectId) ?? null;
      },

      async switchProject(projectId: string) {
        const project = projects.find((p) => p.id === projectId);
        if (!project) {
          throw new Error(`Project not found: ${projectId}`);
        }

        const previousId = stateManager.getState().currentProjectId;
        stateManager.setState({ currentProjectId: projectId });

        // Update presenters
        issueListPresenter.setProjectId(projectId);
        issueDetailPresenter.setProjectId(projectId);
        issueFormPresenter.setProjectId(projectId);

        // Reload issues
        await issueListPresenter.loadIssues();

        getEventBus().emit('project:changed', {
          project,
          ...(previousId !== null ? { previousProjectId: previousId } : {}),
        });
      },

      getProjects: () => projects,

      getWidgetPresenter: () => widgetPresenter,
      getIssueListPresenter: () => issueListPresenter,
      getIssueDetailPresenter: () => issueDetailPresenter,
      getIssueFormPresenter: () => issueFormPresenter,

      async refresh() {
        const state = stateManager.getState();
        switch (state.viewState) {
          case 'list':
            await issueListPresenter.refresh();
            break;
          case 'detail':
            if (state.selectedIssue) {
              await issueDetailPresenter.loadIssue(state.selectedIssue.id);
            }
            break;
        }
      },

      open() {
        stateManager.setState({ isWidgetOpen: true });
        getEventBus().emit('widget:opened', {});
      },

      close() {
        stateManager.setState({ isWidgetOpen: false });
        getEventBus().emit('widget:closed', {});
      },

      isOpen() {
        return stateManager.getState().isWidgetOpen;
      },

      getDiagnostics() {
        return diagnosticCollector;
      },

      getDiagnosticsMarkdown() {
        return diagnosticCollector.formatAsMarkdown();
      },

      getDiagnosticData() {
        return diagnosticCollector.collect();
      },

      // Recording session methods
      startRecording() {
        return diagnosticCollector.startRecording();
      },

      stopRecording() {
        return diagnosticCollector.stopRecording();
      },

      cancelRecording() {
        diagnosticCollector.cancelRecording();
      },

      isRecording() {
        return diagnosticCollector.isRecording();
      },

      getRecordingSession() {
        return diagnosticCollector.getRecordingSession();
      },
    };

    Traklet.instance = instance;

    // Auto-load issues
    await issueListPresenter.loadIssues();

    return instance;
  }

  /**
   * Get the current instance
   */
  static getInstance(): TrakletInstance | null {
    return Traklet.instance;
  }

  /**
   * Destroy the current instance
   */
  private static destroy(adapter: IBackendAdapter): void {
    // Disconnect adapter
    void adapter.disconnect();

    // Stop diagnostic collector
    getDiagnosticCollector().destroy();

    // Emit disconnect event
    getEventBus().emit('connection:disconnected', {});

    // Reset all managers
    resetConfigManager();
    resetStateManager();
    resetEventBus();
    resetAuthManager();
    resetPermissionManager();

    Traklet.instance = null;
  }

  /**
   * Create adapter based on config
   */
  private static createAdapter(config: TrakletConfig): IBackendAdapter {
    switch (config.adapter) {
      case 'localStorage':
        return new LocalStorageAdapter(false);

      case 'github':
      case 'azure-devops':
      case 'rest':
        // TODO: Implement these adapters
        throw new Error(`Adapter '${config.adapter}' is not yet implemented`);

      default:
        throw new Error(`Unknown adapter type: ${config.adapter}`);
    }
  }

  /**
   * Convert project configs to project models
   */
  private static projectConfigsToProjects(configs: readonly ProjectConfig[]): Project[] {
    return configs.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
    }));
  }

  /**
   * Create widget presenter
   */
  private static createWidgetPresenter(
    projects: readonly Project[],
    adapter: IBackendAdapter,
    _issueListPresenter: IssueListPresenter,
    issueDetailPresenter: IssueDetailPresenter,
    issueFormPresenter: IssueFormPresenter
  ): IWidgetPresenter {
    const stateManager = getStateManager();

    return {
      get viewState() {
        return stateManager.getState().viewState;
      },

      subscribeToViewState(callback) {
        return stateManager.subscribeToSelector(
          (state) => state.viewState,
          callback
        );
      },

      getCurrentProject() {
        const state = stateManager.getState();
        return state.projects.find((p) => p.id === state.currentProjectId) ?? null;
      },

      getProjects() {
        return projects;
      },

      async switchProject(projectId) {
        const instance = Traklet.getInstance();
        if (instance) {
          await instance.switchProject(projectId);
        }
      },

      navigateTo(view, params) {
        stateManager.setState({ viewState: view });

        if (view === 'detail' && params?.issueId) {
          void issueDetailPresenter.loadIssue(params.issueId);
        } else if (view === 'edit' && params?.issueId) {
          void issueFormPresenter.initEdit(params.issueId);
        } else if (view === 'create') {
          void issueFormPresenter.initCreate();
        }
      },

      isConnected() {
        return adapter.isConnected();
      },

      isOnline() {
        return stateManager.getState().isOnline;
      },

      getPendingOperationsCount() {
        return stateManager.getState().pendingOperations;
      },
    };
  }
}
