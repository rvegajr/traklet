# Traklet Integration Guide

> **The canonical reference for integrating Traklet with zero host coupling**

## Table of Contents

- [Core Principles](#core-principles)
- [The Minimal Footprint Promise](#the-minimal-footprint-promise)
- [Framework-Specific Guides](#framework-specific-guides)
  - [Next.js (App Router)](#nextjs-app-router)
  - [Next.js (Pages Router)](#nextjs-pages-router)
  - [React (Vite)](#react-vite)
  - [React (Create React App)](#react-create-react-app)
  - [Vue.js](#vuejs)
  - [Svelte](#svelte)
  - [Vanilla JavaScript](#vanilla-javascript)
- [Backend Configuration](#backend-configuration)
- [User Identity Management](#user-identity-management)
- [Environment Variables](#environment-variables)
- [Dev-Only Loading](#dev-only-loading)
- [Anti-Patterns](#anti-patterns)
- [Troubleshooting](#troubleshooting)

---

## Core Principles

Traklet is designed with **absolute zero coupling** to your host application:

1. **No host imports** — Never import from your app's modules
2. **No auth coupling** — Never read from host auth systems (JWT, session, cookies)
3. **No API routes** — Built-in adapters handle all backend communication
4. **Shadow DOM isolation** — Zero CSS conflicts or leaks
5. **Self-contained** — All dependencies bundled, no host pollution

### Integration Footprint

**Total additions to your codebase:**
- ✅ 1 wrapper component file
- ✅ 1 line in your layout
- ✅ 2 environment variables

**Total deletions to remove Traklet:**
- ❌ Delete wrapper component
- ❌ Delete layout line
- ❌ Delete env vars

If removal requires more than 3 deletions, the integration is wrong.

---

## The Minimal Footprint Promise

### What You Write

```typescript
// TrakletDevWidget.tsx - THE ONLY FILE YOU ADD
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
        adapter: 'azure-devops',
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

  return null;
}
```

### What Traklet Handles

| Concern | Your App | Traklet |
|---------|----------|---------|
| Backend API calls | Nothing | Built-in adapters |
| Issue CRUD operations | Nothing | Adapter layer |
| Widget UI | Nothing | Shadow DOM components |
| CSS isolation | Nothing | Shadow DOM |
| Offline queue & sync | Nothing | IndexedDB |
| User identity | Nothing | `.traklet/settings.json` |
| Authentication | Provide PAT token | Sends with every request |

---

## Framework-Specific Guides

### Next.js (App Router)

**Project structure:**
```
your-app/
├── src/
│   ├── app/
│   │   └── layout.tsx          # Add <TrakletDevWidget />
│   └── components/
│       └── TrakletDevWidget.tsx  # THE ONLY FILE YOU ADD
├── .env.local                   # Add 2 env vars (gitignored)
└── package.json                 # Add traklet dependency
```

**Step 1: Install**

```bash
npm install traklet
```

**Step 2: Add environment variables**

Create or edit `.env.local`:

```bash
NEXT_PUBLIC_TRAKLET_PAT=your_personal_access_token_here
NEXT_PUBLIC_TRAKLET_ENABLED=true
```

**Step 3: Create wrapper component**

```tsx
// src/components/TrakletDevWidget.tsx
'use client';

import { useEffect, useRef } from 'react';

export function TrakletDevWidget() {
  const instanceRef = useRef<{ destroy: () => void } | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_TRAKLET_PAT;
    const enabled = process.env.NEXT_PUBLIC_TRAKLET_ENABLED === 'true';
    
    if (!token || !enabled || initRef.current) {
      return;
    }
    
    initRef.current = true;

    (async () => {
      const { Traklet } = await import('traklet');
      
      instanceRef.current = await Traklet.init({
        adapter: 'azure-devops',  // or 'github', 'localStorage'
        token,
        baseUrl: process.env.NEXT_PUBLIC_TRAKLET_BASE_URL || 'https://dev.azure.com/org',
        projects: [{ 
          id: 'my-project', 
          name: 'My Project',
          identifier: 'my-project'
        }],
        position: 'bottom-right',
      });
    })().catch((err) => {
      console.warn('[Traklet] Failed to initialize:', err);
    });

    return () => {
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
      initRef.current = false;
    };
  }, []);

  return null; // Traklet mounts its own Shadow DOM
}
```

**Step 4: Add to layout**

```tsx
// src/app/layout.tsx
import { TrakletDevWidget } from '@/components/TrakletDevWidget';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <TrakletDevWidget />
      </body>
    </html>
  );
}
```

**If using npm link (local development):**

```js
// next.config.js
module.exports = {
  transpilePackages: ['traklet'],
  webpack: (config) => {
    config.resolve.symlinks = false;
    return config;
  },
};
```

---

### Next.js (Pages Router)

**Step 1-2:** Same as App Router

**Step 3: Create wrapper component** (same as App Router)

**Step 4: Add to _app.tsx**

```tsx
// src/pages/_app.tsx
import type { AppProps } from 'next/app';
import { TrakletDevWidget } from '@/components/TrakletDevWidget';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <TrakletDevWidget />
    </>
  );
}
```

---

### React (Vite)

**Step 1: Install**

```bash
npm install traklet
```

**Step 2: Add environment variables**

Create `.env.local`:

```bash
VITE_TRAKLET_PAT=your_personal_access_token_here
VITE_TRAKLET_ENABLED=true
```

**Step 3: Initialize in App.tsx**

```tsx
// src/App.tsx
import { useEffect, useRef } from 'react';

function App() {
  const instanceRef = useRef<{ destroy: () => void } | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    const token = import.meta.env.VITE_TRAKLET_PAT;
    const enabled = import.meta.env.VITE_TRAKLET_ENABLED === 'true';

    if (!token || !enabled || initRef.current) {
      return;
    }
    
    initRef.current = true;

    (async () => {
      const { Traklet } = await import('traklet');
      
      instanceRef.current = await Traklet.init({
        adapter: 'github',
        token,
        projects: [{ 
          id: 'owner/repo', 
          name: 'My Repo',
          identifier: 'owner/repo'
        }],
      });
    })().catch((err) => {
      console.warn('[Traklet] Failed to initialize:', err);
    });

    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
      initRef.current = false;
    };
  }, []);

  return (
    <div className="App">
      {/* Your app content */}
    </div>
  );
}

export default App;
```

---

### React (Create React App)

Same as Vite, but use `process.env` instead of `import.meta.env`:

```tsx
// src/App.tsx
const token = process.env.REACT_APP_TRAKLET_PAT;
const enabled = process.env.REACT_APP_TRAKLET_ENABLED === 'true';
```

Environment variables in `.env.local`:

```bash
REACT_APP_TRAKLET_PAT=your_token_here
REACT_APP_TRAKLET_ENABLED=true
```

---

### Vue.js

**Step 1: Install**

```bash
npm install traklet
```

**Step 2: Add environment variables**

```bash
# .env.local
VITE_TRAKLET_PAT=your_token_here
VITE_TRAKLET_ENABLED=true
```

**Step 3: Initialize in App.vue**

```vue
<!-- src/App.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

let trakletInstance: { destroy: () => void } | null = null;

onMounted(async () => {
  const token = import.meta.env.VITE_TRAKLET_PAT;
  const enabled = import.meta.env.VITE_TRAKLET_ENABLED === 'true';
  
  if (!token || !enabled) return;

  try {
    const { Traklet } = await import('traklet');
    trakletInstance = await Traklet.init({
      adapter: 'github',
      token,
      projects: [{ id: 'owner/repo', name: 'My Repo' }],
    });
  } catch (err) {
    console.warn('[Traklet] Failed to initialize:', err);
  }
});

onUnmounted(() => {
  if (trakletInstance) {
    trakletInstance.destroy();
    trakletInstance = null;
  }
});
</script>

<template>
  <div id="app">
    <!-- Your app content -->
  </div>
</template>
```

---

### Svelte

**Step 1: Install**

```bash
npm install traklet
```

**Step 2: Add environment variables**

```bash
# .env.local
VITE_TRAKLET_PAT=your_token_here
VITE_TRAKLET_ENABLED=true
```

**Step 3: Initialize in App.svelte**

```svelte
<!-- src/App.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let trakletInstance: { destroy: () => void } | null = null;

  onMount(async () => {
    const token = import.meta.env.VITE_TRAKLET_PAT;
    const enabled = import.meta.env.VITE_TRAKLET_ENABLED === 'true';
    
    if (!token || !enabled) return;

    try {
      const { Traklet } = await import('traklet');
      trakletInstance = await Traklet.init({
        adapter: 'github',
        token,
        projects: [{ id: 'owner/repo', name: 'My Repo' }],
      });
    } catch (err) {
      console.warn('[Traklet] Failed to initialize:', err);
    }
  });

  onDestroy(() => {
    if (trakletInstance) {
      trakletInstance.destroy();
      trakletInstance = null;
    }
  });
</script>

<div>
  <!-- Your app content -->
</div>
```

---

### Vanilla JavaScript

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My App</title>
</head>
<body>
  <div id="app">
    <!-- Your app content -->
  </div>

  <script type="module">
    // Load token from server-side injection (NEVER hardcode)
    const token = window.ENV?.TRAKLET_PAT; // Injected via template
    const enabled = window.ENV?.TRAKLET_ENABLED === 'true';

    if (token && enabled) {
      const { Traklet } = await import('./node_modules/traklet/dist/traklet.es.js');
      
      await Traklet.init({
        adapter: 'github',
        token,
        projects: [{ id: 'owner/repo', name: 'My Repo' }],
      });
    }
  </script>
</body>
</html>
```

For production, inject `window.ENV` server-side:

```php
<!-- PHP example -->
<script>
  window.ENV = {
    TRAKLET_PAT: <?= json_encode($_ENV['TRAKLET_PAT']) ?>,
    TRAKLET_ENABLED: <?= json_encode($_ENV['TRAKLET_ENABLED']) ?>
  };
</script>
```

---

## Backend Configuration

### Azure DevOps

```typescript
await Traklet.init({
  adapter: 'azure-devops',
  token: process.env.NEXT_PUBLIC_TRAKLET_PAT,
  baseUrl: 'https://dev.azure.com/your-org',
  projects: [
    { 
      id: 'project-name',
      name: 'Display Name',
      identifier: 'project-name'
    }
  ],
});
```

**Required token scopes:** Work Items (Read & Write)

### GitHub Issues

```typescript
await Traklet.init({
  adapter: 'github',
  token: process.env.NEXT_PUBLIC_GITHUB_TOKEN,
  projects: [
    { 
      id: 'owner/repo',
      name: 'My Repo',
      identifier: 'owner/repo'
    }
  ],
});
```

**Required token scopes:** `repo` (private) or `public_repo` (public)

### Generic REST API

```typescript
await Traklet.init({
  adapter: 'rest',
  token: process.env.NEXT_PUBLIC_API_TOKEN,
  baseUrl: 'https://api.example.com',
  projects: [
    { id: 'project-1', name: 'Project One' }
  ],
});
```

### Local Storage (Offline Demo)

```typescript
await Traklet.init({
  adapter: 'localStorage',
  projects: [
    { id: 'demo-project', name: 'Demo Project' }
  ],
});
```

---

## User Identity Management

### The Zero-Coupling Approach

Traklet **never reads from your host app's auth system**. User identity comes from `.traklet/settings.json`:

```json
{
  "user": {
    "email": "tester@company.com",
    "name": "Jane Doe"
  },
  "token": "your-pat-token-here",
  "adapter": "azure-devops",
  "baseUrl": "https://dev.azure.com/org",
  "project": "my-project"
}
```

### Why This Approach?

| Host Auth Integration | `.traklet/settings.json` |
|-----------------------|--------------------------|
| Couples to NextAuth, Clerk, Auth0, etc. | Works with any framework |
| Breaks when auth changes | Independent of host auth |
| Different code per framework | Same code everywhere |
| QA testers must be app users | Anyone can test |
| Complex to implement | Zero implementation |

### How Users Set Identity

1. Click the settings gear icon in the widget
2. Enter name and email
3. Stored in localStorage + `.traklet/settings.json` (gitignored)
4. Done — works across sessions

### For Shared UAT Environments

Use a service account token via environment variable:

```bash
NEXT_PUBLIC_TRAKLET_PAT=service_account_token_here
```

Each tester identifies themselves via the widget settings. The token provides access; the name/email provides attribution.

---

## Environment Variables

### Security: NEVER Hardcode Tokens

```typescript
// ❌ WRONG — Security vulnerability
await Traklet.init({
  token: 'ghp_abc123xyz...'  // DO NOT DO THIS
});

// ✅ RIGHT — Use environment variables
await Traklet.init({
  token: process.env.NEXT_PUBLIC_TRAKLET_PAT
});
```

### Framework-Specific Variable Names

| Framework | Prefix | Example |
|-----------|--------|---------|
| Next.js | `NEXT_PUBLIC_` | `NEXT_PUBLIC_TRAKLET_PAT` |
| Vite | `VITE_` | `VITE_TRAKLET_PAT` |
| CRA | `REACT_APP_` | `REACT_APP_TRAKLET_PAT` |
| Vanilla | Custom | `window.ENV.TRAKLET_PAT` |

### Environment Files

Always use `.env.local` for local development:

```bash
# .env.local (NEVER COMMIT THIS FILE)
NEXT_PUBLIC_TRAKLET_PAT=your_token_here
NEXT_PUBLIC_TRAKLET_ENABLED=true
NEXT_PUBLIC_TRAKLET_BASE_URL=https://dev.azure.com/org
```

Ensure `.env.local` is in `.gitignore`:

```gitignore
# .gitignore
.env.local
.traklet/settings.json
```

### Built-in Safeguards

Traklet includes multiple layers of token protection:

1. **`.gitignore`** — `.traklet/settings.json` excluded by default
2. **Pre-commit hook** — Blocks accidental commits of settings.json
3. **Runtime warning** — Console warning if token appears hardcoded
4. **Auto-setup** — `npm install` configures git hooks via `prepare` script

---

## Dev-Only Loading

**Best practice:** Never load Traklet in production.

### Option 1: Environment Variable Guard (Recommended)

```typescript
useEffect(() => {
  // Guard ensures tree-shaking removes Traklet in production builds
  if (process.env.NEXT_PUBLIC_TRAKLET_ENABLED !== 'true') {
    return;
  }

  // Dynamic import ensures Traklet is never bundled when disabled
  (async () => {
    const { Traklet } = await import('traklet');
    await Traklet.init({ /* ... */ });
  })();
}, []);
```

### Option 2: Hostname Check

```typescript
useEffect(() => {
  const isDev = window.location.hostname === 'localhost'
    || window.location.hostname.includes('staging')
    || window.location.hostname.includes('uat');

  if (!isDev) {
    return;
  }

  (async () => {
    const { Traklet } = await import('traklet');
    await Traklet.init({ /* ... */ });
  })();
}, []);
```

### Option 3: NODE_ENV Check

```typescript
useEffect(() => {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  (async () => {
    const { Traklet } = await import('traklet');
    await Traklet.init({ /* ... */ });
  })();
}, []);
```

**Critical:** Always use `await import('traklet')` (dynamic import), not `import { Traklet } from 'traklet'` (static import). Static imports prevent tree-shaking.

---

## Anti-Patterns

### ❌ DON'T: Import from Host App

```typescript
// WRONG — Creates tight coupling
import { useAuth } from '@/lib/auth';
import { theme } from '@/config/theme';
import { apiClient } from '@/services/api';

const { user } = useAuth();
await Traklet.init({ 
  user: { email: user.email }  // NO!
});
```

**Why:** Couples Traklet to your app's structure. Breaks when you refactor.

**RIGHT:** Let Traklet manage its own state via `.traklet/settings.json`.

---

### ❌ DON'T: Read from Host Auth

```typescript
// WRONG — Couples to host auth implementation
const jwt = localStorage.getItem('auth_token');
const decoded = JSON.parse(atob(jwt.split('.')[1]));

await Traklet.init({
  user: { email: decoded.email }  // NO!
});
```

**Why:** QA testers may not have app accounts. Auth changes break Traklet.

**RIGHT:** Users set identity via widget settings (stored in localStorage).

---

### ❌ DON'T: Create API Proxy Routes

```typescript
// WRONG — Defeats built-in adapters
// app/api/traklet/issues/route.ts
export async function GET(req: Request) {
  const token = req.headers.get('authorization');
  const res = await fetch('https://api.github.com/repos/owner/repo/issues', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}
```

**Why:** Traklet's adapters already do this. You're duplicating work and adding complexity.

**RIGHT:** Pass token to `Traklet.init()`. The adapter handles all API calls directly.

---

### ❌ DON'T: Hardcode Tokens

```typescript
// WRONG — Major security vulnerability
await Traklet.init({
  token: 'ghp_abc123xyz456...'  // NO NO NO!
});
```

**Why:** Tokens leak into git history, build artifacts, browser DevTools.

**RIGHT:** Always use environment variables or `.traklet/settings.json`.

---

### ❌ DON'T: Pollute Host Dependencies

```json
// WRONG — package.json of your host app
{
  "dependencies": {
    "octokit": "^3.0.0",
    "azure-devops-node-api": "^12.0.0"
  }
}
```

**Why:** These are Traklet's internal dependencies, not yours.

**RIGHT:** Only install `traklet`. It bundles everything it needs.

---

### ✅ DO: Follow the Canonical Pattern

```typescript
// RIGHT — Perfect isolation
export function TrakletDevWidget() {
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_TRAKLET_PAT;
    if (!token) return;

    (async () => {
      const { Traklet } = await import('traklet');
      await Traklet.init({ 
        adapter: 'github',
        token 
      });
    })();
  }, []);
  
  return null;
}
```

One component. No host imports. No auth coupling. Perfect.

---

## Troubleshooting

### Widget Doesn't Appear

**Check:**
1. Environment variable is set: `echo $NEXT_PUBLIC_TRAKLET_PAT`
2. Dev guard is enabled: `NEXT_PUBLIC_TRAKLET_ENABLED=true`
3. Browser console for errors
4. Token has correct scopes

### "Module not found: traklet"

**Solution:**
```bash
npm install traklet
# or
npm link traklet  # for local development
```

If using `npm link`, add to framework config:
```js
// next.config.js
transpilePackages: ['traklet']
```

### Token Not Recognized

**Check:**
1. Environment variable prefix matches framework (e.g., `NEXT_PUBLIC_` for Next.js)
2. `.env.local` is in project root
3. Restarted dev server after adding env vars
4. Token hasn't expired

### TypeScript Errors

**Solution:**
```bash
npm install --save-dev @types/node
```

Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "types": ["node"]
  }
}
```

### CSS Conflicts

This should never happen (Shadow DOM isolation). If you see CSS leaking:

1. Verify Traklet is using Shadow DOM: inspect element, should see `#shadow-root`
2. Check for global `!important` overrides in your app
3. Report issue — this violates core design principle

---

## Summary: The Integration Checklist

- [ ] Install `traklet` via npm
- [ ] Add 2 env vars to `.env.local` (token + enabled flag)
- [ ] Create ONE wrapper component (no imports from host app)
- [ ] Add wrapper to layout (one line)
- [ ] Verify widget appears (bottom-right corner)
- [ ] Click settings gear to configure user identity
- [ ] Test: Delete 3 things (component, layout line, env vars) — widget gone

**If any step requires more than this, stop and review this guide.**

---

**Last Updated:** March 2026  
**Status:** Canonical Integration Reference
