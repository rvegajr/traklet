# Traklet - AI Assistant Rules

## 🎯 PROJECT OVERVIEW

**Traklet** is a self-contained, backend-agnostic issue tracking widget that can be dynamically injected into any JavaScript application. It supports GitHub Issues, Azure DevOps, and custom REST backends through an adapter pattern.

### Core Principles
- **Complete Encapsulation**: Shadow DOM isolation, no global namespace pollution
- **Backend Agnosticism**: Adapter pattern abstracts all backend operations
- **Configuration-Driven**: Single config object, runtime updates supported
- **Offline-Capable**: Queue operations for later sync when offline

---

## 🚫 COMMUNICATION RULES

### NO ICONS IN CLI OUTPUT
**NEVER use emoji/icons in:**
- Shell scripts
- Terminal commands
- Build scripts
- CI/CD output
- Error messages in terminal
- Log files
- npm scripts

**Allowed:**
- Documentation files (.md)
- UI components (Lit/Web Components)
- Comments in code
- Commit messages

---

## 🚫 MANDATE 1: ADAPTER INTERFACE COMPLIANCE

### ALL BACKEND OPERATIONS MUST GO THROUGH ADAPTERS

```typescript
// ❌ REJECT - Direct API calls
const response = await fetch('https://api.github.com/repos/owner/repo/issues');

// ❌ REJECT - Backend-specific logic in UI
if (config.backend === 'github') {
  // GitHub-specific code
}

// ✅ REQUIRE - Use adapter interface
import { useAdapter } from '@/core/AdapterContext';
const adapter = useAdapter();
const issues = await adapter.getIssues(query);
```

### Adapter Interface Contract (ENFORCE STRICTLY):

```typescript
interface IBackendAdapter {
  // Connection lifecycle
  connect(config: AdapterConfig): Promise<ConnectionResult>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Issues CRUD
  getIssues(query: IssueQuery): Promise<PaginatedResult<Issue>>;
  getIssue(id: string): Promise<Issue>;
  createIssue(issue: CreateIssueDTO): Promise<Issue>;
  updateIssue(id: string, updates: UpdateIssueDTO): Promise<Issue>;
  deleteIssue(id: string): Promise<void>;

  // Comments
  getComments(issueId: string): Promise<Comment[]>;
  addComment(issueId: string, comment: CreateCommentDTO): Promise<Comment>;

  // Attachments (REQUIRED)
  uploadAttachment(file: File): Promise<Attachment>;
  getAttachment(id: string): Promise<Attachment>;

  // Metadata
  getLabels(): Promise<Label[]>;
  getUsers(): Promise<User[]>;
  getProjects(): Promise<Project[]>;

  // Capabilities introspection
  getCapabilities(): AdapterCapabilities;
}
```

**When backend logic is needed:**
1. REJECT direct API calls
2. REQUIRE adapter method usage
3. SUGGEST capability checking for optional features
4. REFERENCE: src/adapters/IBackendAdapter.ts

---

## 🔐 MANDATE 2: AUTHENTICATION & USER IDENTITY

### PAT TOKEN + USER IDENTITY PATTERN

Authentication uses Personal Access Tokens (PAT) with user identity passed separately.

```typescript
// ❌ REJECT - Hardcoded tokens
const token = 'ghp_xxxxx';

// ❌ REJECT - Missing user identity (unless anonymous mode intended)
Traklet.init({
  auth: { token: process.env.PAT_TOKEN }
});

// ✅ REQUIRE - PAT + User identity (for full permissions)
Traklet.init({
  auth: {
    token: process.env.PAT_TOKEN,
    // OR
    getToken: () => fetchTokenFromVault(),
  },
  user: {
    email: 'user@example.com',
    name: 'Display Name',
    avatar?: 'https://...'
  }
});

// ✅ ALLOWED - Anonymous mode (view-only or view+create)
Traklet.init({
  auth: { token: process.env.PAT_TOKEN },
  // No user - operates in anonymous mode
  permissions: {
    anonymousMode: 'view_only'  // or 'view_create'
  }
});
```

### User Identity Interface (OPTIONAL - but required for edit/delete):

```typescript
interface TrakletUser {
  email: string;      // REQUIRED - unique identifier for user matching
  name: string;       // REQUIRED - display name
  avatar?: string;    // Optional - avatar URL
  id?: string;        // Optional - backend-specific ID
  username?: string;  // Optional - for GitHub username matching
}
```

