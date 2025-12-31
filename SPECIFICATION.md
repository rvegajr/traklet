# Traklet - Technical Specification Document

> **Version:** 1.0.0-draft
> **Last Updated:** December 2024
> **Status:** Specification Phase

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [System Architecture](#3-system-architecture)
4. [Core Components](#4-core-components)
5. [Backend Adapters](#5-backend-adapters)
6. [Data Models](#6-data-models)
7. [User Interface](#7-user-interface)
8. [Authentication & Identity](#8-authentication--identity)
9. [Permissions & User Matching](#9-permissions--user-matching)
10. [Offline Support](#10-offline-support)
11. [Attachments & Screenshots](#11-attachments--screenshots)
12. [Configuration API](#12-configuration-api)
13. [Integration Patterns](#13-integration-patterns)
14. [Event System](#14-event-system)
15. [Security Considerations](#15-security-considerations)
16. [Performance Requirements](#16-performance-requirements)
17. [Testing Strategy](#17-testing-strategy)
18. [Browser Support](#18-browser-support)
19. [Appendix](#19-appendix)

---

## 1. Executive Summary

### 1.1 What is Traklet?

Traklet is a **self-contained, backend-agnostic issue tracking widget** designed to be dynamically injected into any web application. It provides a complete issue management UI that can interface with multiple backend systems through a unified adapter pattern.

### 1.2 Key Value Propositions

| Value | Description |
|-------|-------------|
| **Zero Backend Lock-in** | Switch between GitHub, Azure DevOps, or custom backends without code changes |
| **Drop-in Integration** | Single script tag or npm import to add issue tracking to any app |
| **Complete Encapsulation** | Shadow DOM isolation ensures no style conflicts with host applications |
| **Offline-First** | Queue operations when offline, sync automatically when reconnected |
| **Self-Contained** | Single JavaScript bundle with optional CSS, no external dependencies at runtime |

### 1.3 Target Use Cases

1. **Internal Tools** - Add bug reporting to internal dashboards
2. **Customer Feedback** - Embed issue submission in customer-facing apps
3. **QA Workflows** - Enable testers to file issues directly from the application
4. **Developer Tools** - Integrate issue tracking into dev environments
5. **White-Label Products** - Provide issue tracking as a feature in your SaaS

---

## 2. Goals & Non-Goals

### 2.1 Goals

| ID | Goal | Priority |
|----|------|----------|
| G1 | Support GitHub Issues as a backend | P0 |
| G2 | Support Azure DevOps Work Items as a backend | P0 |
| G3 | Support generic REST API backends | P1 |
| G4 | Provide offline operation queueing | P1 |
| G5 | Enable file attachments and screenshots | P0 |
| G6 | Support multi-project/repository switching | P1 |
| G7 | Complete Shadow DOM isolation | P0 |
| G8 | Single-file distributable bundle | P0 |
| G9 | Fully controllable via configuration | P0 |
| G10 | TypeScript-first with full type exports | P1 |
| G11 | Full GUI for viewing, creating, editing, deleting issues | P0 |
| G12 | Image/attachment viewing in issue detail | P0 |
| G13 | User-based permission system (owner can edit/delete) | P0 |
| G14 | Configurable anonymous user mode (view-only or view+create) | P1 |

### 2.2 Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Real-time WebSocket updates | Complexity; refresh-on-demand sufficient |
| NG2 | Internationalization (i18n) | Out of scope for v1 |
| NG3 | Native mobile SDKs | Web-only focus |
| NG4 | User management/admin features | Backend responsibility |
| NG5 | Custom workflow engines | Too opinionated |
| NG6 | Built-in analytics/reporting | Backend responsibility |

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           HOST APPLICATION                               │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        TRAKLET WIDGET                               │ │
│  │                                                                     │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │ │
│  │  │   UI Layer  │  │    State    │  │   Event     │  │  Offline  │ │ │
│  │  │  (Shadow    │◄─┤   Manager   │◄─┤    Bus      │◄─┤   Queue   │ │ │
│  │  │    DOM)     │  │  (Zustand)  │  │  (Pub/Sub)  │  │ (IndexedDB)│ │ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘ │ │
│  │         │                │                │                │       │ │
│  │         └────────────────┼────────────────┼────────────────┘       │ │
│  │                          │                │                        │ │
│  │                   ┌──────▼────────────────▼──────┐                 │ │
│  │                   │      ADAPTER INTERFACE        │                 │ │
│  │                   │    (IBackendAdapter)          │                 │ │
│  │                   └──────────────┬───────────────┘                 │ │
│  └──────────────────────────────────┼─────────────────────────────────┘ │
└─────────────────────────────────────┼───────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│  GitHub Issues  │        │  Azure DevOps   │        │   Custom REST   │
│     Adapter     │        │    Adapter      │        │     Adapter     │
│                 │        │                 │        │                 │
│ - Issues API    │        │ - Work Items    │        │ - Configurable  │
│ - Comments      │        │ - Comments      │        │   endpoints     │
│ - Labels        │        │ - Tags          │        │ - Field mapping │
│ - Attachments   │        │ - Attachments   │        │ - Auth headers  │
└────────┬────────┘        └────────┬────────┘        └────────┬────────┘
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│  api.github.com │        │ dev.azure.com   │        │  your-api.com   │
└─────────────────┘        └─────────────────┘        └─────────────────┘
```

### 3.2 Component Interaction Flow

```
User Action (Click "Create Issue")
         │
         ▼
┌─────────────────┐
│   UI Component  │  ──── Renders form in Shadow DOM
│  (IssueForm)    │
└────────┬────────┘
         │ dispatch('SUBMIT_ISSUE', payload)
         ▼
┌─────────────────┐
│   Event Bus     │  ──── Validates, transforms
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Operation Queue │  ──── Checks online status
└────────┬────────┘
         │
    ┌────┴────┐
    │ Online? │
    └────┬────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌──────────┐
│  Yes  │ │    No    │
└───┬───┘ └────┬─────┘
    │          │
    ▼          ▼
┌─────────┐ ┌───────────────┐
│ Adapter │ │ Queue to      │
│ .create │ │ IndexedDB     │
│ Issue() │ │ (sync later)  │
└────┬────┘ └───────┬───────┘
     │              │
     ▼              ▼
┌─────────────────────┐
│    State Manager    │  ──── Update UI state
│  (optimistic update)│
└─────────────────────┘
         │
         ▼
┌─────────────────┐
│   UI Re-render  │
└─────────────────┘
```

### 3.3 Module Dependency Graph

```
                    ┌─────────────┐
                    │   Traklet   │  (Main Entry)
                    │   .init()   │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│ ConfigManager   │ │ AuthManager │ │ AdapterFactory  │
└────────┬────────┘ └──────┬──────┘ └────────┬────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │StateManager │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
       ┌───────────┐ ┌──────────┐ ┌──────────────┐
       │ EventBus  │ │ UIManager│ │ OfflineQueue │
       └───────────┘ └──────────┘ └──────────────┘
```

---

## 4. Core Components

### 4.1 Traklet (Main Entry Point)

The primary orchestrator that initializes and coordinates all subsystems.

```typescript
class Traklet {
  // Singleton instance
  private static instance: Traklet | null = null;

  // Core managers
  private configManager: ConfigManager;
  private authManager: AuthManager;
  private stateManager: StateManager;
  private eventBus: EventBus;
  private adapter: IBackendAdapter;
  private offlineQueue: OperationQueue;
  private uiManager: UIManager;

  // Lifecycle
  static init(config: TrakletConfig): Traklet;
  static getInstance(): Traklet | null;
  static destroy(): void;

  // Public API
  show(): void;
  hide(): void;
  toggle(): void;
  refresh(): Promise<void>;
  createIssue(issue: CreateIssueDTO): Promise<Issue>;
  switchProject(projectId: string): Promise<void>;
  setUser(user: TrakletUser): void;
  on(event: TrakletEvent, handler: EventHandler): void;
  off(event: TrakletEvent, handler: EventHandler): void;
}
```

### 4.2 ConfigManager

Handles configuration validation, defaults, and runtime updates.

```typescript
class ConfigManager {
  private config: TrakletConfig;
  private validators: ConfigValidators;

  constructor(initialConfig: TrakletConfig);

  // Validate configuration on init
  validate(): ValidationResult;

  // Get resolved config with defaults
  getConfig(): ResolvedConfig;

  // Runtime updates (limited subset)
  updateConfig(partial: PartialConfig): void;

  // Feature flag helpers
  isFeatureEnabled(feature: FeatureFlag): boolean;
}
```

### 4.3 StateManager

Internal state management using a lightweight store pattern.

```typescript
interface TrakletState {
  // Connection
  isConnected: boolean;
  isOnline: boolean;

  // Data
  issues: Issue[];
  currentIssue: Issue | null;
  labels: Label[];
  users: User[];
  projects: Project[];
  currentProject: Project | null;

  // UI State
  view: 'list' | 'detail' | 'create' | 'edit';
  isExpanded: boolean;
  isLoading: boolean;
  error: TrakletError | null;

  // Offline
  pendingOperations: QueuedOperation[];
  syncStatus: 'idle' | 'syncing' | 'error';

  // Filters
  filters: IssueFilters;
  searchQuery: string;
}

class StateManager {
  private state: TrakletState;
  private listeners: Set<StateListener>;

  getState(): TrakletState;
  setState(partial: Partial<TrakletState>): void;
  subscribe(listener: StateListener): Unsubscribe;

  // Selectors
  getFilteredIssues(): Issue[];
  getPendingCount(): number;
}
```

### 4.4 EventBus

Internal pub/sub system for component communication and external hooks.

```typescript
type InternalEvent =
  | 'ISSUE_CREATED'
  | 'ISSUE_UPDATED'
  | 'ISSUE_DELETED'
  | 'COMMENT_ADDED'
  | 'ATTACHMENT_UPLOADED'
  | 'PROJECT_SWITCHED'
  | 'SYNC_STARTED'
  | 'SYNC_COMPLETED'
  | 'SYNC_FAILED'
  | 'ERROR_OCCURRED';

class EventBus {
  private handlers: Map<string, Set<EventHandler>>;

  // Internal events
  emit(event: InternalEvent, payload?: unknown): void;
  on(event: InternalEvent, handler: EventHandler): void;
  off(event: InternalEvent, handler: EventHandler): void;

  // Bridge to external hooks
  private notifyHooks(event: InternalEvent, payload: unknown): void;
}
```

### 4.5 OperationQueue

Manages offline operations with IndexedDB persistence.

```typescript
interface QueuedOperation {
  id: string;
  type: OperationType;
  payload: unknown;
  timestamp: number;
  retries: number;
  maxRetries: number;
  status: 'pending' | 'syncing' | 'failed' | 'completed';
  error?: string;
}

type OperationType =
  | 'CREATE_ISSUE'
  | 'UPDATE_ISSUE'
  | 'DELETE_ISSUE'
  | 'ADD_COMMENT'
  | 'UPLOAD_ATTACHMENT';

class OperationQueue {
  private db: IDBDatabase;
  private isProcessing: boolean;

  // Queue operations
  enqueue(operation: Omit<QueuedOperation, 'id' | 'status' | 'retries'>): Promise<string>;

  // Process queue
  processQueue(): Promise<SyncResult>;

  // Query
  getPending(): Promise<QueuedOperation[]>;
  getById(id: string): Promise<QueuedOperation | null>;

  // Management
  retry(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;

  // Status
  getStats(): QueueStats;
}

interface SyncResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
  remaining: number;
}
```

---

## 5. Backend Adapters

### 5.1 Adapter Interface

All backends must implement this contract:

```typescript
interface IBackendAdapter {
  // ═══════════════════════════════════════════════════════════════
  // CONNECTION LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Initialize connection to backend
   * @throws {AuthenticationError} If credentials are invalid
   * @throws {NetworkError} If backend is unreachable
   */
  connect(config: AdapterConfig): Promise<ConnectionResult>;

  /**
   * Clean up resources, cancel pending requests
   */
  disconnect(): Promise<void>;

  /**
   * Check if adapter is connected and authenticated
   */
  isConnected(): boolean;

  // ═══════════════════════════════════════════════════════════════
  // ISSUES - CRUD
  // ═══════════════════════════════════════════════════════════════

  /**
   * Fetch issues with filtering, sorting, pagination
   */
  getIssues(query: IssueQuery): Promise<PaginatedResult<Issue>>;

  /**
   * Fetch single issue by ID
   * @throws {NotFoundError} If issue doesn't exist
   */
  getIssue(id: string): Promise<Issue>;

  /**
   * Create a new issue
   * @returns Created issue with backend-assigned ID
   */
  createIssue(issue: CreateIssueDTO): Promise<Issue>;

  /**
   * Update existing issue
   * @throws {NotFoundError} If issue doesn't exist
   * @throws {ConflictError} If issue was modified since last fetch
   */
  updateIssue(id: string, updates: UpdateIssueDTO): Promise<Issue>;

  /**
   * Delete issue (or close, depending on backend)
   */
  deleteIssue(id: string): Promise<void>;

  // ═══════════════════════════════════════════════════════════════
  // COMMENTS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get all comments for an issue
   */
  getComments(issueId: string): Promise<Comment[]>;

  /**
   * Add comment to issue
   */
  addComment(issueId: string, comment: CreateCommentDTO): Promise<Comment>;

  /**
   * Update existing comment (if supported)
   */
  updateComment?(commentId: string, content: string): Promise<Comment>;

  /**
   * Delete comment (if supported)
   */
  deleteComment?(commentId: string): Promise<void>;

  // ═══════════════════════════════════════════════════════════════
  // ATTACHMENTS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Upload file attachment
   * @returns Attachment with URL for embedding
   */
  uploadAttachment(file: File, issueId?: string): Promise<Attachment>;

  /**
   * Get attachment metadata
   */
  getAttachment(id: string): Promise<Attachment>;

  /**
   * Delete attachment (if supported)
   */
  deleteAttachment?(id: string): Promise<void>;

  // ═══════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get available labels/tags
   */
  getLabels(): Promise<Label[]>;

  /**
   * Get users that can be assigned
   */
  getUsers(): Promise<User[]>;

  /**
   * Get available projects (for multi-project setups)
   */
  getProjects(): Promise<Project[]>;

  /**
   * Switch active project context
   */
  switchProject(projectId: string): Promise<void>;

  // ═══════════════════════════════════════════════════════════════
  // CAPABILITIES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Report what features this adapter supports
   * UI uses this to show/hide features
   */
  getCapabilities(): AdapterCapabilities;
}

interface AdapterCapabilities {
  // Feature support
  supportsLabels: boolean;
  supportsAssignees: boolean;
  supportsMilestones: boolean;
  supportsAttachments: boolean;
  supportsCommentEdit: boolean;
  supportsCommentDelete: boolean;
  supportsIssueDelete: boolean;  // vs just close
  supportsMarkdown: boolean;
  supportsCustomFields: boolean;
  supportsMultipleProjects: boolean;

  // Limits
  maxTitleLength: number;
  maxBodyLength: number;
  maxAttachmentSize: number;  // bytes
  allowedAttachmentTypes: string[];  // MIME types
}
```

### 5.2 GitHub Adapter

```typescript
class GitHubAdapter implements IBackendAdapter {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private user: TrakletUser;

  constructor(config: GitHubConfig);

  // Capabilities
  getCapabilities(): AdapterCapabilities {
    return {
      supportsLabels: true,
      supportsAssignees: true,
      supportsMilestones: true,
      supportsAttachments: true,  // via issue body markdown
      supportsCommentEdit: true,
      supportsCommentDelete: true,
      supportsIssueDelete: false,  // GitHub only closes
      supportsMarkdown: true,
      supportsCustomFields: false,
      supportsMultipleProjects: true,
      maxTitleLength: 256,
      maxBodyLength: 65536,
      maxAttachmentSize: 10 * 1024 * 1024,  // 10MB
      allowedAttachmentTypes: ['image/*', 'application/pdf', 'text/*'],
    };
  }

  // Mapping: GitHub Issue → Traklet Issue
  private mapIssue(ghIssue: GitHubIssue): Issue;

  // Mapping: Traklet CreateDTO → GitHub API payload
  private mapCreatePayload(dto: CreateIssueDTO): GitHubCreatePayload;
}

interface GitHubConfig {
  owner: string;
  repo: string;
  apiUrl?: string;  // For GitHub Enterprise

  // Multi-project
  projects?: Array<{
    owner: string;
    repo: string;
    label: string;
  }>;
}
```

### 5.3 Azure DevOps Adapter

```typescript
class AzureDevOpsAdapter implements IBackendAdapter {
  private client: AzureDevOpsClient;
  private organization: string;
  private project: string;
  private user: TrakletUser;

  constructor(config: AzureDevOpsConfig);

  getCapabilities(): AdapterCapabilities {
    return {
      supportsLabels: true,  // Tags
      supportsAssignees: true,
      supportsMilestones: true,  // Iterations
      supportsAttachments: true,
      supportsCommentEdit: true,
      supportsCommentDelete: true,
      supportsIssueDelete: true,
      supportsMarkdown: true,
      supportsCustomFields: true,
      supportsMultipleProjects: true,
      maxTitleLength: 255,
      maxBodyLength: 1000000,
      maxAttachmentSize: 130 * 1024 * 1024,  // 130MB
      allowedAttachmentTypes: ['*/*'],
    };
  }

  // Work Item Type mapping
  private workItemType: string = 'Issue';  // or 'Bug', 'Task', etc.

  // State mapping
  private mapState(adoState: string): IssueStatus;
}

interface AzureDevOpsConfig {
  organization: string;
  project: string;
  workItemType?: 'Issue' | 'Bug' | 'Task' | 'User Story';
  areaPath?: string;
  iterationPath?: string;

  // Multi-project
  projects?: Array<{
    organization: string;
    project: string;
    label: string;
  }>;
}
```

### 5.4 REST Adapter

Generic adapter for custom REST APIs with field mapping.

```typescript
class RestAdapter implements IBackendAdapter {
  private baseUrl: string;
  private fieldMapping: FieldMapping;
  private endpoints: EndpointConfig;

  constructor(config: RestConfig);

  getCapabilities(): AdapterCapabilities {
    // Determined by config
    return this.config.capabilities ?? {
      supportsLabels: true,
      supportsAssignees: true,
      supportsMilestones: false,
      supportsAttachments: true,
      supportsCommentEdit: true,
      supportsCommentDelete: true,
      supportsIssueDelete: true,
      supportsMarkdown: false,
      supportsCustomFields: true,
      supportsMultipleProjects: false,
      maxTitleLength: 500,
      maxBodyLength: 100000,
      maxAttachmentSize: 50 * 1024 * 1024,
      allowedAttachmentTypes: ['*/*'],
    };
  }
}

interface RestConfig {
  baseUrl: string;

  // Custom endpoints (defaults shown)
  endpoints?: {
    issues: string;        // GET/POST: /issues
    issue: string;         // GET/PUT/DELETE: /issues/:id
    comments: string;      // GET/POST: /issues/:id/comments
    attachments: string;   // POST: /attachments
    labels: string;        // GET: /labels
    users: string;         // GET: /users
    projects: string;      // GET: /projects
  };

  // Map your API fields to Traklet fields
  fieldMapping?: {
    issue?: {
      id?: string;           // default: 'id'
      title?: string;        // default: 'title'
      body?: string;         // default: 'body' or 'description'
      status?: string;       // default: 'status'
      labels?: string;       // default: 'labels' or 'tags'
      assignees?: string;    // default: 'assignees'
      createdAt?: string;    // default: 'createdAt' or 'created_at'
      updatedAt?: string;    // default: 'updatedAt' or 'updated_at'
    };
    // ... other entities
  };

  // Status value mapping
  statusMapping?: {
    open?: string[];         // ['open', 'new', 'todo']
    in_progress?: string[];  // ['in_progress', 'doing', 'active']
    resolved?: string[];     // ['resolved', 'done', 'fixed']
    closed?: string[];       // ['closed', 'wontfix', 'duplicate']
  };

  // Additional headers
  headers?: Record<string, string>;

  // Capabilities override
  capabilities?: Partial<AdapterCapabilities>;
}
```

### 5.5 LocalStorage Adapter

For offline-only mode or demos.

```typescript
class LocalStorageAdapter implements IBackendAdapter {
  private storageKey: string;

  constructor(config?: { storageKey?: string });

  getCapabilities(): AdapterCapabilities {
    return {
      supportsLabels: true,
      supportsAssignees: false,
      supportsMilestones: false,
      supportsAttachments: true,  // Base64 in localStorage
      supportsCommentEdit: true,
      supportsCommentDelete: true,
      supportsIssueDelete: true,
      supportsMarkdown: true,
      supportsCustomFields: false,
      supportsMultipleProjects: true,
      maxTitleLength: 500,
      maxBodyLength: 50000,
      maxAttachmentSize: 1 * 1024 * 1024,  // 1MB (localStorage limits)
      allowedAttachmentTypes: ['image/*'],
    };
  }
}
```

### 5.6 Custom Adapter Pattern

```typescript
// Users can implement their own adapter
import { IBackendAdapter, Issue, CreateIssueDTO } from 'traklet';

class MyCustomAdapter implements IBackendAdapter {
  async connect(config: AdapterConfig): Promise<ConnectionResult> {
    // Your connection logic
  }

  async getIssues(query: IssueQuery): Promise<PaginatedResult<Issue>> {
    // Your implementation
  }

  // ... implement all required methods
}

// Register with Traklet
Traklet.init({
  adapter: MyCustomAdapter,
  backend: { /* your config */ },
  // ...
});
```

---

## 6. Data Models

### 6.1 Issue

The unified issue model that all adapters map to/from:

```typescript
interface Issue {
  // ═══════════════════════════════════════════════════════════════
  // CORE FIELDS (Always present)
  // ═══════════════════════════════════════════════════════════════

  /** Unique identifier (backend-specific format) */
  id: string;

  /** Issue title/summary */
  title: string;

  /** Issue description/body (may contain markdown) */
  body: string;

  /** Normalized status */
  status: IssueStatus;

  /** Creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;

  /** Who created the issue */
  createdBy: User;

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL FIELDS (Backend-dependent)
  // ═══════════════════════════════════════════════════════════════

  /** Labels/tags */
  labels?: Label[];

  /** Assigned users */
  assignees?: User[];

  /** Milestone/iteration */
  milestone?: Milestone;

  /** Priority level */
  priority?: Priority;

  /** Due date */
  dueDate?: Date;

  /** Number of comments */
  commentCount?: number;

  /** Attached files */
  attachments?: Attachment[];

  /** Custom fields (backend-specific) */
  customFields?: Record<string, unknown>;

  // ═══════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════

  /** Source information for debugging/linking */
  source: {
    /** Which adapter created this */
    adapter: 'github' | 'azure-devops' | 'rest' | 'localStorage';

    /** Original ID in backend system */
    originalId: string;

    /** Direct link to issue in backend UI */
    url?: string;

    /** Project/repo this belongs to */
    project?: string;
  };
}

type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

type Priority = 'low' | 'medium' | 'high' | 'critical';
```

### 6.2 Comment

```typescript
interface Comment {
  id: string;
  issueId: string;
  body: string;
  createdAt: Date;
  updatedAt?: Date;
  author: User;

  // For threaded comments (if supported)
  parentId?: string;

  // Reactions (if supported)
  reactions?: Reaction[];
}

interface Reaction {
  type: string;  // '+1', '-1', 'heart', etc.
  count: number;
  userReacted: boolean;
}
```

### 6.3 Attachment

```typescript
interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;  // bytes
  url: string;   // Download/embed URL
  thumbnailUrl?: string;  // For images
  createdAt: Date;
  createdBy?: User;

  // For inline embedding
  markdownEmbed?: string;  // e.g., "![image](url)"
}
```

### 6.4 User

```typescript
interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;

  // Backend-specific
  username?: string;  // GitHub
  displayName?: string;  // Azure DevOps
}

// User identity passed in config
interface TrakletUser {
  email: string;   // REQUIRED - unique identifier
  name: string;    // REQUIRED - display name
  avatar?: string; // Optional - avatar URL
}
```

### 6.5 Other Models

```typescript
interface Label {
  id: string;
  name: string;
  color?: string;  // Hex color
  description?: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;

  // Backend-specific identifiers
  owner?: string;  // GitHub
  organization?: string;  // Azure DevOps
}

interface Milestone {
  id: string;
  title: string;
  description?: string;
  dueDate?: Date;
  state: 'open' | 'closed';
}
```

### 6.6 Query & Pagination

```typescript
interface IssueQuery {
  // Filtering
  status?: IssueStatus | IssueStatus[];
  labels?: string[];
  assignee?: string;
  createdBy?: string;
  project?: string;
  search?: string;  // Full-text search

  // Date filters
  createdAfter?: Date;
  createdBefore?: Date;
  updatedAfter?: Date;

  // Sorting
  sortBy?: 'created' | 'updated' | 'title' | 'priority';
  sortOrder?: 'asc' | 'desc';

  // Pagination
  page?: number;
  pageSize?: number;
  cursor?: string;  // For cursor-based pagination
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor?: string;
}
```

---

## 7. User Interface

### 7.1 Full GUI Overview

Traklet provides a **complete issue management GUI** with full CRUD capabilities:

| Capability | Description | Permission Required |
|------------|-------------|---------------------|
| **View Issues** | Browse list, search, filter, view details | None (always allowed) |
| **View Attachments** | View images inline, download files | None (always allowed) |
| **Create Issues** | Submit new issues with attachments | Configurable (see §9) |
| **Edit Issues** | Modify title, body, labels, attachments | Owner or Admin |
| **Delete Issues** | Remove issues permanently | Owner or Admin |
| **Add Comments** | Comment on any issue | Configurable (see §9) |
| **Edit Comments** | Modify own comments | Comment Owner |
| **Delete Comments** | Remove own comments | Comment Owner |

### 7.2 Component Architecture

```
TrakletWidget (Shadow DOM Host)
├── WidgetLauncher              // Floating button to open/close
├── WidgetContainer             // Main container
│   ├── Header
│   │   ├── ProjectSelector     // Multi-project dropdown
│   │   ├── SearchBox
│   │   ├── ViewToggle          // List/Board view
│   │   └── UserBadge           // Current user indicator
│   │
│   ├── FilterBar
│   │   ├── StatusFilter
│   │   ├── LabelFilter
│   │   ├── AssigneeFilter
│   │   └── MyIssuesToggle      // Filter to current user's issues
│   │
│   ├── ContentArea
│   │   ├── IssueList           // List view
│   │   │   └── IssueCard[]
│   │   │       ├── Title
│   │   │       ├── Status badge
│   │   │       ├── Labels
│   │   │       ├── Thumbnail (if has images)
│   │   │       └── Meta (created by, date)
│   │   │
│   │   ├── IssueDetail         // Single issue view (FULL GUI)
│   │   │   ├── IssueHeader
│   │   │   │   ├── Title (editable if owner)
│   │   │   │   ├── Status selector (editable if owner)
│   │   │   │   ├── EditButton (if owner)
│   │   │   │   └── DeleteButton (if owner)
│   │   │   │
│   │   │   ├── IssueBody
│   │   │   │   ├── Markdown rendered content
│   │   │   │   └── InlineEditButton (if owner)
│   │   │   │
│   │   │   ├── IssueMetadata
│   │   │   │   ├── Created by (with avatar)
│   │   │   │   ├── Created date
│   │   │   │   ├── Last updated
│   │   │   │   ├── Labels (editable if owner)
│   │   │   │   └── Assignees (editable if owner)
│   │   │   │
│   │   │   ├── AttachmentGallery      // IMAGE VIEWING
│   │   │   │   ├── ImageThumbnail[]   // Click to expand
│   │   │   │   ├── ImageLightbox      // Full-size viewer
│   │   │   │   ├── FileDownloadLink[] // Non-image files
│   │   │   │   └── AddAttachmentBtn   // (if owner)
│   │   │   │
│   │   │   └── CommentThread
│   │   │       ├── CommentItem[]
│   │   │       │   ├── Author (avatar + name)
│   │   │       │   ├── Timestamp
│   │   │       │   ├── Body (markdown)
│   │   │       │   ├── EditButton (if comment owner)
│   │   │       │   └── DeleteButton (if comment owner)
│   │   │       └── CommentForm (if allowed)
│   │   │
│   │   ├── IssueForm           // Create/Edit form
│   │   │   ├── TitleInput
│   │   │   ├── BodyEditor (markdown with preview)
│   │   │   ├── LabelSelector
│   │   │   ├── PrioritySelector
│   │   │   ├── AttachmentUpload
│   │   │   │   ├── DropZone
│   │   │   │   ├── FilePickerButton
│   │   │   │   └── PasteSupport
│   │   │   ├── ScreenshotCapture
│   │   │   ├── AttachmentPreview[]
│   │   │   ├── SubmitButton
│   │   │   └── CancelButton
│   │   │
│   │   └── ImageLightbox       // Full-screen image viewer
│   │       ├── CurrentImage
│   │       ├── NavigationArrows
│   │       ├── ZoomControls
│   │       ├── DownloadButton
│   │       └── CloseButton
│   │
│   └── Footer
│       ├── OfflineIndicator
│       ├── SyncStatus
│       ├── PendingCount
│       └── CreateButton (if allowed)
│
├── ConfirmDialog               // Delete confirmations
├── ToastContainer              // Notifications
└── PermissionDeniedOverlay     // When action not allowed
```

### 7.3 Issue Detail View (Full Specification)

The issue detail view is the primary interface for viewing and managing a single issue.

#### 7.3.1 Header Section

```typescript
interface IssueDetailHeader {
  // Always visible
  backButton: boolean;           // Navigate to list
  title: string;                 // Issue title
  status: IssueStatus;           // Status badge
  issueNumber: string;           // e.g., "#123"

  // Conditional on permissions
  editButton?: boolean;          // Owner/admin only
  deleteButton?: boolean;        // Owner/admin only
  statusDropdown?: boolean;      // Owner/admin can change status
}
```

#### 7.3.2 Body Section

- **View Mode**: Markdown rendered to HTML (sanitized)
- **Edit Mode**: Markdown editor with live preview (owner only)
- **Inline Images**: Images in markdown rendered inline
- **Code Blocks**: Syntax highlighting for code snippets

#### 7.3.3 Attachment Gallery

```typescript
interface AttachmentGallery {
  // Image attachments
  images: Array<{
    id: string;
    thumbnailUrl: string;    // Small preview (150px)
    fullUrl: string;         // Original size
    filename: string;
    size: number;
  }>;

  // Non-image files
  files: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    downloadUrl: string;
  }>;

  // Actions (permission-dependent)
  canAdd: boolean;
  canDelete: boolean;
}
```

**Image Lightbox Features:**
- Full-screen image viewing
- Zoom in/out (mouse wheel, pinch)
- Pan when zoomed
- Navigate between images (arrows, swipe)
- Download original
- Close (X, Escape, click outside)

#### 7.3.4 Comment Thread

```typescript
interface CommentThread {
  comments: Comment[];
  canAddComment: boolean;        // Based on permissions
  sortOrder: 'oldest' | 'newest';

  // Per-comment actions
  canEdit: (comment: Comment) => boolean;   // true if user is author
  canDelete: (comment: Comment) => boolean; // true if user is author
}
```

### 7.4 Issue Form (Create/Edit)

The same form component is used for both creating and editing issues.

```typescript
interface IssueFormConfig {
  mode: 'create' | 'edit';
  issue?: Issue;                 // Populated in edit mode

  // Field configuration
  fields: {
    title: { required: true; maxLength: number };
    body: { required: false; maxLength: number; markdown: true };
    labels: { enabled: boolean; multiple: true };
    priority: { enabled: boolean };
    assignees: { enabled: boolean; multiple: true };
    attachments: { enabled: boolean; maxFiles: number; maxSize: number };
  };

  // Callbacks
  onSubmit: (data: CreateIssueDTO | UpdateIssueDTO) => Promise<void>;
  onCancel: () => void;
}
```

**Form Features:**
- Real-time validation
- Markdown preview toggle
- Drag-and-drop file upload
- Paste image from clipboard
- Screenshot capture button
- Attachment preview with remove option
- Unsaved changes warning

### 7.5 Widget States

| State | Description | Trigger |
|-------|-------------|---------|
| `collapsed` | Only launcher button visible | Click close, hotkey, init |
| `expanded` | Full widget panel visible | Click launcher, hotkey |
| `loading` | Spinner overlay | API calls |
| `error` | Error message display | API/network errors |
| `offline` | Offline indicator | Network disconnect |
| `syncing` | Sync progress indicator | Queue processing |

### 7.3 Views

| View | Route | Description |
|------|-------|-------------|
| `list` | `/` | Paginated issue list with filters |
| `detail` | `/issue/:id` | Single issue with comments |
| `create` | `/new` | New issue form |
| `edit` | `/issue/:id/edit` | Edit issue form |

### 7.4 Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| `< 480px` | Full-screen modal overlay |
| `480px - 768px` | Side panel (40% width) |
| `> 768px` | Side panel (400px fixed) |
| `inline` mode | Expands to container width |

### 7.5 Theme System

```typescript
interface ThemeConfig {
  // Colors
  colors: {
    primary: string;
    primaryHover: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    error: string;
    success: string;
    warning: string;
  };

  // Typography
  typography: {
    fontFamily: string;
    fontSize: {
      xs: string;
      sm: string;
      md: string;
      lg: string;
      xl: string;
    };
  };

  // Spacing
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };

  // Borders
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    full: string;
  };

  // Shadows
  shadows: {
    sm: string;
    md: string;
    lg: string;
  };
}

// CSS Custom Properties exposed for host customization
:host {
  --traklet-primary: #0066cc;
  --traklet-background: #ffffff;
  --traklet-text: #1a1a1a;
  /* ... etc */
}
```

### 7.6 Accessibility Requirements

| Requirement | Implementation |
|-------------|----------------|
| Keyboard navigation | Full tab order, arrow keys in lists |
| Screen readers | ARIA labels, live regions for updates |
| Focus management | Trap focus in modal, restore on close |
| Color contrast | WCAG AA minimum (4.5:1 for text) |
| Reduced motion | Respect `prefers-reduced-motion` |
| Focus indicators | Visible focus rings on all interactive elements |

### 7.7 Test IDs

All interactive elements must have `data-testid` attributes:

```typescript
// Pattern: traklet-{component}-{element}
const TEST_IDS = {
  // Launcher
  launcher: 'traklet-launcher',
  launcherButton: 'traklet-launcher-btn',

  // Container
  widget: 'traklet-widget',
  closeButton: 'traklet-btn-close',

  // List
  issueList: 'traklet-list-issues',
  issueCard: (id: string) => `traklet-item-${id}`,

  // Form
  createForm: 'traklet-form-create',
  titleInput: 'traklet-input-title',
  bodyInput: 'traklet-input-body',
  submitButton: 'traklet-btn-submit',

  // etc.
};
```

---

## 8. Authentication & Identity

### 8.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    HOST APPLICATION                          │
│                                                              │
│  1. Host obtains PAT token (from vault, env, user input)    │
│                          │                                   │
│                          ▼                                   │
│  2. Host initializes Traklet with token + user identity     │
│     ┌──────────────────────────────────────────────────┐    │
│     │ Traklet.init({                                   │    │
│     │   auth: { token: 'pat_xxx' },                    │    │
│     │   user: { email: 'a@b.com', name: 'Alice' }      │    │
│     │ });                                              │    │
│     └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    TRAKLET WIDGET                            │
│                                                              │
│  3. AuthManager stores token in memory (NOT localStorage)   │
│                          │                                   │
│  4. Token attached to all adapter requests                  │
│                          │                                   │
│  5. User identity used for:                                 │
│     - Display in comments/issues created                    │
│     - Filtering "my issues"                                 │
│     - Attributing offline operations                        │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 AuthManager

```typescript
class AuthManager {
  private token: string | null = null;
  private tokenGetter: (() => Promise<string>) | null = null;
  private user: TrakletUser | null = null;

  // Initialize from config
  configure(config: AuthConfig): void;

  // Get current token (may call getter)
  async getToken(): Promise<string>;

  // Get auth header for requests
  async getAuthHeader(): Promise<Record<string, string>>;

  // User identity
  getUser(): TrakletUser | null;
  setUser(user: TrakletUser): void;

  // Clear credentials
  clear(): void;
}

interface AuthConfig {
  // Static token
  token?: string;

  // Dynamic token getter (for refresh scenarios)
  getToken?: () => Promise<string>;

  // Token type for Authorization header
  tokenType?: 'Bearer' | 'Basic' | 'token';  // default: 'Bearer'
}
```

### 8.3 User Identity Requirements

| Field | Required | Usage |
|-------|----------|-------|
| `email` | Yes | Unique identifier, matching against backend users |
| `name` | Yes | Display name in UI, comments |
| `avatar` | No | Profile picture URL |

```typescript
// Example: User identity in config
Traklet.init({
  // ... other config
  user: {
    email: 'developer@company.com',
    name: 'Jane Developer',
    avatar: 'https://avatars.example.com/jane.png'
  }
});

// Example: Update user at runtime
Traklet.getInstance()?.setUser({
  email: 'other@company.com',
  name: 'Other User'
});
```

---

## 9. Permissions & User Matching

### 9.1 Overview

Traklet implements a **user-based permission system** that determines what actions the current user can perform. Permissions are based on matching the configured user identity against issue/comment authors in the backend.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PERMISSION FLOW                                   │
│                                                                          │
│  1. User configures Traklet with identity:                              │
│     { email: 'alice@company.com', name: 'Alice' }                       │
│                                                                          │
│  2. Traklet fetches issues from backend                                 │
│                                                                          │
│  3. For each issue, check: issue.createdBy.email === user.email?        │
│     ├── YES → User is OWNER → Can edit, delete                          │
│     └── NO  → User is VIEWER → Read-only (unless anonymous mode)        │
│                                                                          │
│  4. Same logic for comments:                                            │
│     comment.author.email === user.email? → Can edit/delete own comments │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Permission Levels

| Level | Description | Capabilities |
|-------|-------------|--------------|
| **Owner** | User created this issue/comment | Full control: view, edit, delete |
| **Authenticated** | User has valid identity but didn't create item | View, comment (if enabled) |
| **Anonymous** | No user identity provided | Configurable (see §9.4) |

### 9.3 User Matching Logic

The `PermissionManager` compares the current user against resource authors:

```typescript
class PermissionManager {
  private currentUser: TrakletUser | null;
  private config: PermissionConfig;

  constructor(user: TrakletUser | null, config: PermissionConfig);

  // ═══════════════════════════════════════════════════════════════
  // ISSUE PERMISSIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if current user can edit an issue
   * TRUE if: user.email matches issue.createdBy.email
   */
  canEditIssue(issue: Issue): boolean {
    if (!this.currentUser) return false;
    return this.matchesUser(issue.createdBy);
  }

  /**
   * Check if current user can delete an issue
   * TRUE if: user.email matches issue.createdBy.email
   */
  canDeleteIssue(issue: Issue): boolean {
    if (!this.currentUser) return false;
    return this.matchesUser(issue.createdBy);
  }

  /**
   * Check if current user can create issues
   * TRUE if: user is authenticated OR anonymous creation is enabled
   */
  canCreateIssue(): boolean {
    if (this.currentUser) return true;
    return this.config.anonymousMode === 'view_create';
  }

  // ═══════════════════════════════════════════════════════════════
  // COMMENT PERMISSIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if current user can add comments
   * TRUE if: user is authenticated OR anonymous comments enabled
   */
  canAddComment(): boolean {
    if (this.currentUser) return true;
    return this.config.anonymousMode === 'view_create';
  }

  /**
   * Check if current user can edit a comment
   * TRUE if: user.email matches comment.author.email
   */
  canEditComment(comment: Comment): boolean {
    if (!this.currentUser) return false;
    return this.matchesUser(comment.author);
  }

  /**
   * Check if current user can delete a comment
   * TRUE if: user.email matches comment.author.email
   */
  canDeleteComment(comment: Comment): boolean {
    if (!this.currentUser) return false;
    return this.matchesUser(comment.author);
  }

  // ═══════════════════════════════════════════════════════════════
  // USER MATCHING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Compare current user against a resource author
   * Matching strategy: email (primary) or fallback to ID
   */
  private matchesUser(author: User): boolean {
    if (!this.currentUser || !author) return false;

    // Primary match: email (case-insensitive)
    if (this.currentUser.email && author.email) {
      return this.currentUser.email.toLowerCase() === author.email.toLowerCase();
    }

    // Fallback: ID match (for backends without email)
    if (this.currentUser.id && author.id) {
      return this.currentUser.id === author.id;
    }

    // Fallback: username match (GitHub)
    if (this.currentUser.username && author.username) {
      return this.currentUser.username.toLowerCase() === author.username.toLowerCase();
    }

    return false;
  }
}
```

### 9.4 Anonymous User Mode

When no user identity is provided, Traklet operates in **anonymous mode**. The behavior is configurable:

```typescript
type AnonymousMode = 'view_only' | 'view_create';

interface PermissionConfig {
  /**
   * Behavior when no user identity is provided
   *
   * 'view_only'   - Can only view issues and comments (DEFAULT)
   * 'view_create' - Can view AND create new issues/comments
   */
  anonymousMode: AnonymousMode;
}
```

#### Anonymous Mode Comparison

| Action | `view_only` | `view_create` |
|--------|-------------|---------------|
| View issue list | ✅ | ✅ |
| View issue detail | ✅ | ✅ |
| View attachments/images | ✅ | ✅ |
| View comments | ✅ | ✅ |
| Create new issue | ❌ | ✅ |
| Edit any issue | ❌ | ❌ |
| Delete any issue | ❌ | ❌ |
| Add comment | ❌ | ✅ |
| Edit any comment | ❌ | ❌ |
| Delete any comment | ❌ | ❌ |

### 9.5 Backend User Resolution

When Traklet loads issues, it needs to map backend user identifiers to the configured user identity:

```typescript
interface UserMatchingConfig {
  /**
   * Field used to match users between Traklet config and backend
   * Default: 'email'
   */
  matchField: 'email' | 'id' | 'username';

  /**
   * For backends that don't return email in issue data,
   * optionally fetch user details to get email
   */
  fetchUserDetails?: boolean;
}
```

#### Backend-Specific Matching

| Backend | Primary Match | Fallback | Notes |
|---------|--------------|----------|-------|
| **GitHub** | `email` | `username` (login) | May need user API call for email |
| **Azure DevOps** | `email` | `id` (uniqueName) | Email usually available |
| **REST** | Configurable | Configurable | Use `fieldMapping` |
| **LocalStorage** | `email` | `id` | Always matches (local only) |

### 9.6 Configuration Examples

#### Example 1: Authenticated User (Full Permissions for Own Content)

```typescript
Traklet.init({
  adapter: 'github',
  backend: { owner: 'myorg', repo: 'myrepo' },
  user: {
    email: 'developer@company.com',
    name: 'Jane Developer'
  },
  auth: { token: 'ghp_xxxx' }
});

// Jane can:
// - View all issues
// - Create new issues
// - Edit/delete issues she created
// - Add comments
// - Edit/delete her own comments
```

#### Example 2: Anonymous View-Only Mode

```typescript
Traklet.init({
  adapter: 'github',
  backend: { owner: 'myorg', repo: 'myrepo' },
  // No user provided!
  auth: { token: 'ghp_xxxx' },  // Read-only token
  permissions: {
    anonymousMode: 'view_only'  // DEFAULT
  }
});

// Anonymous user can:
// - View all issues
// - View all comments
// - View all attachments
// Cannot: create, edit, or delete anything
```

#### Example 3: Anonymous View + Create Mode (Public Feedback)

```typescript
Traklet.init({
  adapter: 'github',
  backend: { owner: 'myorg', repo: 'feedback' },
  // No user provided - public feedback widget
  auth: { token: 'ghp_xxxx' },
  permissions: {
    anonymousMode: 'view_create'
  },
  defaults: {
    labels: ['user-feedback']
  }
});

// Anonymous user can:
// - View all issues
// - Create new issues (labeled as 'user-feedback')
// - Add comments
// Cannot: edit or delete anything (no ownership)
```

### 9.7 UI Permission Indicators

The UI reflects permissions dynamically:

```typescript
// Issue card in list view
interface IssueCardUI {
  // Always shown
  title: string;
  status: IssueStatus;
  labels: Label[];
  createdBy: string;

  // Permission-dependent
  showEditIndicator: boolean;  // Shows pencil icon if canEdit
  showOwnerBadge: boolean;     // Shows "You" badge if owner
}

// Issue detail view
interface IssueDetailUI {
  // Action buttons (hidden if no permission)
  showEditButton: boolean;
  showDeleteButton: boolean;
  showStatusDropdown: boolean;
  showAddAttachmentButton: boolean;

  // Comment section
  showCommentForm: boolean;

  // Per-comment actions
  commentActions: (comment: Comment) => {
    showEditButton: boolean;
    showDeleteButton: boolean;
  };
}
```

### 9.8 Permission State in StateManager

```typescript
interface TrakletState {
  // ... existing fields ...

  // Permission state
  permissions: {
    currentUser: TrakletUser | null;
    isAuthenticated: boolean;
    anonymousMode: AnonymousMode;

    // Computed permissions (cached)
    canCreateIssue: boolean;
    canAddComment: boolean;
  };
}
```

### 9.9 Permission Events

```typescript
// Events emitted for permission-related actions
type PermissionEvent =
  | 'permission-denied'      // User tried unauthorized action
  | 'user-changed'          // User identity updated
  | 'anonymous-mode-active'; // Operating without user identity

// Permission denied payload
interface PermissionDeniedEvent {
  action: 'edit_issue' | 'delete_issue' | 'edit_comment' | 'delete_comment' | 'create_issue';
  resourceId?: string;
  reason: 'not_owner' | 'anonymous' | 'no_auth';
}
```

---

## 10. Offline Support

### 10.1 Offline Detection

```typescript
class OfflineManager {
  private isOnline: boolean;
  private listeners: Set<(online: boolean) => void>;

  constructor() {
    this.isOnline = navigator.onLine;

    window.addEventListener('online', () => this.setOnline(true));
    window.addEventListener('offline', () => this.setOnline(false));
  }

  // Also ping backend to detect "lie-fi"
  async checkConnectivity(): Promise<boolean>;
}
```

### 9.2 Operation Queue Storage

```typescript
// IndexedDB Schema
const DB_NAME = 'traklet';
const DB_VERSION = 1;

interface TrakletDB {
  operations: {
    key: string;  // operation ID
    value: QueuedOperation;
    indexes: {
      byStatus: 'status';
      byTimestamp: 'timestamp';
    };
  };

  cache: {
    key: string;  // cache key
    value: {
      data: unknown;
      timestamp: number;
      ttl: number;
    };
  };
}
```

### 9.3 Sync Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                    ONLINE → OFFLINE                           │
│                                                               │
│  1. Detect offline state                                     │
│  2. Show offline indicator in UI                             │
│  3. Switch to optimistic mode:                               │
│     - All mutations go to queue                              │
│     - UI updates immediately (optimistic)                    │
│     - Generate temporary IDs for new items                   │
│  4. Reads served from cache + pending operations             │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    OFFLINE → ONLINE                           │
│                                                               │
│  1. Detect online state                                      │
│  2. Show "Syncing..." indicator                              │
│  3. Process queue in order:                                  │
│     - Create operations first                                │
│     - Then updates (resolve temp IDs)                        │
│     - Then deletes                                           │
│  4. Handle conflicts:                                        │
│     - If item was modified, prompt user                      │
│     - If item was deleted, notify user                       │
│  5. Clear processed operations                               │
│  6. Refresh data from backend                                │
│  7. Show "Synced" confirmation                               │
└──────────────────────────────────────────────────────────────┘
```

### 9.4 Conflict Resolution

```typescript
type ConflictResolution = 'keep_local' | 'keep_remote' | 'merge' | 'skip';

interface ConflictEvent {
  type: 'CONFLICT_DETECTED';
  operation: QueuedOperation;
  localData: Issue;
  remoteData: Issue;

  // Resolution callback
  resolve(resolution: ConflictResolution): void;
}

// Default: Auto-resolve with "keep_local" for user's own changes
// Configurable via hooks for custom handling
```

---

## 11. Attachments & Screenshots

### 10.1 Attachment Flow

```
┌───────────────────────────────────────────────────────────────┐
│                    ATTACHMENT UPLOAD FLOW                      │
│                                                                │
│  User Action: Drop file / Click upload / Paste image          │
│                          │                                     │
│                          ▼                                     │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ 1. VALIDATION                                          │   │
│  │    - Check file type against allowedAttachmentTypes    │   │
│  │    - Check file size against maxAttachmentSize         │   │
│  │    - Generate preview for images                       │   │
│  └────────────────────────────────────────────────────────┘   │
│                          │                                     │
│                          ▼                                     │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ 2. UPLOAD (Online) or QUEUE (Offline)                  │   │
│  │    Online: adapter.uploadAttachment(file)              │   │
│  │    Offline: Store base64 in queue                      │   │
│  └────────────────────────────────────────────────────────┘   │
│                          │                                     │
│                          ▼                                     │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ 3. EMBED IN ISSUE                                      │   │
│  │    - Insert markdown: ![filename](url)                 │   │
│  │    - Or store in attachments array                     │   │
│  └────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

### 10.2 Screenshot Capture

```typescript
class ScreenshotManager {
  /**
   * Capture screenshot of the host page
   * Excludes the Traklet widget itself
   */
  async captureHostPage(): Promise<Blob> {
    const canvas = await html2canvas(document.body, {
      ignoreElements: (element) => {
        // Exclude Traklet widget
        return element.hasAttribute('data-traklet-widget');
      },
      // Capture full page or viewport
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
    });

    return new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
  }

  /**
   * Capture a selected region
   */
  async captureRegion(rect: DOMRect): Promise<Blob>;

  /**
   * Open native screenshot tool (if available)
   */
  async openNativeScreenshot(): Promise<Blob | null>;
}
```

### 10.3 Backend-Specific Attachment Handling

| Backend | Upload Method | Storage | Embedding |
|---------|--------------|---------|-----------|
| GitHub | POST to upload API | GitHub CDN | Markdown `![](url)` |
| Azure DevOps | POST to attachments API | Azure Blob | Work item attachment |
| REST | Configurable endpoint | Your storage | Configurable |
| LocalStorage | Base64 encode | IndexedDB | Data URL |

### 10.4 AttachmentManager

```typescript
class AttachmentManager {
  constructor(
    private adapter: IBackendAdapter,
    private offlineQueue: OperationQueue
  );

  /**
   * Upload file, handling online/offline
   */
  async upload(file: File, issueId?: string): Promise<Attachment>;

  /**
   * Capture and upload screenshot
   */
  async uploadScreenshot(): Promise<Attachment>;

  /**
   * Validate file before upload
   */
  validate(file: File): ValidationResult;

  /**
   * Generate preview for images
   */
  generatePreview(file: File): Promise<string>;  // Data URL

  /**
   * Get markdown embed string
   */
  getMarkdownEmbed(attachment: Attachment): string;
}
```

---

## 12. Configuration API

### 11.1 Complete Configuration Schema

```typescript
interface TrakletConfig {
  // ═══════════════════════════════════════════════════════════════
  // REQUIRED
  // ═══════════════════════════════════════════════════════════════

  /**
   * Backend adapter to use
   * Built-in: 'github', 'azure-devops', 'rest', 'localStorage'
   * Custom: Pass adapter class constructor
   */
  adapter: 'github' | 'azure-devops' | 'rest' | 'localStorage' | AdapterConstructor;

  /**
   * Backend-specific configuration
   */
  backend: GitHubConfig | AzureDevOpsConfig | RestConfig | LocalStorageConfig;

  /**
   * User identity (OPTIONAL - for attribution and permissions)
   * If not provided, operates in anonymous mode (see permissions.anonymousMode)
   */
  user?: TrakletUser;

  /**
   * Authentication configuration
   */
  auth: {
    /** Static PAT token */
    token?: string;

    /** Dynamic token getter (called before each request if token expired) */
    getToken?: () => Promise<string>;

    /** Token type for Authorization header (default: 'Bearer') */
    tokenType?: 'Bearer' | 'Basic' | 'token';
  };

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL - UI Configuration
  // ═══════════════════════════════════════════════════════════════

  ui?: {
    /**
     * Widget position on screen
     * 'inline' embeds in a container element
     * Default: 'bottom-right'
     */
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'inline';

    /**
     * Container selector for 'inline' position
     */
    container?: string;

    /**
     * Theme configuration
     * Default: 'auto' (follows system preference)
     */
    theme?: 'light' | 'dark' | 'auto' | ThemeConfig;

    /**
     * Default view when widget opens
     * Default: 'list'
     */
    defaultView?: 'list' | 'create';

    /**
     * Launcher button configuration
     */
    launcher?: {
      /** Custom icon (SVG string or URL) */
      icon?: string;

      /** Tooltip text */
      text?: string;

      /** Keyboard shortcut (e.g., 'ctrl+shift+i') */
      hotkey?: string;

      /** Hide launcher (for inline mode or programmatic control) */
      hidden?: boolean;
    };

    /**
     * Branding customization
     */
    branding?: {
      /** Logo URL */
      logo?: string;

      /** Widget title */
      title?: string;

      /** Primary brand color */
      primaryColor?: string;
    };

    /**
     * Z-index for widget (default: 999999)
     */
    zIndex?: number;
  };

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL - Feature Flags
  // ═══════════════════════════════════════════════════════════════

  features?: {
    /** Allow creating new issues (default: true) */
    createIssue?: boolean;

    /** Allow editing issues (default: true) */
    editIssue?: boolean;

    /** Allow deleting issues (default: false) */
    deleteIssue?: boolean;

    /** Enable comments (default: true) */
    comments?: boolean;

    /** Enable file attachments (default: true) */
    attachments?: boolean;

    /** Enable screenshot capture (default: true) */
    screenshots?: boolean;

    /** Enable search (default: true) */
    search?: boolean;

    /** Enable filters (default: true) */
    filters?: boolean;

    /** Enable offline support (default: true) */
    offlineSupport?: boolean;

    /** Enable project switching (default: true if multiple projects) */
    projectSwitching?: boolean;
  };

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL - Permissions Configuration
  // ═══════════════════════════════════════════════════════════════

  permissions?: {
    /**
     * Behavior when no user identity is provided
     * 'view_only'   - Can only view issues and comments (DEFAULT)
     * 'view_create' - Can view AND create new issues/comments
     */
    anonymousMode?: 'view_only' | 'view_create';

    /**
     * Field used to match users between Traklet config and backend
     * Default: 'email'
     */
    matchField?: 'email' | 'id' | 'username';

    /**
     * For backends that don't return email in issue data,
     * optionally fetch user details to get email
     */
    fetchUserDetails?: boolean;
  };

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL - Hooks for Host Integration
  // ═══════════════════════════════════════════════════════════════

  hooks?: {
    /** Called after issue is created */
    onIssueCreate?: (issue: Issue) => void | Promise<void>;

    /** Called after issue is updated */
    onIssueUpdate?: (issue: Issue) => void | Promise<void>;

    /** Called after issue is deleted */
    onIssueDelete?: (id: string) => void | Promise<void>;

    /** Called on any error */
    onError?: (error: TrakletError) => void;

    /** Called when widget opens */
    onOpen?: () => void;

    /** Called when widget closes */
    onClose?: () => void;

    /** Called before sync starts */
    onSyncStart?: () => void;

    /** Called after sync completes */
    onSyncComplete?: (result: SyncResult) => void;

    /**
     * Transform issue before display
     * Useful for adding computed fields or masking data
     */
    transformIssue?: (issue: Issue) => Issue;

    /**
     * Get context data to auto-attach to new issues
     * e.g., current URL, user session info, app version
     */
    getContextData?: () => Record<string, unknown> | Promise<Record<string, unknown>>;

    /**
     * Custom conflict resolver
     * Return resolution strategy for offline sync conflicts
     */
    onConflict?: (event: ConflictEvent) => ConflictResolution | Promise<ConflictResolution>;
  };

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL - Default Values for New Issues
  // ═══════════════════════════════════════════════════════════════

  defaults?: {
    /** Default labels to apply */
    labels?: string[];

    /** Default assignees */
    assignees?: string[];

    /** Default priority */
    priority?: Priority;

    /** Template for issue body */
    bodyTemplate?: string;
  };

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL - Advanced
  // ═══════════════════════════════════════════════════════════════

  advanced?: {
    /** Cache TTL in milliseconds (default: 5 minutes) */
    cacheTTL?: number;

    /** Request timeout in milliseconds (default: 30 seconds) */
    requestTimeout?: number;

    /** Max retry attempts for failed requests (default: 3) */
    maxRetries?: number;

    /** Page size for issue lists (default: 25) */
    pageSize?: number;

    /** Enable debug logging (default: false) */
    debug?: boolean;
  };
}
```

### 11.2 Configuration Validation

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  path: string;      // e.g., 'auth.token'
  message: string;
  code: string;      // e.g., 'REQUIRED_FIELD'
}

// Validation rules
const validationRules = {
  'adapter': { required: true, type: 'string | function' },
  'backend': { required: true, type: 'object' },
  'user.email': { required: true, type: 'string', format: 'email' },
  'user.name': { required: true, type: 'string', minLength: 1 },
  'auth.token': { requiredIf: '!auth.getToken' },
  // ...
};
```

---

## 13. Integration Patterns

### 13.1 One-Line Script Tag (Simplest)

```html
<!-- Absolute simplest - data attributes configuration -->
<script src="https://cdn.traklet.io/v1/traklet.js"
        data-adapter="github"
        data-repo="owner/repo"
        data-token="ghp_xxx">
</script>
<!-- Widget appears automatically in bottom-right -->
```

### 13.2 Script Tag with Config

```html
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
</head>
<body>
  <!-- Your app content -->

  <!-- Traklet Widget -->
  <script src="https://unpkg.com/traklet@latest/dist/traklet.min.js"></script>
  <script>
    Traklet.init({
      adapter: 'github',
      backend: {
        owner: 'myorg',
        repo: 'myrepo'
      },
      user: {
        email: 'user@example.com',
        name: 'User Name'
      },
      auth: {
        token: 'ghp_xxxxxxxxxxxx'
      }
    });
  </script>
</body>
</html>
```

### 13.3 ES Module Import

```typescript
// npm install traklet
import { Traklet } from 'traklet';

// Initialize
const tracker = Traklet.init({
  adapter: 'azure-devops',
  backend: {
    organization: 'myorg',
    project: 'myproject'
  },
  user: {
    email: getCurrentUser().email,
    name: getCurrentUser().name
  },
  auth: {
    getToken: async () => {
      // Fetch token from your auth system
      return await authService.getAzureToken();
    }
  },
  hooks: {
    getContextData: () => ({
      url: window.location.href,
      userAgent: navigator.userAgent,
      appVersion: APP_VERSION
    })
  }
});

// Programmatic control
document.getElementById('report-bug').addEventListener('click', () => {
  tracker.show();
});
```

### 13.4 React Integration

```tsx
// components/TrakletProvider.tsx
import { useEffect } from 'react';
import { Traklet } from 'traklet';
import { useAuth } from './auth-context';

export function TrakletProvider({ children }: { children: React.ReactNode }) {
  const { user, getToken } = useAuth();

  useEffect(() => {
    if (!user) return;

    const tracker = Traklet.init({
      adapter: 'github',
      backend: { owner: 'myorg', repo: 'myrepo' },
      user: {
        email: user.email,
        name: user.displayName,
        avatar: user.avatarUrl
      },
      auth: { getToken },
      ui: {
        position: 'bottom-right',
        theme: 'auto'
      }
    });

    return () => {
      Traklet.destroy();
    };
  }, [user, getToken]);

  return <>{children}</>;
}
```

### 13.5 Vue Integration

```vue
<!-- plugins/traklet.ts -->
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { Traklet } from 'traklet';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

onMounted(() => {
  Traklet.init({
    adapter: 'github',
    backend: { owner: 'myorg', repo: 'myrepo' },
    user: {
      email: auth.user.email,
      name: auth.user.name
    },
    auth: {
      token: auth.token
    }
  });
});

onUnmounted(() => {
  Traklet.destroy();
});
</script>
```

### 13.6 Inline Mode (Embedded)

```html
<div id="issue-tracker-container"></div>

<script>
  Traklet.init({
    adapter: 'github',
    backend: { owner: 'myorg', repo: 'myrepo' },
    user: { email: 'user@example.com', name: 'User' },
    auth: { token: 'xxx' },
    ui: {
      position: 'inline',
      container: '#issue-tracker-container',
      launcher: { hidden: true }
    }
  });
</script>
```

### 13.7 Multi-Project Setup

```typescript
Traklet.init({
  adapter: 'github',
  backend: {
    projects: [
      { owner: 'myorg', repo: 'frontend', label: 'Frontend' },
      { owner: 'myorg', repo: 'backend', label: 'Backend' },
      { owner: 'myorg', repo: 'mobile', label: 'Mobile App' }
    ],
    defaultProject: 'frontend'
  },
  user: { email: 'dev@company.com', name: 'Developer' },
  auth: { token: 'ghp_xxx' },
  features: {
    projectSwitching: true
  }
});
```

### 13.8 Custom Adapter

```typescript
import { Traklet, IBackendAdapter, Issue, CreateIssueDTO } from 'traklet';

class JiraAdapter implements IBackendAdapter {
  private baseUrl: string;
  private projectKey: string;

  constructor(config: { baseUrl: string; projectKey: string }) {
    this.baseUrl = config.baseUrl;
    this.projectKey = config.projectKey;
  }

  async connect(config: AdapterConfig): Promise<ConnectionResult> {
    // Verify Jira connection
    const response = await fetch(`${this.baseUrl}/rest/api/3/myself`, {
      headers: { Authorization: `Bearer ${config.token}` }
    });
    return { success: response.ok };
  }

  async createIssue(dto: CreateIssueDTO): Promise<Issue> {
    const response = await fetch(`${this.baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          project: { key: this.projectKey },
          summary: dto.title,
          description: dto.body,
          issuetype: { name: 'Bug' }
        }
      })
    });
    const data = await response.json();
    return this.mapJiraIssue(data);
  }

  // ... implement other methods

  getCapabilities(): AdapterCapabilities {
    return {
      supportsLabels: true,
      supportsAssignees: true,
      // ... etc
    };
  }
}

// Use custom adapter
Traklet.init({
  adapter: JiraAdapter,
  backend: {
    baseUrl: 'https://mycompany.atlassian.net',
    projectKey: 'PROJ'
  },
  user: { email: 'user@company.com', name: 'User' },
  auth: { token: 'jira-api-token' }
});
```

---

## 14. Event System

### 13.1 Public Events

```typescript
type TrakletEvent =
  // Lifecycle
  | 'ready'           // Widget initialized and connected
  | 'destroy'         // Widget destroyed

  // UI
  | 'open'            // Widget opened
  | 'close'           // Widget closed
  | 'view-change'     // View changed (list, detail, create)

  // Data
  | 'issue-created'   // New issue created
  | 'issue-updated'   // Issue updated
  | 'issue-deleted'   // Issue deleted
  | 'comment-added'   // Comment added
  | 'attachment-uploaded'  // File uploaded

  // Project
  | 'project-switched'  // Active project changed

  // Sync
  | 'sync-start'      // Offline queue sync started
  | 'sync-complete'   // Sync finished
  | 'sync-error'      // Sync failed
  | 'conflict'        // Sync conflict detected

  // Network
  | 'online'          // Network online
  | 'offline'         // Network offline

  // Errors
  | 'error';          // Any error occurred
```

### 13.2 Event Subscription API

```typescript
// Subscribe to events
const tracker = Traklet.getInstance();

tracker.on('issue-created', (issue: Issue) => {
  console.log('New issue:', issue.id);
  analytics.track('issue_created', { issueId: issue.id });
});

tracker.on('error', (error: TrakletError) => {
  errorReporter.capture(error);
});

// Unsubscribe
const handler = (issue: Issue) => { /* ... */ };
tracker.on('issue-created', handler);
tracker.off('issue-created', handler);

// One-time listener
tracker.once('ready', () => {
  console.log('Traklet is ready!');
});
```

### 13.3 Event Payloads

```typescript
interface EventPayloads {
  'ready': void;
  'destroy': void;
  'open': void;
  'close': void;
  'view-change': { from: View; to: View };
  'issue-created': Issue;
  'issue-updated': { issue: Issue; changes: Partial<Issue> };
  'issue-deleted': { id: string };
  'comment-added': { issueId: string; comment: Comment };
  'attachment-uploaded': Attachment;
  'project-switched': { from: Project | null; to: Project };
  'sync-start': { operationCount: number };
  'sync-complete': SyncResult;
  'sync-error': { error: TrakletError; failedOperations: QueuedOperation[] };
  'conflict': ConflictEvent;
  'online': void;
  'offline': void;
  'error': TrakletError;
}
```

---

## 15. Security Considerations

### 14.1 Token Security

| Concern | Mitigation |
|---------|------------|
| Token exposure in source | Never hardcode; use env vars or vaults |
| Token in localStorage | Tokens stored in memory only (default) |
| Token in network logs | Use HTTPS only; tokens in headers not URLs |
| Token scope | Recommend minimal scopes (issues only) |

### 14.2 XSS Prevention

| Vector | Mitigation |
|--------|------------|
| Issue body | Sanitize HTML in markdown rendering |
| Comment content | Sanitize before display |
| User-provided URLs | Validate URL format, allowlist protocols |
| Custom fields | Escape all user input |

```typescript
// Markdown sanitization
import DOMPurify from 'dompurify';

function renderMarkdown(content: string): string {
  const html = marked.parse(content);
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'a', 'ul', 'ol', 'li', 'img'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title'],
    ALLOW_DATA_ATTR: false
  });
}
```

### 14.3 CSP Compatibility

```typescript
// Widget must work with strict CSP
// No inline scripts or styles in the bundle

// For styling, use adopted stylesheets (Shadow DOM)
const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);
shadowRoot.adoptedStyleSheets = [sheet];

// For event handlers, use addEventListener
element.addEventListener('click', handler);
```

### 14.4 CORS Handling

```typescript
// Some backends require CORS proxy
interface TrakletConfig {
  advanced?: {
    /**
     * Proxy URL for CORS-restricted backends
     * Request will be sent to: {proxyUrl}?url={encodedTargetUrl}
     */
    corsProxy?: string;
  };
}
```

---

## 16. Performance Requirements

### 15.1 Bundle Size

| Metric | Target | Maximum |
|--------|--------|---------|
| Minified | < 80KB | 100KB |
| Minified + Gzipped | < 30KB | 40KB |
| Initial JS parse time | < 50ms | 100ms |

### 15.2 Runtime Performance

| Metric | Target |
|--------|--------|
| Time to interactive | < 500ms |
| Issue list render (50 items) | < 100ms |
| Issue detail render | < 50ms |
| Search response | < 200ms |
| Attachment upload start | < 100ms |

### 15.3 Memory Usage

| Metric | Target |
|--------|--------|
| Idle memory | < 5MB |
| With 100 issues loaded | < 15MB |
| Memory leak (1hr runtime) | 0 |

### 15.4 Network

| Metric | Target |
|--------|--------|
| Initial data fetch | 1-2 requests |
| Subsequent page loads | Use cache |
| Polling (if enabled) | Max 1 req/30s |

---

## 17. Testing Strategy

### 16.1 Test Pyramid

```
                    ┌───────────────┐
                    │     E2E       │  ~10%
                    │  (Playwright) │
                    └───────┬───────┘
                            │
              ┌─────────────┴─────────────┐
              │       Integration         │  ~30%
              │   (Component + Adapter)   │
              └─────────────┬─────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │               Unit Tests              │  ~60%
        │  (Functions, Classes, Pure Logic)     │
        └───────────────────────────────────────┘
```

### 16.2 Test Categories

| Category | Tools | Coverage Target |
|----------|-------|-----------------|
| Unit | Vitest | 90% |
| Component | Vitest + Testing Library | 85% |
| Integration | Vitest + MSW | 80% |
| E2E | Playwright | Critical paths |
| Visual Regression | Playwright + Percy | Key components |

### 16.3 Adapter Contract Tests

```typescript
// All adapters must pass the same contract tests
describe.each([
  ['GitHub', GitHubAdapter, githubConfig],
  ['AzureDevOps', AzureDevOpsAdapter, azureConfig],
  ['REST', RestAdapter, restConfig],
  ['LocalStorage', LocalStorageAdapter, {}],
])('%s Adapter', (name, AdapterClass, config) => {
  let adapter: IBackendAdapter;

  beforeEach(async () => {
    adapter = new AdapterClass(config);
    await adapter.connect({ token: 'test-token' });
  });

  describe('IBackendAdapter Contract', () => {
    it('implements connect()', async () => {
      expect(adapter.isConnected()).toBe(true);
    });

    it('implements getIssues()', async () => {
      const result = await adapter.getIssues({});
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
    });

    it('implements createIssue()', async () => {
      const issue = await adapter.createIssue({
        title: 'Test Issue',
        body: 'Test body'
      });
      expect(issue).toHaveProperty('id');
      expect(issue.title).toBe('Test Issue');
    });

    // ... more contract tests
  });
});
```

### 16.4 Mock Server Setup

```typescript
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const githubHandlers = [
  http.get('https://api.github.com/repos/:owner/:repo/issues', ({ params }) => {
    return HttpResponse.json([
      { id: 1, number: 1, title: 'Issue 1', state: 'open' },
      { id: 2, number: 2, title: 'Issue 2', state: 'closed' },
    ]);
  }),

  http.post('https://api.github.com/repos/:owner/:repo/issues', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      id: 123,
      number: 123,
      title: body.title,
      body: body.body,
      state: 'open',
      created_at: new Date().toISOString(),
    }, { status: 201 });
  }),
];
```

---

## 18. Browser Support

### 17.1 Supported Browsers

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 90+ | Full support |
| Firefox | 90+ | Full support |
| Safari | 14+ | Full support |
| Edge | 90+ | Full support (Chromium) |
| Mobile Chrome | 90+ | Full support |
| Mobile Safari | 14+ | Full support |

### 17.2 Required Features

| Feature | Usage | Polyfill |
|---------|-------|----------|
| Shadow DOM | UI isolation | No (required) |
| Custom Elements | Web Components | No (required) |
| Fetch API | HTTP requests | No |
| IndexedDB | Offline queue | No (graceful fallback) |
| CSS Custom Properties | Theming | No |
| ResizeObserver | Responsive UI | Yes (if needed) |

### 17.3 Graceful Degradation

```typescript
// Feature detection
const features = {
  shadowDOM: !!HTMLElement.prototype.attachShadow,
  customElements: !!window.customElements,
  indexedDB: !!window.indexedDB,
  serviceWorker: 'serviceWorker' in navigator,
};

