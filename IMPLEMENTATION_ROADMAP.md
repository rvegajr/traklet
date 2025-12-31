# Traklet - Implementation Roadmap

> A TDD-first, ISP-compliant, skin-agnostic implementation plan

---

## Core Architectural Principles

### 1. Test-Driven Development (TDD) - Mandatory

Every feature follows the RED-GREEN-REFACTOR cycle:

```
┌─────────────────────────────────────────────────────────────────┐
│                         TDD WORKFLOW                             │
│                                                                  │
│   1. RED    → Write failing test first                          │
│   2. GREEN  → Write minimum code to pass                        │
│   3. REFACTOR → Clean up, maintain tests passing                │
│                                                                  │
│   Rule: NO production code without a failing test first         │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Interface Segregation Principle (ISP) - Enforced

No client should depend on interfaces it doesn't use. Split large interfaces:

```typescript
// ❌ BAD - Monolithic interface
interface IBackendAdapter {
  // 25+ methods that not all adapters need
}

// ✅ GOOD - Segregated interfaces
interface IIssueReader {
  getIssues(query: IssueQuery): Promise<PaginatedResult<Issue>>;
  getIssue(id: string): Promise<Issue>;
}

interface IIssueWriter {
  createIssue(dto: CreateIssueDTO): Promise<Issue>;
  updateIssue(id: string, dto: UpdateIssueDTO): Promise<Issue>;
}

interface IIssueDeleter {
  deleteIssue(id: string): Promise<void>;
}

interface ICommentManager {
  getComments(issueId: string): Promise<Comment[]>;
  addComment(issueId: string, dto: CreateCommentDTO): Promise<Comment>;
}

interface IAttachmentManager {
  uploadAttachment(file: File): Promise<Attachment>;
  getAttachment(id: string): Promise<Attachment>;
}

// Composed adapter uses only what it needs
interface IBackendAdapter extends
  IIssueReader,
  IIssueWriter,
  ICapabilityProvider {}

// Optional capabilities via composition
interface IFullBackendAdapter extends
  IBackendAdapter,
  IIssueDeleter,
  ICommentManager,
  IAttachmentManager {}
```

### 3. Skin-Agnostic Architecture - Core Principle

**The core logic must be 100% UI-independent.** Any UI framework (Lit, React, Vue, vanilla) can be plugged in.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SKIN-AGNOSTIC LAYERS                          │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    UI LAYER (Skins)                      │   │
│   │   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │   │
│   │   │   Lit   │  │  React  │  │   Vue   │  │ Vanilla │   │   │
│   │   │  Skin   │  │  Skin   │  │  Skin   │  │  Skin   │   │   │
│   │   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘   │   │
│   └────────┼────────────┼───────────┼───────────┼──────────┘   │
│            │            │           │           │               │
│            └────────────┴─────┬─────┴───────────┘               │
│                               │                                  │
│   ┌───────────────────────────▼─────────────────────────────┐   │
│   │              PRESENTATION CONTRACTS                      │   │
│   │   • IWidgetPresenter                                    │   │
│   │   • IIssueListPresenter                                 │   │
│   │   • IIssueDetailPresenter                               │   │
│   │   • IIssueFormPresenter                                 │   │
│   │   • IViewModel interfaces                               │   │
│   └───────────────────────────┬─────────────────────────────┘   │
│                               │                                  │
│   ┌───────────────────────────▼─────────────────────────────┐   │
│   │                   CORE LAYER (Headless)                  │   │
│   │   • State Management                                    │   │
│   │   • Business Logic                                      │   │
│   │   • Adapters                                            │   │
│   │   • Event System                                        │   │
│   │   NO UI DEPENDENCIES - Pure TypeScript                  │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 1: Headless Core       │  Phase 2: Default Skin                  │
│  ─────────────────────────    │  ──────────────────────                 │
│  • ISP-compliant interfaces   │  • Lit Web Components skin              │
│  • Core state machine         │  • Presenter implementations            │
│  • Adapter contracts          │  • Shadow DOM isolation                 │
│  • TDD for all core logic     │  • CSS custom properties                │
│  • LocalStorage adapter       │  • Theme tokens                         │
│                               │                                         │
│  Deliverable: Fully tested    │  Deliverable: Working widget            │
│  headless core                │  with default Lit skin                  │
├───────────────────────────────┼─────────────────────────────────────────┤
│  Phase 3: Backend Adapters    │  Phase 4: Advanced Features             │
│  ─────────────────────────    │  ──────────────────────                 │
│  • GitHub Adapter (TDD)       │  • Offline queue (TDD)                  │
│  • Azure DevOps Adapter       │  • Attachments & screenshots            │
│  • REST Adapter               │  • Conflict resolution                  │
│  • Contract test suite        │  • Permission system                    │
│                               │                                         │
│  Deliverable: All adapters    │  Deliverable: Full offline              │
│  passing contract tests       │  & permission support                   │
├───────────────────────────────┼─────────────────────────────────────────┤
│  Phase 5: Polish & Skins      │                                         │
│  ─────────────────────────    │                                         │
│  • React skin (optional)      │                                         │
│  • Vue skin (optional)        │                                         │
│  • Accessibility audit        │                                         │
│  • Performance optimization   │                                         │
│  • Documentation              │                                         │
│                               │                                         │
│  Deliverable: v1.0.0          │                                         │
└───────────────────────────────┴─────────────────────────────────────────┘
```

