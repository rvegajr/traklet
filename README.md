# Traklet

> A backend-agnostic issue tracking and test case management widget that drops into any JavaScript application.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Drop-in Widget** - One line of code adds a floating issue tracker to any app
- **Backend Agnostic** - Azure DevOps, GitHub Issues, generic REST APIs, or localStorage
- **Test Case Management** - Structured test cases with sections, test runs, pass/fail tracking
- **Zero Style Conflicts** - Shadow DOM isolation, no CSS leaks in or out
- **Draggable & Snappable** - Float anywhere, snap to edges as a sidebar, resize
- **Themeable** - 8 color themes + dark mode, all customizable
- **Offline Support** - Queue operations when offline, sync on reconnect
- **Jam.dev Integration** - Paste recording links directly into test evidence
- **Screenshot Paste** - Ctrl+V images into any editable section
- **CLI** - `npx traklet sync` seeds test cases from markdown files

## Quick Start

```typescript
import { Traklet } from 'traklet';

await Traklet.init({
  adapter: 'localStorage',
  projects: [{ id: 'my-project', name: 'My Project' }],
});
// Widget appears. Done.
```

## Connecting to a Backend

### Azure DevOps

```typescript
await Traklet.init({
  adapter: 'azure-devops',
  baseUrl: 'https://dev.azure.com/your-org',
  token: process.env.TRAKLET_PAT,  // Always use env vars
  projects: [{ id: 'your-project', name: 'Your Project', identifier: 'your-project' }],
});
```

### GitHub Issues

```typescript
await Traklet.init({
  adapter: 'github',
  token: process.env.GITHUB_TOKEN,
  projects: [{ id: 'owner/repo', name: 'My Repo', identifier: 'owner/repo' }],
});
```

### Generic REST API

```typescript
await Traklet.init({
  adapter: 'rest',
  baseUrl: 'https://api.example.com',
  token: process.env.API_TOKEN,
  projects: [{ id: 'project-1', name: 'Project One' }],
});
```

---

## Framework Integration

Traklet is fully self-contained. **No proxy routes, no API middleware, no backend code in your app.** Traklet's built-in adapters handle all communication with GitHub, Azure DevOps, or your REST API directly. The only thing your host application provides is the PAT token via an environment variable.

### What You Write vs. What Traklet Handles

| Concern | Your app | Traklet |
|---------|----------|---------|
| API calls to GitHub/ADO | Nothing | Built-in adapters |
| Issue CRUD, comments, labels | Nothing | Adapter layer |
| Widget UI (list, detail, form) | Nothing | Shadow DOM components |
| CSS isolation | Nothing | Shadow DOM — zero conflicts |
| Offline queue & sync | Nothing | IndexedDB operation queue |
| Authentication | Provide a PAT token | Sends it with every API call |
| User identity | Pass current user to `init()` | Attributes issues to that user |

### Passing the Current User

Traklet needs to know **who** is performing actions so issues and test results are properly attributed. Pass the logged-in user's identity from your app's existing auth system:

```typescript
await Traklet.init({
  adapter: 'github',
  token: process.env.NEXT_PUBLIC_GITHUB_TOKEN,
  projects: [{ id: 'my-repo', name: 'My Repo', identifier: 'owner/repo' }],
  user: {
    email: currentUser.email,       // Required — used for attribution
    name: currentUser.displayName,  // Optional — shown in the widget
    id: currentUser.id,             // Optional — unique identifier
  },
});
```

If `user` is omitted, the widget settings gear allows each user to self-identify (name + email stored in browser localStorage). But for proper tracking, always pass the user from your auth system.

**Common patterns for reading the current user:**

```typescript
// JWT in localStorage (decode payload without verification)
const jwt = JSON.parse(atob(localStorage.getItem('auth_token')!.split('.')[1]));
user: { email: jwt.email, id: jwt.sub }

// React context
const { user } = useAuth();
user: { email: user.email, name: user.name }

// Cookie-based session
const res = await fetch('/api/me');
const me = await res.json();
user: { email: me.email, name: me.name, id: me.id }
```

### Next.js (App Router)

**1. Install**

```bash
npm install traklet
# or link a local build:
npm link traklet
```