### Token Management Rules:
1. **NEVER hardcode tokens in source code** — use environment variables or `getToken` callback
2. **NEVER commit `.traklet/settings.json`** — it is gitignored and protected by a pre-commit hook
3. **NEVER include tokens in README examples** — always show `process.env.VARIABLE_NAME`
4. User identity is OPTIONAL but determines permissions
5. SUPPORT token refresh via callback
6. For shared team access (UAT), use a service account token via env var; individual testers identify via the widget settings (name/email stored per-browser)

**Enforcement:**
- `.gitignore` excludes `.traklet/settings.json`
- Pre-commit hook in `.githooks/pre-commit` blocks settings.json commits
- Runtime console warning if token appears hardcoded in browser context
- `npm install` auto-configures the git hook via `prepare` script

**When auth code is needed:**
1. REQUIRE token via env var, config callback, or widget settings UI
2. User identity is OPTIONAL (auto-detected from backend or entered in settings gear)
3. REJECT hardcoded credentials in any code review
4. REFERENCE: src/core/AuthManager.ts, src/core/PermissionManager.ts, src/core/UserIdentityStore.ts

---

## 📦 MANDATE 3: MULTI-PROJECT SUPPORT

### PROJECT SWITCHING MUST BE SUPPORTED

The widget must support switching between multiple projects/repositories.

```typescript
// ❌ REJECT - Single project assumption
const issues = await adapter.getIssues();

// ✅ REQUIRE - Project-aware queries
const issues = await adapter.getIssues({
  project: currentProject.id,
  ...filters
});

// ✅ REQUIRE - Project switching
const projects = await adapter.getProjects();
await adapter.switchProject(projectId);
```

### Configuration Pattern:

```typescript
interface TrakletConfig {
  // Single project (simple mode)
  backend: {
    owner: 'myorg',
    repo: 'myrepo'
  };

  // OR Multi-project mode
  backend: {
    projects: [
      { owner: 'myorg', repo: 'repo1', label: 'Frontend' },
      { owner: 'myorg', repo: 'repo2', label: 'Backend' },
    ],
    defaultProject?: 'repo1'
  };
}
```

**When adding features:**
1. ALWAYS consider multi-project context
2. REQUIRE project selector in UI when multiple projects configured
3. PERSIST selected project preference
4. REFERENCE: src/core/ProjectManager.ts

---

## 🔒 MANDATE 4: PERMISSION SYSTEM & USER MATCHING

### USER-BASED PERMISSIONS ARE REQUIRED

Permissions are determined by matching the configured user against issue/comment authors.

```typescript
// ✅ REQUIRE - Permission checks before mutations
class PermissionManager {
  canEditIssue(issue: Issue): boolean {
    return this.matchesUser(issue.createdBy);
  }

  canDeleteIssue(issue: Issue): boolean {
    return this.matchesUser(issue.createdBy);
  }

  canEditComment(comment: Comment): boolean {
    return this.matchesUser(comment.author);
  }

  private matchesUser(author: User): boolean {
    if (!this.currentUser) return false;
    // Primary: email match (case-insensitive)
    // Fallback: id or username match
    return this.currentUser.email?.toLowerCase() === author.email?.toLowerCase();
  }
}
```

### Permission Rules:

| Action | Owner | Authenticated | Anonymous (view_only) | Anonymous (view_create) |
|--------|-------|---------------|----------------------|-------------------------|
| View issues | ✅ | ✅ | ✅ | ✅ |
| View images | ✅ | ✅ | ✅ | ✅ |
| Create issue | ✅ | ✅ | ❌ | ✅ |
| Edit issue | ✅ | ❌ | ❌ | ❌ |
| Delete issue | ✅ | ❌ | ❌ | ❌ |
| Add comment | ✅ | ✅ | ❌ | ✅ |
| Edit comment | Own only | Own only | ❌ | ❌ |
| Delete comment | Own only | Own only | ❌ | ❌ |

### UI Permission Integration:

```typescript
// ✅ REQUIRE - UI components check permissions
@customElement('traklet-issue-detail')
class IssueDetail extends LitElement {
  render() {
    const canEdit = this.permissions.canEditIssue(this.issue);
    const canDelete = this.permissions.canDeleteIssue(this.issue);

    return html`
      <div class="actions">
        ${canEdit ? html`<button data-testid="traklet-btn-edit">Edit</button>` : ''}
        ${canDelete ? html`<button data-testid="traklet-btn-delete">Delete</button>` : ''}
      </div>
    `;
  }
}
```

**When implementing UI actions:**
1. ALWAYS check permissions before showing edit/delete buttons
2. REQUIRE PermissionManager for all mutation operations
3. SHOW appropriate feedback when permission denied
4. SUPPORT anonymous mode configuration
5. REFERENCE: src/core/PermissionManager.ts