---

## Phase 1: Headless Core (TDD-First)

### Objectives
- Define all ISP-compliant interfaces
- Implement core state machine with full test coverage
- Create adapter contracts with contract tests
- Zero UI code - pure business logic

### Directory Structure

```
src/
├── contracts/                    # ISP Interfaces (no implementation)
│   ├── adapters/
│   │   ├── IIssueReader.ts
│   │   ├── IIssueWriter.ts
│   │   ├── IIssueDeleter.ts
│   │   ├── ICommentManager.ts
│   │   ├── IAttachmentHandler.ts
│   │   ├── IProjectProvider.ts
│   │   ├── IUserProvider.ts
│   │   ├── ICapabilityProvider.ts
│   │   └── index.ts              # Composed IBackendAdapter
│   │
│   ├── presenters/               # UI Contracts (skin-agnostic)
│   │   ├── IWidgetPresenter.ts
│   │   ├── IIssueListPresenter.ts
│   │   ├── IIssueDetailPresenter.ts
│   │   ├── IIssueFormPresenter.ts
│   │   ├── ICommentPresenter.ts
│   │   └── IAttachmentPresenter.ts
│   │
│   ├── viewmodels/               # Data shapes for UI
│   │   ├── IssueListVM.ts
│   │   ├── IssueDetailVM.ts
│   │   ├── IssueFormVM.ts
│   │   └── WidgetVM.ts
│   │
│   └── services/
│       ├── IStateManager.ts
│       ├── IEventBus.ts
│       ├── IAuthProvider.ts
│       ├── IPermissionChecker.ts
│       ├── IOfflineQueue.ts
│       └── IConfigProvider.ts
│
├── core/                         # Implementations (headless)
│   ├── StateManager.ts
│   ├── EventBus.ts
│   ├── AuthManager.ts
│   ├── PermissionManager.ts
│   ├── ConfigManager.ts
│   ├── ProjectManager.ts
│   └── Traklet.ts                # Main orchestrator
│
├── adapters/                     # Backend adapters
│   ├── LocalStorageAdapter.ts
│   ├── GitHubAdapter.ts
│   ├── AzureDevOpsAdapter.ts
│   └── RestAdapter.ts
│
├── presenters/                   # Presentation logic (skin-agnostic)
│   ├── WidgetPresenter.ts
│   ├── IssueListPresenter.ts
│   ├── IssueDetailPresenter.ts
│   ├── IssueFormPresenter.ts
│   └── AttachmentPresenter.ts
│
├── models/                       # Domain models
│   ├── Issue.ts
│   ├── Comment.ts
│   ├── Attachment.ts
│   ├── User.ts
│   ├── Label.ts
│   └── Project.ts
│
└── index.ts                      # Headless exports

skins/                            # UI implementations (separate packages)
├── lit/                          # Default Lit skin
│   ├── components/
│   ├── styles/
│   └── index.ts
│
├── react/                        # Optional React skin
│   ├── components/
│   └── index.ts
│
└── vue/                          # Optional Vue skin
    ├── components/
    └── index.ts
```

### 1.1 ISP Interface Definitions (TDD)

**Write tests first for each interface contract.**

#### IIssueReader Interface

```typescript
// src/contracts/adapters/IIssueReader.ts
export interface IIssueReader {
  getIssues(query: IssueQuery): Promise<PaginatedResult<Issue>>;
  getIssue(id: string): Promise<Issue>;
}

// tests/contracts/IIssueReader.contract.ts
export function testIssueReaderContract(
  createAdapter: () => IIssueReader
) {
  describe('IIssueReader Contract', () => {
    let adapter: IIssueReader;

    beforeEach(() => {
      adapter = createAdapter();
    });

    describe('getIssues', () => {
      it('returns paginated result with items array', async () => {
        const result = await adapter.getIssues({});
        expect(result).toHaveProperty('items');
        expect(Array.isArray(result.items)).toBe(true);
      });

      it('returns total count', async () => {
        const result = await adapter.getIssues({});
        expect(typeof result.total).toBe('number');
      });

      it('respects pageSize parameter', async () => {
        const result = await adapter.getIssues({ pageSize: 5 });
        expect(result.items.length).toBeLessThanOrEqual(5);
      });

      it('filters by status', async () => {
        const result = await adapter.getIssues({ status: 'open' });
        result.items.forEach(issue => {
          expect(issue.status).toBe('open');
        });
      });
    });

    describe('getIssue', () => {
      it('returns issue by ID', async () => {
        const issues = await adapter.getIssues({ pageSize: 1 });
        if (issues.items.length > 0) {
          const issue = await adapter.getIssue(issues.items[0].id);
          expect(issue.id).toBe(issues.items[0].id);
        }
      });

      it('throws NotFoundError for invalid ID', async () => {
        await expect(adapter.getIssue('invalid-id-12345'))
          .rejects.toThrow(NotFoundError);
      });
    });
  });
}
```