If using `npm link`, add to `next.config.js`:

```js
transpilePackages: ['traklet'],
// and in webpack config:
config.resolve.symlinks = false;
```

**2. Add environment variables** to `.env.local` (gitignored):

```bash
NEXT_PUBLIC_TRAKLET_GITHUB_TOKEN=ghp_your_pat_here
NEXT_PUBLIC_TRAKLET_GITHUB_REPO=owner/repo
```

**3. Create a single component** — this is the only file you add:

```tsx
// src/components/TrakletWidget.tsx
'use client';

import { useEffect, useRef } from 'react';

// Decode JWT payload to get the logged-in user (no verification needed client-side)
function decodeJwt(token: string | null) {
  if (!token) return null;
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

export function TrakletWidget() {
  const instanceRef = useRef<{ destroy: () => void } | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_TRAKLET_GITHUB_TOKEN;
    const repo = process.env.NEXT_PUBLIC_TRAKLET_GITHUB_REPO;
    if (!token || !repo || initRef.current) return;
    initRef.current = true;

    (async () => {
      const { Traklet } = await import('traklet');

      // Read current user from your app's auth token
      const jwt = decodeJwt(localStorage.getItem('auth_token'));

      instanceRef.current = await Traklet.init({
        adapter: 'github',
        token,
        projects: [{ id: 'my-project', name: 'My Project', identifier: repo }],
        user: jwt ? { email: jwt.email, id: jwt.sub } : undefined,
      });
    })().catch(console.error);

    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
      initRef.current = false;
    };
  }, []);

  return null; // Traklet mounts its own Shadow DOM
}
```

**4. Add to your layout:**

```tsx
// src/app/layout.tsx
import { TrakletWidget } from '@/components/TrakletWidget';

// Inside <body>:
<TrakletWidget />
```

That's it. No API routes. No proxy. No data mapping.

### React (Vite / CRA)

```tsx
// App.tsx or index.tsx
import { useEffect } from 'react';
import { useAuth } from './hooks/useAuth'; // your app's auth hook

function App() {
  const { user } = useAuth();

  useEffect(() => {
    let instance: { destroy: () => void } | null = null;
    (async () => {
      const { Traklet } = await import('traklet');
      instance = await Traklet.init({
        adapter: 'github',
        token: import.meta.env.VITE_GITHUB_TOKEN,
        projects: [{ id: 'my-repo', name: 'My Repo', identifier: 'owner/repo' }],
        user: user ? { email: user.email, name: user.name } : undefined,
      });
    })();
    return () => { instance?.destroy(); };
  }, [user]);

  return <div>{/* your app */}</div>;
}
```

### Vanilla JavaScript

```html
<script type="module">
  import { Traklet } from './node_modules/traklet/dist/traklet.es.js';

  await Traklet.init({
    adapter: 'github',
    token: 'ghp_xxx', // In production, inject via build tool or server-side template
    projects: [{ id: 'my-repo', name: 'My Repo', identifier: 'owner/repo' }],
  });
</script>
```

### Dev-Only Conditional Loading

To show the widget only in development environments, guard the init call:

```typescript
const isDev = window.location.hostname === 'localhost'
  || window.location.port === '3000';

if (isDev && token) {
  const { Traklet } = await import('traklet');
  await Traklet.init({ /* ... */ });
}
```

The dynamic `import()` ensures Traklet is never bundled in production when the guard prevents execution.

---

## Security: Token Management

> **Never commit tokens to source code or version control.**

Traklet enforces this with multiple safeguards:

### How to Provide Tokens

```typescript
// CORRECT: Environment variable
await Traklet.init({
  adapter: 'azure-devops',
  token: process.env.TRAKLET_PAT,
  // ...
});

// CORRECT: Dynamic callback (e.g., from your auth system)
await Traklet.init({
  adapter: 'azure-devops',
  getToken: async () => await yourAuthService.getToken(),
  // ...
});

// CORRECT: User enters token in the widget settings gear
// (stored per-browser in localStorage, never in code)
await Traklet.init({
  adapter: 'azure-devops',
  // No token — user enters it via settings UI
  // ...
});
```