---

## 📎 MANDATE 5: ATTACHMENTS & SCREENSHOTS (with Image Viewing)

### FILE ATTACHMENTS ARE REQUIRED FEATURES

```typescript
// ✅ REQUIRE - Attachment support in issue creation
interface CreateIssueDTO {
  title: string;
  body: string;
  attachments?: File[];
}

// ✅ REQUIRE - Screenshot capture capability
interface TrakletConfig {
  features: {
    attachments: true,
    screenshots: true,  // Browser screenshot API
    selfScreenshots: true  // Capture widget's host page
  }
}
```

### Screenshot Implementation:

```typescript
// ✅ REQUIRE - Use html2canvas or similar for self-screenshots
async function captureScreenshot(): Promise<Blob> {
  // Capture host page (excluding Traklet widget)
  const canvas = await html2canvas(document.body, {
    ignoreElements: (el) => el.closest('[data-traklet-widget]')
  });
  return await canvasToBlob(canvas);
}
```

### Attachment Handling Rules:
1. REQUIRE file type validation
2. REQUIRE file size limits (configurable)
3. SUPPORT image preview before upload
4. SUPPORT drag-and-drop uploads
5. HANDLE backend-specific upload mechanisms

### Image Viewing (REQUIRED):

```typescript
// ✅ REQUIRE - Full image gallery in issue detail
interface AttachmentGallery {
  images: Array<{
    thumbnailUrl: string;  // Grid thumbnail
    fullUrl: string;       // Lightbox view
    filename: string;
  }>;
  files: Array<{
    filename: string;
    downloadUrl: string;
  }>;
}

// ✅ REQUIRE - Lightbox for full-size image viewing
interface ImageLightbox {
  // Features required:
  // - Full-screen viewing
  // - Zoom (mouse wheel, pinch)
  // - Pan when zoomed
  // - Navigate between images
  // - Download button
  // - Close (X, Escape, click outside)
}
```

**When implementing attachments:**
1. CHECK adapter capabilities first
2. PROVIDE fallback for backends without native attachment support
3. SUPPORT base64 inline images as fallback
4. REQUIRE image lightbox for viewing
5. REFERENCE: src/features/AttachmentManager.ts, src/ui/components/ImageLightbox.ts

---

## 🔄 MANDATE 6: OFFLINE SUPPORT & OPERATION QUEUE

### OFFLINE-FIRST ARCHITECTURE

```typescript
// ❌ REJECT - Direct operations without offline handling
await adapter.createIssue(issue);

// ✅ REQUIRE - Queue-aware operations
import { OperationQueue } from '@/core/OperationQueue';

const queue = new OperationQueue();
await queue.enqueue({
  type: 'CREATE_ISSUE',
  payload: issue,
  timestamp: Date.now()
});

// Queue automatically syncs when online
```

### Offline Behavior:
1. DETECT network status changes
2. QUEUE write operations when offline
3. SHOW pending operations indicator
4. SYNC automatically when back online
5. HANDLE conflict resolution

### Operation Queue Interface:

```typescript
interface QueuedOperation {
  id: string;
  type: 'CREATE_ISSUE' | 'UPDATE_ISSUE' | 'ADD_COMMENT' | 'UPLOAD_ATTACHMENT';
  payload: unknown;
  timestamp: number;
  retries: number;
  status: 'pending' | 'syncing' | 'failed';
}

interface OperationQueue {
  enqueue(op: Omit<QueuedOperation, 'id' | 'retries' | 'status'>): Promise<string>;
  getPending(): QueuedOperation[];
  sync(): Promise<SyncResult>;
  clear(): void;
}
```

**When implementing mutations:**
1. ALWAYS go through operation queue
2. PROVIDE optimistic UI updates
3. HANDLE sync failures gracefully
4. PERSIST queue to IndexedDB
5. REFERENCE: src/core/OperationQueue.ts

---

## 🎨 MANDATE 7: SHADOW DOM ISOLATION

### ALL UI MUST USE SHADOW DOM

```typescript
// ❌ REJECT - Global DOM manipulation
document.body.appendChild(widgetElement);
document.querySelector('.traklet-btn');

// ❌ REJECT - Global styles
import './styles.css';  // Leaks to host page

// ✅ REQUIRE - Shadow DOM encapsulation
class TrakletWidget extends LitElement {
  static styles = css`/* scoped styles */`;

  createRenderRoot() {
    return this.attachShadow({ mode: 'open' });
  }
}
```

