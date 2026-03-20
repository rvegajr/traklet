/**
 * Core module barrel export
 */

// Event Bus
export { EventBus, getEventBus, resetEventBus } from './EventBus';
export type {
  TrakletEventType,
  TrakletEventPayloads,
  TrakletEventHandler,
} from './EventBus';

// State Manager
export {
  StateManager,
  getStateManager,
  resetStateManager,
  selectConnectionStatus,
  selectCurrentProject,
  selectIssues,
  selectSelectedIssue,
  selectViewState,
  selectIsOnline,
  selectFilters,
} from './StateManager';
export type {
  TrakletState,
  WidgetViewState,
  ConnectionStatus,
  IssueFilters,
  StateSubscriber,
  StateSelector,
} from './StateManager';

// Config Manager
export {
  ConfigManager,
  getConfigManager,
  resetConfigManager,
} from './ConfigManager';
export type {
  TrakletConfig,
  TrakletUser,
  AnonymousMode,
  PermissionConfig,
  ThemeConfig,
  PositionConfig,
  ConfigValidationResult,
} from './ConfigManager';

// Auth Manager
export {
  AuthManager,
  getAuthManager,
  resetAuthManager,
} from './AuthManager';
export type { AuthHeaders, TokenInfo } from './AuthManager';

// Permission Manager
export {
  PermissionManager,
  getPermissionManager,
  resetPermissionManager,
} from './PermissionManager';
export type { Permission, PermissionContext } from './PermissionManager';

// Diagnostic Collector
export {
  DiagnosticCollector,
  getDiagnosticCollector,
  resetDiagnosticCollector,
} from './DiagnosticCollector';
export type {
  DiagnosticData,
  DiagnosticCollectorConfig,
  EnvironmentInfo,
  PerformanceInfo,
  ConsoleEntry,
  JSError,
  UserAction,
  PageVisit,
  RecordingSession,
} from './DiagnosticCollector';

// Operation Queue
export {
  OperationQueue,
  getOperationQueue,
  resetOperationQueue,
} from './OperationQueue';
export type {
  QueuedOperation,
  OperationType,
  SyncResult,
} from './OperationQueue';

// User Identity Store
export {
  saveUserIdentity,
  recallUserIdentity,
  clearUserIdentity,
} from './UserIdentityStore';

// Test Run Manager
export {
  TestRunManager,
  getTestRunManager,
  resetTestRunManager,
} from './TestRunManager';
export type {
  TestRun,
  TestCaseResult,
  TestStatus,
  TestRunSummary,
} from './TestRunManager';

// Test Case Template
export {
  parseTestCaseBody,
  composeTestCaseBody,
  updateSection,
  addJamLink,
  addDiagnostics,
  getSectionDefinitions,
} from './TestCaseTemplate';
export type {
  TestCaseSection,
  ParsedTestCase,
  JamLink,
  AttachmentRef,
  TestCaseCreateOptions,
  SectionRole,
} from './TestCaseTemplate';