#### IIssueWriter Interface

```typescript
// src/contracts/adapters/IIssueWriter.ts
export interface IIssueWriter {
  createIssue(dto: CreateIssueDTO): Promise<Issue>;
  updateIssue(id: string, dto: UpdateIssueDTO): Promise<Issue>;
}

// tests/contracts/IIssueWriter.contract.ts
export function testIssueWriterContract(
  createAdapter: () => IIssueWriter & IIssueReader
) {
  describe('IIssueWriter Contract', () => {
    let adapter: IIssueWriter & IIssueReader;

    beforeEach(() => {
      adapter = createAdapter();
    });

    describe('createIssue', () => {
      it('creates issue with title and body', async () => {
        const dto: CreateIssueDTO = {
          title: 'Test Issue',
          body: 'Test body content'
        };

        const issue = await adapter.createIssue(dto);

        expect(issue.id).toBeDefined();
        expect(issue.title).toBe(dto.title);
        expect(issue.body).toBe(dto.body);
      });

      it('assigns default status of "open"', async () => {
        const issue = await adapter.createIssue({
          title: 'Test',
          body: 'Body'
        });

        expect(issue.status).toBe('open');
      });

      it('sets createdAt timestamp', async () => {
        const before = new Date();
        const issue = await adapter.createIssue({
          title: 'Test',
          body: 'Body'
        });
        const after = new Date();

        expect(issue.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(issue.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      });
    });

    describe('updateIssue', () => {
      it('updates existing issue', async () => {
        const created = await adapter.createIssue({
          title: 'Original',
          body: 'Original body'
        });

        const updated = await adapter.updateIssue(created.id, {
          title: 'Updated Title'
        });

        expect(updated.title).toBe('Updated Title');
        expect(updated.body).toBe('Original body'); // Unchanged
      });

      it('updates updatedAt timestamp', async () => {
        const created = await adapter.createIssue({
          title: 'Test',
          body: 'Body'
        });

        // Small delay to ensure different timestamp
        await new Promise(r => setTimeout(r, 10));

        const updated = await adapter.updateIssue(created.id, {
          title: 'Updated'
        });

        expect(updated.updatedAt.getTime())
          .toBeGreaterThan(created.createdAt.getTime());
      });
    });
  });
}
```

#### ICapabilityProvider Interface

```typescript
// src/contracts/adapters/ICapabilityProvider.ts
export interface AdapterCapabilities {
  // Feature support flags
  readonly supportsLabels: boolean;
  readonly supportsAssignees: boolean;
  readonly supportsMilestones: boolean;
  readonly supportsAttachments: boolean;
  readonly supportsCommentEdit: boolean;
  readonly supportsCommentDelete: boolean;
  readonly supportsIssueDelete: boolean;
  readonly supportsMarkdown: boolean;
  readonly supportsCustomFields: boolean;
  readonly supportsMultipleProjects: boolean;

  // Limits
  readonly maxTitleLength: number;
  readonly maxBodyLength: number;
  readonly maxAttachmentSize: number;
  readonly allowedAttachmentTypes: readonly string[];
}

export interface ICapabilityProvider {
  getCapabilities(): AdapterCapabilities;
}
```

#### Composed Adapter Interface

```typescript
// src/contracts/adapters/index.ts
import { IIssueReader } from './IIssueReader';
import { IIssueWriter } from './IIssueWriter';
import { ICapabilityProvider } from './ICapabilityProvider';

// Minimum viable adapter
export interface IBackendAdapter extends
  IIssueReader,
  IIssueWriter,
  ICapabilityProvider {
  connect(config: AdapterConfig): Promise<ConnectionResult>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

// Optional capabilities - adapters implement what they support
export interface IIssueDeleter {
  deleteIssue(id: string): Promise<void>;
}

export interface ICommentManager {
  getComments(issueId: string): Promise<Comment[]>;
  addComment(issueId: string, dto: CreateCommentDTO): Promise<Comment>;
  updateComment?(commentId: string, body: string): Promise<Comment>;
  deleteComment?(commentId: string): Promise<void>;
}

export interface IAttachmentHandler {
  uploadAttachment(file: File, issueId?: string): Promise<Attachment>;
  getAttachment(id: string): Promise<Attachment>;
  deleteAttachment?(id: string): Promise<void>;
}

export interface IProjectProvider {
  getProjects(): Promise<Project[]>;
  switchProject(projectId: string): Promise<void>;
}

export interface IUserProvider {
  getUsers(): Promise<User[]>;
  getCurrentUser(): Promise<User | null>;
}

export interface ILabelProvider {
  getLabels(): Promise<Label[]>;
}

// Type guard helpers
export function supportsDeleting(adapter: IBackendAdapter): adapter is IBackendAdapter & IIssueDeleter {
  return adapter.getCapabilities().supportsIssueDelete;
}

export function supportsComments(adapter: IBackendAdapter): adapter is IBackendAdapter & ICommentManager {
  return 'getComments' in adapter;
}

export function supportsAttachments(adapter: IBackendAdapter): adapter is IBackendAdapter & IAttachmentHandler {
  return adapter.getCapabilities().supportsAttachments && 'uploadAttachment' in adapter;
}
```