### Isolation Requirements:
1. ALL widget UI in Shadow DOM
2. NO global CSS imports
3. NO global event listeners (use shadow root)
4. EXPOSE controlled API for host communication

**When building UI:**
1. USE Lit or vanilla Web Components
2. SCOPE all styles to shadow root
3. USE CSS custom properties for theming
4. REFERENCE: src/ui/WidgetContainer.ts

---

## 🧪 MANDATE 8: TEST-DRIVEN DEVELOPMENT

### RULES:

1. **Write tests first (TDD)**
   - Write failing test (RED)
   - Write implementation (GREEN)
   - Refactor (REFACTOR)

2. **Coverage thresholds**
   - Statements: 85%
   - Branches: 80%
   - Functions: 85%
   - Lines: 85%

3. **Adapter testing pattern**
   ```typescript
   // ✅ REQUIRE - Test all adapters against same contract
   describe.each([
     ['GitHub', GitHubAdapter],
     ['AzureDevOps', AzureDevOpsAdapter],
     ['REST', RestAdapter],
   ])('%s Adapter', (name, AdapterClass) => {
     it('implements IBackendAdapter contract', () => {
       // Test interface compliance
     });
   });
   ```

4. **Mock server for integration tests**
   ```typescript
   // ✅ REQUIRE - MSW for API mocking
   import { setupServer } from 'msw/node';
   import { githubHandlers } from './mocks/github';

   const server = setupServer(...githubHandlers);
   ```

---

## 🔧 MANDATE 9: CONFIGURATION SCHEMA

### SINGLE CONFIGURATION OBJECT

```typescript
interface TrakletConfig {
  // REQUIRED
  adapter: 'github' | 'azure-devops' | 'rest' | 'localStorage' | AdapterConstructor;

  // REQUIRED - Backend-specific config
  backend: GitHubConfig | AzureDevOpsConfig | RestConfig;

  // REQUIRED - User identity
  user: {
    email: string;
    name: string;
    avatar?: string;
  };

  // REQUIRED - Auth
  auth: {
    token?: string;
    getToken?: () => Promise<string>;
  };

  // Optional - UI
  ui?: {
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'inline';
    theme?: 'light' | 'dark' | 'auto' | ThemeConfig;
    launcher?: { icon?: string; text?: string; hotkey?: string; };
  };

  // Optional - Features
  features?: {
    createIssue?: boolean;
    editIssue?: boolean;
    comments?: boolean;
    attachments?: boolean;
    screenshots?: boolean;
    offlineSupport?: boolean;
  };

  // Optional - Hooks
  hooks?: {
    onIssueCreate?: (issue: Issue) => void;
    onError?: (error: TrakletError) => void;
    getContextData?: () => Record<string, unknown>;
  };
}
```

---

## 📋 UI AUTOMATION REQUIREMENTS

All UI components MUST be automation-friendly.

### Data Test IDs (MANDATORY)

| Element Type | Pattern | Example |
|-------------|---------|---------|
| Buttons | `data-testid="traklet-btn-{action}"` | `data-testid="traklet-btn-create"` |
| Forms | `data-testid="traklet-form-{name}"` | `data-testid="traklet-form-issue"` |
| Inputs | `data-testid="traklet-input-{field}"` | `data-testid="traklet-input-title"` |
| Lists | `data-testid="traklet-list-{name}"` | `data-testid="traklet-list-issues"` |
| Items | `data-testid="traklet-item-{id}"` | `data-testid="traklet-item-123"` |

### Widget Container Attribute:
```html
<div data-traklet-widget data-testid="traklet-root">
  <!-- Shadow DOM content -->
</div>
```

---

## 🔍 TYPE SAFETY

### RULES:

1. **Zero `any` types**
   ```typescript
   // ❌ REJECT
   function handleData(data: any) { }

   // ✅ REQUIRE
   function handleData<T extends Issue>(data: T) { }
   ```

2. **TypeScript strict mode**
   ```json
   {
     "compilerOptions": {
       "strict": true,
       "noImplicitAny": true,
       "strictNullChecks": true
     }
   }
   ```

3. **Discriminated unions for adapter responses**
   ```typescript
   type AdapterResult<T> =
     | { success: true; data: T }
     | { success: false; error: TrakletError };
   ```

---

## 📚 PROJECT STRUCTURE