```typescript
// WRONG: Hardcoded token in source code
await Traklet.init({
  token: 'EVYu...actual-token-here',  // DO NOT DO THIS
});
```

### Local Development Settings

For local development, create `.traklet/settings.json` (gitignored by default):

```bash
cp .traklet/settings.template.json .traklet/settings.json
# Edit settings.json with your token — this file never gets committed
```

### Shared Team Access (UAT/Staging)

For deployed UAT environments where multiple testers need access:

1. **Set the token via environment variable** on the server
2. Each tester identifies themselves via the settings gear (name + email)
3. The token provides access; the name/email provides attribution

```typescript
// In your deployed app's initialization
await Traklet.init({
  adapter: 'azure-devops',
  token: process.env.TRAKLET_PAT,      // Shared service account token
  baseUrl: process.env.TRAKLET_ADO_URL,
  projects: [{ id: process.env.TRAKLET_PROJECT, name: 'UAT' }],
});
// Each tester enters their name in the widget settings gear
```

### Built-in Safeguards

| Safeguard | What it does |
|-----------|-------------|
| `.gitignore` | `.traklet/settings.json` excluded from git |
| **Pre-commit hook** | Blocks any attempt to commit settings.json, even with `git add -f` |
| **Runtime warning** | Console warning if token appears hardcoded in browser context |
| **`npm install` auto-setup** | Hook is configured automatically via `prepare` script |

### Token Scopes Required

| Backend | Required Scopes |
|---------|----------------|
| Azure DevOps | Work Items: Read & Write |
| GitHub | `repo` (for private repos) or `public_repo` |
| REST API | Depends on your API |

---

## Test Case Management

### `.traklet/` Folder Convention

Define test cases as markdown files in your repo:

```
.traklet/
├── config.md              # Project config
├── settings.json          # YOUR token (gitignored, never committed)
├── settings.template.json # Template (committed, no secrets)
└── test-cases/
    ├── auth/
    │   ├── TC-001-login.md
    │   └── TC-002-logout.md
    └── dashboard/
        └── TC-010-loads.md
```

### Test Case Format

```markdown
---
id: TC-001
title: "Login with valid credentials"
priority: critical
labels: [auth, smoke]
depends: [TC-000]
suite: auth
---

{traklet:section:objective}
## Objective
Verify login works with valid credentials.
{/traklet:section:objective}

{traklet:section:steps}
## Steps
1. Navigate to /login
2. Enter valid credentials
3. Click Sign In
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
User is redirected to /dashboard.
{/traklet:section:expected-result}
```

### CLI Commands

```bash
npx traklet scan        # List discovered test cases
npx traklet validate    # Check dependencies and format
npx traklet sync        # Seed to backend (idempotent)
npx traklet sync --dry-run  # Preview without creating
```

### Test Runs

Start a test run from the widget (checkbox icon in header):
1. Name the run (e.g., "Sprint 12 QA")
2. Browse test cases → mark each as Pass/Fail/Blocked
3. See progress in the dashboard
4. Stop the run → results saved in history

---

## Widget Controls

| Action | How |
|--------|-----|
| **Open** | Click the anchor icon |
| **Close** | Click minimize (dash icon) |
| **Drag** | Grab the header bar |
| **Snap to edge** | Drag to left/right edge of screen |
| **Resize sidebar** | Drag the inner edge handle |
| **Unsnap** | Double-click header or drag away |
| **Settings** | Gear icon in header |
| **Test Runs** | Checkbox icon in header |
| **Theme** | Settings → color swatches + dark mode toggle |

---

## Development

```bash
npm install          # Install deps + configure git hooks
npm run dev          # Dev server on port 8888
npm test             # Run 688+ unit tests
npm run test:coverage # Coverage report (91%+ threshold)
npx playwright test  # Run 19 E2E tests
npm run build        # Production build
```

## Architecture

- **ISP Interfaces** - `IIssueReader`, `IIssueWriter`, `IIssueDeleter`, `ICommentManager`, etc.
- **Adapter Pattern** - Swap backends without changing app code
- **Presenter/ViewModel** - Skin-agnostic UI logic
- **Shadow DOM** - Complete CSS isolation
- **Event Bus** - Loosely coupled pub/sub

## License

MIT