### 1.2 Presenter Interfaces (Skin-Agnostic)

```typescript
// src/contracts/presenters/IWidgetPresenter.ts
export interface WidgetState {
  isOpen: boolean;
  isLoading: boolean;
  currentView: 'list' | 'detail' | 'create' | 'edit';
  error: string | null;
}

export interface IWidgetPresenter {
  // State
  getState(): WidgetState;
  subscribe(listener: (state: WidgetState) => void): () => void;

  // Actions
  open(): void;
  close(): void;
  toggle(): void;
  navigateTo(view: WidgetState['currentView'], params?: Record<string, string>): void;
  clearError(): void;
}

// src/contracts/presenters/IIssueListPresenter.ts
export interface IssueListState {
  issues: Issue[];
  isLoading: boolean;
  error: string | null;
  filters: IssueFilters;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}

export interface IIssueListPresenter {
  getState(): IssueListState;
  subscribe(listener: (state: IssueListState) => void): () => void;

  // Actions
  loadIssues(): Promise<void>;
  loadMore(): Promise<void>;
  refresh(): Promise<void>;
  setFilters(filters: Partial<IssueFilters>): void;
  search(query: string): void;
  selectIssue(id: string): void;
}

// src/contracts/presenters/IIssueDetailPresenter.ts
export interface IssueDetailState {
  issue: Issue | null;
  comments: Comment[];
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;

  // Permission-driven UI state
  canEdit: boolean;
  canDelete: boolean;
  canComment: boolean;
}

export interface IIssueDetailPresenter {
  getState(): IssueDetailState;
  subscribe(listener: (state: IssueDetailState) => void): () => void;

  // Actions
  loadIssue(id: string): Promise<void>;
  updateIssue(updates: UpdateIssueDTO): Promise<void>;
  deleteIssue(): Promise<void>;
  addComment(body: string): Promise<void>;
  editComment(commentId: string, body: string): Promise<void>;
  deleteComment(commentId: string): Promise<void>;
}

// src/contracts/presenters/IIssueFormPresenter.ts
export interface IssueFormState {
  mode: 'create' | 'edit';
  values: {
    title: string;
    body: string;
    labels: string[];
    priority?: string;
  };
  errors: Record<string, string>;
  isSubmitting: boolean;
  isDirty: boolean;

  // Available options (loaded from adapter)
  availableLabels: Label[];
  availablePriorities: string[];
}

export interface IIssueFormPresenter {
  getState(): IssueFormState;
  subscribe(listener: (state: IssueFormState) => void): () => void;

  // Actions
  setField(field: string, value: unknown): void;
  validate(): boolean;
  submit(): Promise<Issue>;
  reset(): void;
  loadForEdit(issueId: string): Promise<void>;
}
```

### 1.3 ViewModel Interfaces (Data Contracts)

```typescript
// src/contracts/viewmodels/IssueListVM.ts
export interface IssueCardVM {
  id: string;
  title: string;
  status: IssueStatus;
  statusColor: string;
  labels: Array<{ name: string; color: string }>;
  createdBy: {
    name: string;
    avatar?: string;
  };
  createdAt: string;  // Formatted date
  commentCount: number;
  hasAttachments: boolean;

  // Permission-driven
  isOwner: boolean;
  canEdit: boolean;
}

export interface IssueListVM {
  issues: IssueCardVM[];
  isEmpty: boolean;
  isLoading: boolean;
  hasError: boolean;
  errorMessage?: string;
  hasMore: boolean;

  // Filter state for UI
  activeFilters: {
    status?: IssueStatus[];
    labels?: string[];
    search?: string;
  };
}

// src/contracts/viewmodels/IssueDetailVM.ts
export interface IssueDetailVM {
  id: string;
  title: string;
  body: string;          // Raw markdown
  bodyHtml: string;      // Rendered HTML (sanitized)
  status: IssueStatus;
  priority?: string;
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ name: string; avatar?: string }>;

  createdBy: {
    name: string;
    avatar?: string;
    email?: string;
  };
  createdAt: string;
  updatedAt: string;

  // Attachments
  images: Array<{
    id: string;
    filename: string;
    thumbnailUrl: string;
    fullUrl: string;
  }>;
  files: Array<{
    id: string;
    filename: string;
    size: string;  // Formatted: "2.5 MB"
    downloadUrl: string;
  }>;

  // Comments
  comments: CommentVM[];

  // Permissions
  canEdit: boolean;
  canDelete: boolean;
  canAddComment: boolean;
  canManageLabels: boolean;
  canManageAssignees: boolean;

  // Source link
  externalUrl?: string;
}

export interface CommentVM {
  id: string;
  body: string;
  bodyHtml: string;
  author: {
    name: string;
    avatar?: string;
  };
  createdAt: string;
  isEdited: boolean;

  // Permissions
  canEdit: boolean;
  canDelete: boolean;
  isOwn: boolean;
}
```

### 1.4 State Manager (TDD)

