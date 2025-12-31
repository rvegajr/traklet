# Traklet

> A backend-agnostic issue tracking widget for any JavaScript application

[![npm version](https://img.shields.io/npm/v/traklet.svg)](https://www.npmjs.com/package/traklet)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

## Features

- **Backend Agnostic** - Works with GitHub Issues, Azure DevOps, custom REST APIs, or localStorage
- **Zero Style Conflicts** - Shadow DOM isolation ensures your app's styles don't leak in
- **Offline Support** - Queue operations when offline, sync automatically when reconnected
- **Type-Safe** - Full TypeScript support with exported types
- **Permission System** - User-based permissions with email matching
- **Themeable** - 50+ CSS custom properties for complete customization
- **Tiny Bundle** - ~15KB gzipped core

## Installation

```bash
npm install traklet
```

## Quick Start

### Basic Usage (localStorage adapter for development)

```typescript
import { Traklet } from 'traklet';

const traklet = await Traklet.init({
  adapter: 'localStorage',
  projects: [
    { id: 'my-project', name: 'My Project' }
  ]
});

// Open the widget
traklet.open();
```

### Using the Configuration Builder (Recommended)

The configuration builder provides a wizard-like API that guides you through setup with full validation:

```typescript
import { TrakletBuilder } from 'traklet';

const traklet = await TrakletBuilder
  .create()
  .useLocalStorage()                          // or .useGitHub(), .useAzureDevOps()
  .addProject('my-project', 'My Project')
  .withTheme({ primary: '#6366f1' })
  .atPosition('bottom-right')
  .build();

traklet.open();
```

### GitHub Issues Backend

```typescript
import { TrakletBuilder } from 'traklet';

const traklet = await TrakletBuilder
  .create()
  .useGitHub({
    token: 'ghp_your_token_here',
    // Or use dynamic token retrieval:
    // getToken: async () => fetchTokenFromYourAuth()
  })
  .addProject('owner/repo', 'My GitHub Repo')
  .withUser({
    id: 'user-123',
    email: 'user@example.com',
    displayName: 'John Doe'
  })
  .withPermissions({
    canCreate: true,
    canEditOwn: true,
    canDeleteOwn: true
  })
  .build();
```

### Azure DevOps Backend

```typescript
import { TrakletBuilder } from 'traklet';

const traklet = await TrakletBuilder
  .create()
  .useAzureDevOps({
    organization: 'my-org',
    token: 'your-pat-token'
  })
  .addProject('my-project', 'My Azure Project')
  .build();
```

### Custom REST API Backend

```typescript
import { TrakletBuilder } from 'traklet';

const traklet = await TrakletBuilder
  .create()
  .useRest({
    baseUrl: 'https://api.example.com/issues',
    headers: {
      'Authorization': 'Bearer your-token'
    }
  })
  .addProject('project-1', 'Project One')
  .build();
```

## Configuration Options

### Full Configuration Object

```typescript
interface TrakletConfig {
  // Required: Backend adapter type
  adapter: 'github' | 'azure-devops' | 'rest' | 'localStorage';

  // Required: Projects to manage
  projects: Array<{
    id: string;
    name: string;
    description?: string;
  }>;

  // Authentication (required for remote backends)
  token?: string;
  getToken?: () => Promise<string>;
  baseUrl?: string;

  // User identity for permissions
  user?: {
    id: string;
    email?: string;
    displayName?: string;
  };

  // Permission overrides
  permissions?: {
    canCreate?: boolean;
    canEditOwn?: boolean;
    canEditAll?: boolean;
    canDeleteOwn?: boolean;
    canDeleteAll?: boolean;
    canComment?: boolean;
    canManageLabels?: boolean;
  };

  // UI customization
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  theme?: Partial<TrakletTheme>;

  // Offline behavior
  offline?: {
    enabled?: boolean;
    maxQueueSize?: number;
    syncInterval?: number;
  };
}
```

### Theme Customization

```typescript
await TrakletBuilder
  .create()
  .useLocalStorage()
  .addProject('demo', 'Demo')
  .withTheme({
    // Colors
    primary: '#6366f1',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',

    // Background
    bg: '#ffffff',
    bgSecondary: '#f9fafb',
    bgHover: '#f3f4f6',

    // Text
    text: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',

    // Borders
    border: '#e5e7eb',
    borderMuted: '#f3f4f6',

    // Sizing
    radiusSm: '4px',
    radiusMd: '6px',
    radiusLg: '8px',
  })
  .build();
```

## API Reference

### TrakletInstance

```typescript
interface TrakletInstance {
  // Widget controls
  open(): void;
  close(): void;
  isOpen(): boolean;

  // Project management
  getCurrentProject(): Project | null;
  getProjects(): readonly Project[];
  switchProject(projectId: string): Promise<void>;

  // Refresh data
  refresh(): Promise<void>;

  // Cleanup
  destroy(): void;

  // Presenters for custom UI integration
  getWidgetPresenter(): IWidgetPresenter;
  getIssueListPresenter(): IssueListPresenter;
  getIssueDetailPresenter(): IssueDetailPresenter;
  getIssueFormPresenter(): IssueFormPresenter;
}
```

### Event System

Subscribe to events for custom integrations:

```typescript
import { getEventBus } from 'traklet';

const eventBus = getEventBus();

// Issue events
eventBus.on('issue:created', ({ issue }) => {
  console.log('New issue:', issue.title);
});

eventBus.on('issue:updated', ({ issue, changes }) => {
  console.log('Issue updated:', issue.id);
});

eventBus.on('issue:deleted', ({ issueId }) => {
  console.log('Issue deleted:', issueId);
});

// Connection events
eventBus.on('connection:connected', ({ projects }) => {
  console.log('Connected with projects:', projects);
});

eventBus.on('connection:disconnected', () => {
  console.log('Disconnected');
});

// Widget events
eventBus.on('widget:opened', () => {});
eventBus.on('widget:closed', () => {});
```

## Web Components

Traklet uses Lit-based Web Components with Shadow DOM. You can use them directly:

```html
<script type="module">
  import { Traklet } from 'traklet';
  import 'traklet/lit';

  const instance = await Traklet.init({
    adapter: 'localStorage',
    projects: [{ id: 'demo', name: 'Demo' }]
  });

  // Use the web component
  const widget = document.createElement('traklet-widget');
  widget.instance = instance;
  widget.position = 'bottom-right';
  document.body.appendChild(widget);
</script>
```

## Testing Your Configuration

Traklet includes a validation helper to test your configuration before deployment:

```typescript
import { validateConfig, TrakletBuilder } from 'traklet';

// Validate raw config
const result = validateConfig({
  adapter: 'github',
  projects: [{ id: 'owner/repo', name: 'My Repo' }],
  token: process.env.GITHUB_TOKEN
});

if (!result.valid) {
  console.error('Config errors:', result.errors);
}

// Or use the builder with built-in validation
try {
  const builder = TrakletBuilder
    .create()
    .useGitHub({ token: 'invalid' })
    .addProject('', '');  // Will throw validation error

  await builder.validate(); // Throws if invalid
  await builder.build();
} catch (error) {
  console.error('Configuration error:', error.message);
}
```

## Browser Support

- Chrome 90+
- Firefox 90+
- Safari 15+
- Edge 90+

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build
npm run build

# Type check
npm run typecheck
```

## Architecture

Traklet follows a clean architecture with:

- **ISP-compliant interfaces** - Granular interfaces (IIssueReader, IIssueWriter, etc.)
- **Adapter pattern** - Swap backends without changing application code
- **Presenter/ViewModel** - Skin-agnostic UI logic
- **Event-driven** - Loosely coupled components via pub/sub

```
┌─────────────────────────────────────────────────┐
│              Your Application                    │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│               Traklet Widget                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Presenters│  │  State   │  │  Event Bus   │  │
│  └────┬─────┘  └────┬─────┘  └──────────────┘  │
│       └─────────────┼─────────────────────────┐ │
│                     │                          │ │
│              ┌──────▼──────┐                   │ │
│              │   Adapter   │                   │ │
│              │  Interface  │                   │ │
│              └──────┬──────┘                   │ │
└─────────────────────┼───────────────────────────┘
                      │
    ┌─────────────────┼─────────────────┐
    ▼                 ▼                 ▼
┌─────────┐    ┌───────────┐    ┌───────────┐
│ GitHub  │    │   Azure   │    │   REST    │
│ Issues  │    │  DevOps   │    │   API     │
└─────────┘    └───────────┘    └───────────┘
```

## License

MIT - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.