```
traklet/
├── src/
│   ├── core/
│   │   ├── Traklet.ts              # Main entry, orchestrator
│   │   ├── ConfigManager.ts        # Configuration handling
│   │   ├── StateManager.ts         # Internal state (Zustand-like)
│   │   ├── EventBus.ts             # Pub/sub for host communication
│   │   ├── AuthManager.ts          # Token + user identity
│   │   ├── PermissionManager.ts    # User matching & permissions
│   │   ├── ProjectManager.ts       # Multi-project support
│   │   └── OperationQueue.ts       # Offline operation queue
│   │
│   ├── adapters/
│   │   ├── IBackendAdapter.ts      # Interface contract
│   │   ├── BaseAdapter.ts          # Shared adapter logic
│   │   ├── GitHubAdapter.ts        # GitHub Issues
│   │   ├── AzureDevOpsAdapter.ts   # Azure DevOps Work Items
│   │   ├── RestAdapter.ts          # Generic REST API
│   │   └── LocalStorageAdapter.ts  # Offline/demo mode
│   │
│   ├── models/
│   │   ├── Issue.ts                # Unified issue model
│   │   ├── Comment.ts
│   │   ├── Attachment.ts
│   │   ├── Label.ts
│   │   ├── User.ts
│   │   └── Project.ts
│   │
│   ├── ui/
│   │   ├── TrakletWidget.ts        # Main Web Component
│   │   ├── components/
│   │   │   ├── IssueList.ts
│   │   │   ├── IssueDetail.ts        # Full GUI with edit/delete
│   │   │   ├── IssueForm.ts          # Create/Edit form
│   │   │   ├── CommentThread.ts
│   │   │   ├── AttachmentUpload.ts
│   │   │   ├── AttachmentGallery.ts  # Image thumbnails
│   │   │   ├── ImageLightbox.ts      # Full-screen image viewer
│   │   │   ├── ScreenshotCapture.ts
│   │   │   ├── ProjectSelector.ts
│   │   │   ├── FilterBar.ts
│   │   │   ├── ConfirmDialog.ts      # Delete confirmations
│   │   │   └── OfflineIndicator.ts
│   │   ├── styles/
│   │   └── themes/
│   │
│   ├── features/
│   │   ├── AttachmentManager.ts
│   │   ├── ScreenshotManager.ts
│   │   └── OfflineManager.ts
│   │
│   └── utils/
│       ├── http.ts
│       ├── validators.ts
│       └── markdown.ts
│
├── tests/
│   ├── adapters/
│   ├── ui/
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
│   └── multi-project.html
│
├── CLAUDE.md                       # This file
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

---

## ✅ APPROVAL CHECKLIST

Before approving any code, verify:

- [ ] Uses adapter interface (no direct backend calls)
- [ ] User identity handled correctly (optional, enables permissions)
- [ ] Permission checks for edit/delete operations
- [ ] Anonymous mode supported (view_only or view_create)
- [ ] Supports multi-project context
- [ ] Handles offline scenarios
- [ ] Uses Shadow DOM for UI isolation
- [ ] Has data-testid attributes
- [ ] Full GUI support (view, create, edit, delete)
- [ ] Image viewing with lightbox
- [ ] No `any` types
- [ ] Tests written first (TDD)
- [ ] 85%+ test coverage

---

## 🎯 YOUR ROLE

You are the **architectural enforcer** for Traklet. Your job is to:

1. ✅ **APPROVE** code that follows mandates
2. ❌ **REJECT** code that violates mandates
3. 📚 **EDUCATE** on correct patterns
4. 🔄 **SUGGEST** better alternatives
5. 📖 **REFERENCE** this document

**Be strict but helpful. Zero violations allowed.**

---

## 💡 QUICK REFERENCE

### Initialize Traklet
```typescript
import { Traklet } from 'traklet';

Traklet.init({
  adapter: 'github',
  backend: { owner: 'myorg', repo: 'myrepo' },
  user: { email: 'dev@example.com', name: 'Developer' },
  auth: { token: process.env.GITHUB_PAT }
});
```

### Script Tag Integration
```html
<script src="https://unpkg.com/traklet/dist/traklet.min.js"></script>
<script>
  Traklet.init({
    adapter: 'github',
    backend: { owner: 'myorg', repo: 'myrepo' },
    user: { email: 'user@example.com', name: 'User' },
    auth: { getToken: () => window.getGitHubToken() }
  });
</script>
```

### Custom Adapter
```typescript
import { Traklet, IBackendAdapter } from 'traklet';

class MyAdapter implements IBackendAdapter {
  // Implement all interface methods
}

Traklet.init({
  adapter: MyAdapter,
  backend: { apiUrl: 'https://my-api.com' },
  user: { email: 'user@example.com', name: 'User' },
  auth: { token: 'xxx' }
});
```

---

**Last Updated:** December 2024
**Status:** ACTIVE - ENFORCED