```typescript
// tests/unit/core/StateManager.test.ts
describe('StateManager', () => {
  let stateManager: IStateManager;

  beforeEach(() => {
    stateManager = new StateManager();
  });

  describe('initial state', () => {
    it('starts with default state', () => {
      const state = stateManager.getState();
      expect(state.isConnected).toBe(false);
      expect(state.isOnline).toBe(true);
      expect(state.issues).toEqual([]);
      expect(state.currentView).toBe('list');
    });
  });

  describe('setState', () => {
    it('merges partial state', () => {
      stateManager.setState({ isConnected: true });
      expect(stateManager.getState().isConnected).toBe(true);
      expect(stateManager.getState().isOnline).toBe(true); // Unchanged
    });

    it('notifies subscribers', () => {
      const listener = vi.fn();
      stateManager.subscribe(listener);

      stateManager.setState({ isConnected: true });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ isConnected: true })
      );
    });

    it('does not notify after unsubscribe', () => {
      const listener = vi.fn();
      const unsubscribe = stateManager.subscribe(listener);

      unsubscribe();
      stateManager.setState({ isConnected: true });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('selectors', () => {
    it('getFilteredIssues applies status filter', () => {
      stateManager.setState({
        issues: [
          { id: '1', status: 'open', title: 'Open Issue' },
          { id: '2', status: 'closed', title: 'Closed Issue' },
        ] as Issue[],
        filters: { status: ['open'] }
      });

      const filtered = stateManager.getFilteredIssues();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe('open');
    });
  });
});
```

### 1.5 Permission Manager (TDD)

```typescript
// tests/unit/core/PermissionManager.test.ts
describe('PermissionManager', () => {
  let permissionManager: IPermissionChecker;

  describe('with authenticated user', () => {
    beforeEach(() => {
      permissionManager = new PermissionManager({
        email: 'alice@example.com',
        name: 'Alice'
      });
    });

    it('canEditIssue returns true for own issues', () => {
      const issue = createIssue({
        createdBy: { email: 'alice@example.com', name: 'Alice' }
      });

      expect(permissionManager.canEditIssue(issue)).toBe(true);
    });

    it('canEditIssue returns false for others issues', () => {
      const issue = createIssue({
        createdBy: { email: 'bob@example.com', name: 'Bob' }
      });

      expect(permissionManager.canEditIssue(issue)).toBe(false);
    });

    it('canDeleteIssue returns true for own issues', () => {
      const issue = createIssue({
        createdBy: { email: 'alice@example.com', name: 'Alice' }
      });

      expect(permissionManager.canDeleteIssue(issue)).toBe(true);
    });

    it('matches email case-insensitively', () => {
      const issue = createIssue({
        createdBy: { email: 'ALICE@EXAMPLE.COM', name: 'Alice' }
      });

      expect(permissionManager.canEditIssue(issue)).toBe(true);
    });

    it('canCreateIssue returns true', () => {
      expect(permissionManager.canCreateIssue()).toBe(true);
    });

    it('canAddComment returns true', () => {
      expect(permissionManager.canAddComment()).toBe(true);
    });
  });

  describe('anonymous user (view_only mode)', () => {
    beforeEach(() => {
      permissionManager = new PermissionManager(null, {
        anonymousMode: 'view_only'
      });
    });

    it('canCreateIssue returns false', () => {
      expect(permissionManager.canCreateIssue()).toBe(false);
    });

    it('canEditIssue returns false', () => {
      const issue = createIssue();
      expect(permissionManager.canEditIssue(issue)).toBe(false);
    });

    it('canAddComment returns false', () => {
      expect(permissionManager.canAddComment()).toBe(false);
    });
  });

  describe('anonymous user (view_create mode)', () => {
    beforeEach(() => {
      permissionManager = new PermissionManager(null, {
        anonymousMode: 'view_create'
      });
    });

    it('canCreateIssue returns true', () => {
      expect(permissionManager.canCreateIssue()).toBe(true);
    });

    it('canEditIssue returns false', () => {
      const issue = createIssue();
      expect(permissionManager.canEditIssue(issue)).toBe(false);
    });

    it('canAddComment returns true', () => {
      expect(permissionManager.canAddComment()).toBe(true);
    });
  });
});
```

### 1.6 LocalStorage Adapter (TDD Reference Implementation)