// Disable offline support if IndexedDB unavailable
if (!features.indexedDB) {
  config.features.offlineSupport = false;
  console.warn('Traklet: IndexedDB unavailable, offline support disabled');
}
```

---

## 19. Appendix

### 18.1 Glossary

| Term | Definition |
|------|------------|
| Adapter | Backend implementation that conforms to IBackendAdapter |
| Issue | Generic term for bug, task, work item across backends |
| PAT | Personal Access Token for API authentication |
| Shadow DOM | Browser feature for DOM/style encapsulation |
| Operation Queue | IndexedDB-backed queue for offline operations |

### 18.2 Error Codes

| Code | Description |
|------|-------------|
| `AUTH_INVALID` | Token is invalid or expired |
| `AUTH_MISSING` | No token provided |
| `NETWORK_ERROR` | Failed to reach backend |
| `NOT_FOUND` | Resource doesn't exist |
| `FORBIDDEN` | Insufficient permissions |
| `RATE_LIMITED` | API rate limit exceeded |
| `VALIDATION_ERROR` | Invalid input data |
| `CONFLICT` | Resource was modified |
| `ADAPTER_ERROR` | Backend-specific error |
| `OFFLINE` | Operation queued (not an error) |

### 18.3 File Structure

```
traklet/
├── src/
│   ├── core/
│   │   ├── Traklet.ts
│   │   ├── ConfigManager.ts
│   │   ├── StateManager.ts
│   │   ├── EventBus.ts
│   │   ├── AuthManager.ts
│   │   ├── ProjectManager.ts
│   │   └── OperationQueue.ts
│   │
│   ├── adapters/
│   │   ├── IBackendAdapter.ts
│   │   ├── BaseAdapter.ts
│   │   ├── GitHubAdapter.ts
│   │   ├── AzureDevOpsAdapter.ts
│   │   ├── RestAdapter.ts
│   │   └── LocalStorageAdapter.ts
│   │
│   ├── models/
│   │   ├── Issue.ts
│   │   ├── Comment.ts
│   │   ├── Attachment.ts
│   │   ├── Label.ts
│   │   ├── User.ts
│   │   └── Project.ts
│   │
│   ├── ui/
│   │   ├── TrakletWidget.ts
│   │   ├── components/
│   │   ├── styles/
│   │   └── themes/
│   │
│   ├── features/
│   │   ├── AttachmentManager.ts
│   │   ├── ScreenshotManager.ts
│   │   └── OfflineManager.ts
│   │
│   ├── utils/
│   │   ├── http.ts
│   │   ├── validators.ts
│   │   ├── markdown.ts
│   │   └── testIds.ts
│   │
│   └── index.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── mocks/
│
├── dist/
│   ├── traklet.min.js
│   ├── traklet.esm.js
│   └── traklet.d.ts
│
├── examples/
│   ├── github-simple.html
│   ├── azure-devops.html
│   ├── multi-project.html
│   ├── react-integration/
│   └── vue-integration/
│
├── docs/
│   ├── getting-started.md
│   ├── configuration.md
│   ├── adapters.md
│   └── api-reference.md
│
├── SPECIFICATION.md          # This document
├── CLAUDE.md                 # AI assistant rules
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

### 18.4 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0-draft | Dec 2024 | Initial specification |

---

## Document Status

**Status:** Draft - Ready for Review

**Next Steps:**
1. Review and approve specification
2. Create project scaffolding
3. Implement core components
4. Implement adapters
5. Build UI components
6. Integration testing
7. Documentation
8. Release

---

*End of Specification Document*
