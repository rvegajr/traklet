# Traklet

> A backend-agnostic issue tracking and test case management widget that drops into any JavaScript application.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![AI Integration](https://img.shields.io/badge/AI-Integration%20Prompt-9cf.svg)](./AI_INTEGRATION_PROMPT.md)

**🤖 [Use AI to integrate automatically](./AI_INTEGRATION_PROMPT.md)** - Copy prompt → Give to Claude/ChatGPT → Get perfect integration

---

## 📚 Documentation

- **🚀 [Quick Start](#quick-start)** - Get started in 5 minutes
- **🤖 [AI Integration Prompt](./AI_INTEGRATION_PROMPT.md)** - Let AI do the integration for you
- **📖 [Complete Integration Guide](./INTEGRATION.md)** - Framework-specific instructions
- **📋 [Quick Reference Card](./QUICK_REFERENCE.md)** - One-page printable guide
- **⚡ [One-Pager for Sharing](./AI_INTEGRATION_ONEPAGER.md)** - Share with your team

---

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

## Design Philosophy: Minimal Host Footprint

Traklet follows a strict **zero-coupling** integration pattern:

```
┌─────────────────────────────────────────────────────────────┐
│  YOUR APPLICATION                                           │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │  src/components/TrakletDevWidget.tsx               │   │
│  │                                                     │   │
│  │  • NO imports from your app                        │   │
│  │  • NO reading host auth (JWT, cookies, session)    │   │
│  │  • ONLY reads env vars                             │   │
│  │  • Dynamic import: await import('traklet')         │   │
│  └────────────────────────────────────────────────────┘   │
│                            ▼                                │
│  ┌────────────────────────────────────────────────────┐   │
│  │  layout.tsx: <TrakletDevWidget />  ← 1 line only   │   │
│  └────────────────────────────────────────────────────┘   │
│                            ▼                                │
│         ┌──────────────────────────────────┐              │
│         │    Traklet Widget (Shadow DOM)   │              │
│         │  ┌────────────────────────────┐  │              │
│         │  │ • Self-contained UI        │  │              │
│         │  │ • Built-in adapters        │  │              │
│         │  │ • Offline queue            │  │              │
│         │  │ • User identity managed    │  │              │
│         │  └────────────────────────────┘  │              │
│         └──────────────────────────────────┘              │
│                            │                                │
│                            ▼                                │
│         Direct API calls (no host proxy)                   │
│                            │                                │
└────────────────────────────┼───────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │  Azure DevOps / GitHub   │
              │  Backend (direct calls)  │
              └──────────────────────────┘
```

**Removal = Delete 3 things:**
1. `TrakletDevWidget.tsx` file
2. `<TrakletDevWidget />` line in layout
3. 2 env vars from `.env.local`

### What Makes Traklet Different

| Traditional Issue Tracker | Traklet |
|---------------------------|---------|
| Backend integration code in your app | Built-in adapters, no host code |
| API proxy routes (`/api/issues/*`) | Direct adapter-to-backend calls |
| UI components in your component tree | Shadow DOM, isolated |
| CSS conflicts & specificity wars | Shadow DOM, zero leaks |
| Reads from host auth (JWT, session) | Self-contained `.traklet/settings.json` |
| 10+ files, complex setup | 1 component + 2 env vars |

### The Integration Contract

**You provide:**
- 1 wrapper component that calls `Traklet.init()`
- 2 environment variables (PAT token + optional config)

**Traklet provides:**
- Complete UI (Shadow DOM isolated)
- Backend adapters (GitHub, Azure DevOps, REST)
- Offline queue & sync
- User identity management
- Test case management

**Removal = 3 deletions:**
1. Delete the wrapper component
2. Delete `<TrakletWidget />` from your layout
3. Delete the env vars

No residual code. No migrations. No cleanup. If it's harder than this, the integration is wrong.

## Quick Start

### Option 1: AI-Assisted Integration (Recommended)

Copy this prompt and give it to Claude, ChatGPT, or any AI assistant:

```
Integrate Traklet into my [Next.js/React/Vue] project.

Requirements:
- Zero host coupling (no imports from my app)
- Zero auth coupling (don't read my auth system)
- Only 1 component + 1 line in layout + 2 env vars
- Token from environment variables only
- Dev-only loading (not in production)

Framework: [Your framework]
Backend: [azure-devops / github / localStorage]
Backend config: [your org/repo]

Follow the canonical pattern from: https://github.com/rvegajr/traklet/blob/main/AI_INTEGRATION_PROMPT.md
```

The AI will generate perfect, copy-paste ready code following best practices.

**Full AI prompt with examples:** [AI_INTEGRATION_PROMPT.md](./AI_INTEGRATION_PROMPT.md)

---

### Option 2: Manual Integration

**Zero-coupling integration in 3 steps:**

```typescript
// 1. Install
npm install traklet

// 2. Create ONE wrapper component (the only file you add)
'use client';
import { useEffect } from 'react';

export function TrakletDevWidget() {
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_TRAKLET_PAT;
    if (!token || process.env.NEXT_PUBLIC_TRAKLET_ENABLED !== 'true') return;

    (async () => {
      const { Traklet } = await import('traklet');
      await Traklet.init({
        adapter: 'localStorage',  // or 'github', 'azure-devops'
        projects: [{ id: 'my-project', name: 'My Project' }],
      });
    })();
  }, []);
  return null;
}

// 3. Add to your layout
<TrakletDevWidget />
```

**Environment variables** (`.env.local`):
```bash
NEXT_PUBLIC_TRAKLET_PAT=your_token_here
NEXT_PUBLIC_TRAKLET_ENABLED=true
```

Widget appears. Done.

**Key principle:** No imports from your app. No auth coupling. No API routes. Perfect isolation.

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

## Anti-Patterns: What NOT to Do

Traklet is designed for **zero host coupling**. These patterns violate that principle and are explicitly rejected:

### ❌ DON'T: Import from your host app

```typescript
// WRONG — Creates tight coupling
import { useAuth } from '@/lib/auth';
import { theme } from '@/config/theme';
import { apiClient } from '@/services/api';

const { user } = useAuth();
Traklet.init({ user: { email: user.email } });
```

**Why:** Breaks when you change auth, requires different code per framework.

**RIGHT:** Use `.traklet/settings.json` for user identity. Traklet manages its own state.

### ❌ DON'T: Read from host auth systems

```typescript
// WRONG — Couples to host's auth implementation
const jwt = localStorage.getItem('auth_token');
const decoded = JSON.parse(atob(jwt.split('.')[1]));
Traklet.init({ user: { email: decoded.email } });
```

**Why:** QA testers may not be app users. Auth changes break Traklet.

**RIGHT:** Let users set identity via widget settings gear, stored in `.traklet/settings.json`.

### ❌ DON'T: Create API proxy routes

```typescript
// WRONG — Defeats the purpose of built-in adapters
// app/api/traklet/route.ts
export async function POST(req: Request) {
  const token = req.headers.get('authorization');
  const res = await fetch('https://api.github.com/...', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}
```

**Why:** Traklet's adapters already do this. You're duplicating work.

**RIGHT:** Pass `token` to `Traklet.init()`. The adapter handles all API calls.

### ❌ DON'T: Hardcode tokens

```typescript
// WRONG — Security vulnerability
Traklet.init({
  token: 'ghp_abc123...'  // DO NOT DO THIS
});
```

**Why:** Tokens leak into version control, build artifacts, browser DevTools.

**RIGHT:** Use environment variables or `.traklet/settings.json`.

### ❌ DON'T: Add dependencies to host package.json

```json
// WRONG — Pollutes host dependencies
{
  "dependencies": {
    "octokit": "^3.0.0",
    "azure-devops-node-api": "^12.0.0"
  }
}
```

**Why:** These are Traklet's internal dependencies, not yours.

**RIGHT:** Only install `traklet`. It bundles everything it needs.

### ✅ DO: Follow the canonical pattern

```tsx
// RIGHT — Complete isolation
export function TrakletDevWidget() {
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_TRAKLET_PAT;
    if (!token) return;

    (async () => {
      const { Traklet } = await import('traklet');
      await Traklet.init({ adapter: 'github', token });
    })();
  }, []);
  return null;
}
```

One component. No host imports. No auth coupling. Perfect.

---

## Framework Integration

For complete, framework-specific integration guides with troubleshooting, see **[INTEGRATION.md](./INTEGRATION.md)**.

Quick reference below:

Traklet is fully self-contained. **No proxy routes, no API middleware, no backend code in your app.** Traklet's built-in adapters handle all communication with GitHub, Azure DevOps, or your REST API directly.

### The Minimal Footprint Promise

Integration = **1 component file + 1 line in layout + 2 env vars**. Nothing else.

To remove Traklet: delete the component, delete the layout line, delete the env vars. Done.

### What You Write vs. What Traklet Handles

| Concern | Your app provides | Traklet handles |
|---------|-------------------|-----------------|
| API calls to GitHub/ADO | **Nothing** | Built-in adapters |
| Issue CRUD, comments, labels | **Nothing** | Adapter layer |
| Widget UI (list, detail, form) | **Nothing** | Shadow DOM components |
| CSS isolation | **Nothing** | Shadow DOM — zero conflicts |
| Offline queue & sync | **Nothing** | IndexedDB operation queue |
| Authentication | PAT token via env var | Sends it with every API call |
| User identity | **Nothing** | `.traklet/settings.json` (per-tester, gitignored) |

### User Identity: Zero Host Coupling

Traklet **never reads from your app's auth system**. User identity comes from `.traklet/settings.json`:

```json
// .traklet/settings.json (gitignored — each tester creates their own)
{
  "user": { "email": "tester@company.com", "name": "Jane Doe" },
  "token": "paste-your-pat-here",
  "adapter": "azure-devops",
  "baseUrl": "https://dev.azure.com/org",
  "project": "my-project"
}
```

**Why not read from the host's auth?**
1. Couples Traklet to your auth system (NextAuth, Clerk, Auth0, etc.)
2. Different integration code per host framework
3. Breaks when you change auth providers
4. QA testers may not be app users
5. `.traklet/settings.json` works identically everywhere — true drop-in

Users set their identity once via the widget settings gear (stored in localStorage + `.traklet/settings.json`). This file is gitignored and never committed.

### Next.js (App Router)

**Total footprint: 1 component + 1 line in layout + 2 env vars**

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
NEXT_PUBLIC_TRAKLET_PAT=your_pat_token_here
NEXT_PUBLIC_TRAKLET_ENABLED=true  # Dev-only guard
```

**3. Create ONE component** — the ONLY file you add:

```tsx
// src/components/TrakletDevWidget.tsx
'use client';

import { useEffect, useRef } from 'react';

export function TrakletDevWidget() {
  const instanceRef = useRef<{ destroy: () => void } | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_TRAKLET_PAT;
    if (!token || process.env.NEXT_PUBLIC_TRAKLET_ENABLED !== 'true' || initRef.current) {
      return;
    }
    initRef.current = true;

    (async () => {
      const { Traklet } = await import('traklet');
      instanceRef.current = await Traklet.init({
        adapter: 'azure-devops',  // or 'github', 'localStorage'
        token,
        baseUrl: process.env.NEXT_PUBLIC_TRAKLET_BASE_URL || 'https://dev.azure.com/org',
        projects: [{ id: 'my-project', name: 'My Project' }],
        position: 'bottom-right',
      });
    })().catch((err) => console.warn('[Traklet] Failed to load:', err));

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
import { TrakletDevWidget } from '@/components/TrakletDevWidget';

// Inside <body>:
<TrakletDevWidget />
```

**That's it.** No imports from your app. No API routes. No proxy. No auth coupling.

**To remove Traklet:**
1. Delete `TrakletDevWidget.tsx`
2. Delete `<TrakletDevWidget />` from layout
3. Delete env vars from `.env.local`

Three deletions. Zero other changes needed.

### React (Vite / CRA)

**Total footprint: 1 component + 1 useEffect + 2 env vars**

```tsx
// App.tsx or index.tsx
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    const token = import.meta.env.VITE_TRAKLET_PAT;
    if (!token || import.meta.env.VITE_TRAKLET_ENABLED !== 'true') return;

    let instance: { destroy: () => void } | null = null;
    (async () => {
      const { Traklet } = await import('traklet');
      instance = await Traklet.init({
        adapter: 'github',
        token,
        projects: [{ id: 'my-repo', name: 'My Repo', identifier: 'owner/repo' }],
      });
    })();
    return () => { instance?.destroy(); };
  }, []);

  return <div>{/* your app */}</div>;
}
```

**Environment variables** (`.env.local`):

```bash
VITE_TRAKLET_PAT=your_pat_token_here
VITE_TRAKLET_ENABLED=true
```

No imports from your app. No auth coupling. No host dependencies.

### Vanilla JavaScript

```html
<script type="module">
  import { Traklet } from './node_modules/traklet/dist/traklet.es.js';

  // NEVER hardcode tokens — use env vars or build-time injection
  const token = window.ENV?.TRAKLET_PAT; // Injected server-side
  
  if (token) {
    await Traklet.init({
      adapter: 'github',
      token,
      projects: [{ id: 'my-repo', name: 'My Repo', identifier: 'owner/repo' }],
    });
  }
</script>
```

For production, inject `window.ENV` via server-side templating or build tool, never commit tokens to source.

### Dev-Only Conditional Loading

Best practice: Only load Traklet in development/staging, never in production.

**Option 1: Environment variable guard (recommended)**

```typescript
// The guard + dynamic import() ensures tree-shaking removes Traklet in production
if (process.env.NEXT_PUBLIC_TRAKLET_ENABLED === 'true') {
  const { Traklet } = await import('traklet');
  await Traklet.init({ /* ... */ });
}
```

**Option 2: Hostname check**

```typescript
const isDev = window.location.hostname === 'localhost'
  || window.location.hostname.includes('staging');

if (isDev) {
  const { Traklet } = await import('traklet');
  await Traklet.init({ /* ... */ });
}
```

The dynamic `import()` is critical — it ensures Traklet is never bundled when the guard prevents execution.

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