```typescript
// tests/unit/adapters/LocalStorageAdapter.test.ts
import { testIssueReaderContract } from '../../contracts/IIssueReader.contract';
import { testIssueWriterContract } from '../../contracts/IIssueWriter.contract';

describe('LocalStorageAdapter', () => {
  // Run contract tests
  testIssueReaderContract(() => new LocalStorageAdapter());
  testIssueWriterContract(() => new LocalStorageAdapter());

  // Adapter-specific tests
  describe('persistence', () => {
    it('persists issues across instances', async () => {
      const adapter1 = new LocalStorageAdapter({ storageKey: 'test' });
      await adapter1.createIssue({ title: 'Test', body: 'Body' });

      const adapter2 = new LocalStorageAdapter({ storageKey: 'test' });
      const issues = await adapter2.getIssues({});

      expect(issues.items).toHaveLength(1);
    });

    it('uses separate storage keys', async () => {
      const adapter1 = new LocalStorageAdapter({ storageKey: 'project1' });
      const adapter2 = new LocalStorageAdapter({ storageKey: 'project2' });

      await adapter1.createIssue({ title: 'P1 Issue', body: 'Body' });
      await adapter2.createIssue({ title: 'P2 Issue', body: 'Body' });

      const p1Issues = await adapter1.getIssues({});
      const p2Issues = await adapter2.getIssues({});

      expect(p1Issues.items).toHaveLength(1);
      expect(p2Issues.items).toHaveLength(1);
      expect(p1Issues.items[0].title).toBe('P1 Issue');
      expect(p2Issues.items[0].title).toBe('P2 Issue');
    });
  });

  describe('capabilities', () => {
    it('reports correct capabilities', () => {
      const adapter = new LocalStorageAdapter();
      const caps = adapter.getCapabilities();

      expect(caps.supportsIssueDelete).toBe(true);
      expect(caps.supportsAttachments).toBe(true);
      expect(caps.supportsMarkdown).toBe(true);
      expect(caps.supportsMultipleProjects).toBe(true);
    });
  });
});
```

### Phase 1 Deliverables

- [ ] All ISP interfaces defined with contract tests
- [ ] StateManager with 100% test coverage
- [ ] EventBus with 100% test coverage
- [ ] PermissionManager with 100% test coverage
- [ ] LocalStorageAdapter passing all contract tests
- [ ] All presenters defined (interfaces only)
- [ ] Zero UI code - completely headless

### Phase 1 Test Coverage Requirements

| Component | Min Coverage |
|-----------|--------------|
| Contracts | 100% (types only) |
| StateManager | 100% |
| EventBus | 100% |
| PermissionManager | 100% |
| ConfigManager | 95% |
| LocalStorageAdapter | 95% |

---

## Phase 2: Default Skin (Lit Web Components)

### Objectives
- Implement Lit-based skin using presenter interfaces
- Shadow DOM isolation with CSS custom properties
- Zero business logic in UI components
- All rendering driven by ViewModels

### Skin Architecture

```typescript
// skins/lit/components/TrakletWidget.ts
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { IWidgetPresenter, WidgetState } from '@traklet/contracts';

@customElement('traklet-widget')
export class TrakletWidget extends LitElement {
  // Presenter injected, not created
  private presenter!: IWidgetPresenter;

  @state()
  private widgetState: WidgetState = {
    isOpen: false,
    isLoading: false,
    currentView: 'list',
    error: null
  };

  // No business logic - pure rendering
  static styles = css`
    :host {
      /* All styles use CSS custom properties */
      --traklet-primary: var(--traklet-primary-color, #0066cc);
      --traklet-bg: var(--traklet-background, #ffffff);
    }

    .widget-container {
      background: var(--traklet-bg);
      /* ... */
    }
  `;

  setPresenter(presenter: IWidgetPresenter) {
    this.presenter = presenter;
    // Subscribe to state changes
    presenter.subscribe((state) => {
      this.widgetState = state;
    });
  }

  render() {
    if (!this.widgetState.isOpen) {
      return html`<traklet-launcher @click=${() => this.presenter.open()}></traklet-launcher>`;
    }

    return html`
      <div class="widget-container" data-testid="traklet-widget">
        <traklet-header @close=${() => this.presenter.close()}></traklet-header>

        ${this.widgetState.isLoading
          ? html`<traklet-loading></traklet-loading>`
          : this.renderCurrentView()
        }

        ${this.widgetState.error
          ? html`<traklet-error
              message=${this.widgetState.error}
              @dismiss=${() => this.presenter.clearError()}
            ></traklet-error>`
          : ''
        }
      </div>
    `;
  }

  private renderCurrentView() {
    switch (this.widgetState.currentView) {
      case 'list':
        return html`<traklet-issue-list></traklet-issue-list>`;
      case 'detail':
        return html`<traklet-issue-detail></traklet-issue-detail>`;
      case 'create':
      case 'edit':
        return html`<traklet-issue-form></traklet-issue-form>`;
    }
  }
}
```

### CSS Custom Properties (Skin-Agnostic Theming)

```typescript
// skins/lit/styles/tokens.ts
export const themeTokens = css`
  :host {
    /* Colors - Override these for custom themes */
    --traklet-primary: #0066cc;
    --traklet-primary-hover: #0052a3;
    --traklet-primary-text: #ffffff;

    --traklet-background: #ffffff;
    --traklet-surface: #f5f5f5;
    --traklet-border: #e0e0e0;

    --traklet-text: #1a1a1a;
    --traklet-text-secondary: #666666;
    --traklet-text-muted: #999999;

    --traklet-error: #dc3545;
    --traklet-success: #28a745;
    --traklet-warning: #ffc107;

    /* Status colors */
    --traklet-status-open: #28a745;
    --traklet-status-in-progress: #ffc107;
    --traklet-status-resolved: #17a2b8;
    --traklet-status-closed: #6c757d;

    /* Typography */
    --traklet-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --traklet-font-size-xs: 11px;
    --traklet-font-size-sm: 13px;
    --traklet-font-size-md: 14px;
    --traklet-font-size-lg: 16px;
    --traklet-font-size-xl: 20px;

    /* Spacing */
    --traklet-spacing-xs: 4px;
    --traklet-spacing-sm: 8px;
    --traklet-spacing-md: 16px;
    --traklet-spacing-lg: 24px;

    /* Borders */
    --traklet-radius-sm: 4px;
    --traklet-radius-md: 8px;
    --traklet-radius-lg: 12px;

    /* Shadows */
    --traklet-shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
    --traklet-shadow-md: 0 4px 6px rgba(0,0,0,0.1);
    --traklet-shadow-lg: 0 10px 15px rgba(0,0,0,0.15);

    /* Sizing */
    --traklet-widget-width: 400px;
    --traklet-launcher-size: 56px;
  }

  /* Dark theme override */
  :host([theme="dark"]) {
    --traklet-background: #1a1a1a;
    --traklet-surface: #2d2d2d;
    --traklet-border: #404040;
    --traklet-text: #ffffff;
    --traklet-text-secondary: #b0b0b0;
  }
`;
```

### Phase 2 Tests (Component Tests)

```typescript
// skins/lit/components/__tests__/TrakletWidget.test.ts
describe('TrakletWidget', () => {
  let element: TrakletWidget;
  let mockPresenter: MockWidgetPresenter;

  beforeEach(async () => {
    mockPresenter = new MockWidgetPresenter();
    element = await fixture(html`<traklet-widget></traklet-widget>`);
    element.setPresenter(mockPresenter);
    await element.updateComplete;
  });

  it('renders launcher when closed', async () => {
    mockPresenter.setState({ isOpen: false });
    await element.updateComplete;

    const launcher = element.shadowRoot?.querySelector('traklet-launcher');
    expect(launcher).toBeTruthy();
  });

  it('renders widget container when open', async () => {
    mockPresenter.setState({ isOpen: true, currentView: 'list' });
    await element.updateComplete;

    const container = element.shadowRoot?.querySelector('.widget-container');
    expect(container).toBeTruthy();
  });

  it('calls presenter.open() when launcher clicked', async () => {
    mockPresenter.setState({ isOpen: false });
    await element.updateComplete;

    const launcher = element.shadowRoot?.querySelector('traklet-launcher');
    launcher?.click();

    expect(mockPresenter.open).toHaveBeenCalled();
  });

  it('respects CSS custom properties', async () => {
    element.style.setProperty('--traklet-primary', '#ff0000');
    mockPresenter.setState({ isOpen: true });
    await element.updateComplete;

    const computed = getComputedStyle(element);
    expect(computed.getPropertyValue('--traklet-primary').trim()).toBe('#ff0000');
  });
});
```

### Phase 2 Deliverables

- [ ] All Lit components implemented
- [ ] Components use only presenter interfaces
- [ ] Zero business logic in components
- [ ] Full CSS custom property theming
- [ ] Shadow DOM isolation verified
- [ ] Component tests with mocked presenters

---

## Phase 3: Backend Adapters (TDD)

### Adapter Contract Test Suite

Every adapter must pass the same contract tests:

```typescript
// tests/adapters/adapter.contract.ts
export function runAdapterContractTests(
  name: string,
  createAdapter: () => IBackendAdapter,
  config: { supportsDelete?: boolean; supportsComments?: boolean } = {}
) {
  describe(`${name} Adapter Contract`, () => {
    // Base contracts
    testIssueReaderContract(createAdapter);
    testIssueWriterContract(createAdapter);
    testCapabilityContract(createAdapter);
    testConnectionContract(createAdapter);

    // Optional contracts based on capabilities
    if (config.supportsDelete) {
      testIssueDeleterContract(createAdapter);
    }

    if (config.supportsComments) {
      testCommentManagerContract(createAdapter);
    }
  });
}

// Usage for each adapter
describe('GitHubAdapter', () => {
  runAdapterContractTests(
    'GitHub',
    () => new GitHubAdapter(testConfig),
    { supportsDelete: false, supportsComments: true }
  );
});

describe('AzureDevOpsAdapter', () => {
  runAdapterContractTests(
    'AzureDevOps',
    () => new AzureDevOpsAdapter(testConfig),
    { supportsDelete: true, supportsComments: true }
  );
});

describe('RestAdapter', () => {
  runAdapterContractTests(
    'REST',
    () => new RestAdapter(testConfig),
    { supportsDelete: true, supportsComments: true }
  );
});
```

### Phase 3 Deliverables

- [ ] GitHub adapter passing contract tests
- [ ] Azure DevOps adapter passing contract tests
- [ ] REST adapter passing contract tests
- [ ] All adapters use MSW for API mocking
- [ ] 95%+ test coverage on all adapters

---

## Phase 4: Advanced Features (TDD)

### Offline Queue (TDD)

```typescript
// tests/unit/core/OperationQueue.test.ts
describe('OperationQueue', () => {
  let queue: IOfflineQueue;
  let mockAdapter: MockBackendAdapter;

  beforeEach(async () => {
    mockAdapter = new MockBackendAdapter();
    queue = new OperationQueue(mockAdapter);
  });

  describe('enqueue', () => {
    it('adds operation to queue', async () => {
      const id = await queue.enqueue({
        type: 'CREATE_ISSUE',
        payload: { title: 'Test', body: 'Body' }
      });

      expect(id).toBeDefined();
      const pending = await queue.getPending();
      expect(pending).toHaveLength(1);
    });

    it('persists to IndexedDB', async () => {
      await queue.enqueue({
        type: 'CREATE_ISSUE',
        payload: { title: 'Test', body: 'Body' }
      });

      // Create new instance to verify persistence
      const queue2 = new OperationQueue(mockAdapter);
      const pending = await queue2.getPending();
      expect(pending).toHaveLength(1);
    });
  });

  describe('processQueue', () => {
    it('processes operations in order', async () => {
      await queue.enqueue({ type: 'CREATE_ISSUE', payload: { title: 'First' } });
      await queue.enqueue({ type: 'CREATE_ISSUE', payload: { title: 'Second' } });

      await queue.processQueue();

      expect(mockAdapter.createIssue).toHaveBeenNthCalledWith(1, { title: 'First' });
      expect(mockAdapter.createIssue).toHaveBeenNthCalledWith(2, { title: 'Second' });
    });

    it('retries failed operations', async () => {
      mockAdapter.createIssue
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ id: '1', title: 'Test' });

      await queue.enqueue({ type: 'CREATE_ISSUE', payload: { title: 'Test' } });
      const result = await queue.processQueue();

      expect(result.succeeded).toHaveLength(1);
      expect(mockAdapter.createIssue).toHaveBeenCalledTimes(2);
    });

    it('marks operation as failed after max retries', async () => {
      mockAdapter.createIssue.mockRejectedValue(new Error('Permanent error'));

      await queue.enqueue({ type: 'CREATE_ISSUE', payload: { title: 'Test' } });
      const result = await queue.processQueue();

      expect(result.failed).toHaveLength(1);
    });
  });
});
```

### Phase 4 Deliverables

- [ ] OperationQueue with IndexedDB persistence
- [ ] Conflict resolution logic
- [ ] AttachmentManager with preview generation
- [ ] ScreenshotManager
- [ ] All features TDD with 95%+ coverage

---

## Phase 5: Polish & Additional Skins

### Optional React Skin

```typescript
// skins/react/components/TrakletWidget.tsx
import React, { useEffect, useState } from 'react';
import type { IWidgetPresenter, WidgetState } from '@traklet/contracts';

interface TrakletWidgetProps {
  presenter: IWidgetPresenter;
}

export function TrakletWidget({ presenter }: TrakletWidgetProps) {
  const [state, setState] = useState<WidgetState>(presenter.getState());

  useEffect(() => {
    return presenter.subscribe(setState);
  }, [presenter]);

  if (!state.isOpen) {
    return <TrakletLauncher onClick={() => presenter.open()} />;
  }

  return (
    <div className="traklet-widget" data-testid="traklet-widget">
      <TrakletHeader onClose={() => presenter.close()} />
      {state.isLoading ? <TrakletLoading /> : renderView(state.currentView)}
      {state.error && (
        <TrakletError
          message={state.error}
          onDismiss={() => presenter.clearError()}
        />
      )}
    </div>
  );
}
```

### Phase 5 Deliverables

- [ ] React skin (optional)
- [ ] Vue skin (optional)
- [ ] Accessibility audit passed
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Published to npm

---

## TDD Workflow Summary

```
For EVERY feature:

1. WRITE CONTRACT/INTERFACE
   └── Define what it should do (types only)

2. WRITE FAILING TESTS
   └── Test the interface behavior
   └── Tests should fail (nothing implemented)

3. IMPLEMENT MINIMUM CODE
   └── Just enough to pass tests
   └── No premature optimization

4. REFACTOR
   └── Clean up while keeping tests green
   └── Extract common patterns

5. DOCUMENT
   └── Update API docs
   └── Add usage examples
```

---

## Test Coverage Requirements

| Layer | Min Coverage | Notes |
|-------|--------------|-------|
| Contracts | 100% | Types only, but test files for contracts |
| Core | 95% | StateManager, EventBus, etc. |
| Adapters | 95% | Must pass contract tests |
| Presenters | 90% | Business logic |
| Skins/Components | 80% | UI rendering |

---

## Success Criteria

### Phase 1 (Headless Core)
- [ ] All interfaces defined with contract tests
- [ ] Core passes 95%+ coverage
- [ ] LocalStorageAdapter passes all contracts
- [ ] Zero UI dependencies

### Phase 2 (Default Skin)
- [ ] Lit skin renders correctly
- [ ] All CSS via custom properties
- [ ] Zero business logic in components
- [ ] Component tests pass

### Phase 3 (Adapters)
- [ ] All adapters pass contract tests
- [ ] GitHub, Azure DevOps, REST working
- [ ] MSW mocking for all API tests

### Phase 4 (Advanced)
- [ ] Offline queue working
- [ ] Permissions enforced
- [ ] Attachments/screenshots working

### Phase 5 (Release)
- [ ] Bundle < 30KB gzipped
- [ ] Accessibility compliant
- [ ] Documentation complete
- [ ] npm published

---

*End of Implementation Roadmap*
