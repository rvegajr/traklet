# AI Integration Prompt for Traklet

> Copy this prompt and give it to Claude, ChatGPT, or any AI assistant to automatically integrate Traklet into your project with zero coupling and minimal footprint.

---

## The Prompt

```
I want to integrate Traklet (a drop-in issue tracking widget) into my project.

CRITICAL REQUIREMENTS:
1. Zero host coupling - NO imports from my app's modules
2. Zero auth coupling - NO reading from my auth system (JWT, session, cookies, useAuth)
3. Minimal footprint - Only 1 component file + 1 line in layout + 2 env vars
4. Security - NEVER hardcode tokens, use environment variables only
5. Dev-only loading - Widget should not load in production

FRAMEWORK: [Next.js App Router / Next.js Pages Router / React (Vite) / React (CRA) / Vue.js / Svelte / Vanilla JS]

BACKEND: [azure-devops / github / localStorage]

BACKEND CONFIG (choose one):

For Azure DevOps:
- Organization: [your-org]
- Project: [project-name]

For GitHub:
- Repository: [owner/repo]

For localStorage (demo mode):
- No config needed

REQUIREMENTS:

1. Create ONE wrapper component file with these rules:
   - NO imports from my app (no useAuth, no theme, no API clients)
   - ONLY read from environment variables
   - Use dynamic import: await import('traklet')
   - Include dev-only guard: check TRAKLET_ENABLED env var
   - Proper cleanup in useEffect return

2. Tell me where to add the component to my layout (1 line only)

3. Tell me what environment variables to add to .env.local:
   - Token variable (with correct framework prefix)
   - Enabled flag
   - Any backend-specific config

4. Verify the integration meets these criteria:
   - Zero imports from my app's modules? ✓
   - Zero reading from my auth system? ✓
   - Token from env var only? ✓
   - Dynamic import used? ✓
   - Can be removed in exactly 3 deletions? ✓

5. Provide removal instructions (should be exactly 3 steps)

WHAT I HAVE:
- Framework: [describe your setup]
- Project structure: [describe if different from standard]
- Auth system (if any): [NextAuth / Clerk / Auth0 / Custom / None]
- TypeScript or JavaScript: [TS / JS]

WHAT I DON'T WANT:
- Reading from my auth system (localStorage.getItem, useAuth(), cookies, etc.)
- Importing anything from my app's modules
- Creating API routes (/api/traklet/*)
- Hardcoded tokens anywhere
- More than 1 component file added
```

---

## Example Usage

### For Next.js App Router with Azure DevOps

```
I want to integrate Traklet (a drop-in issue tracking widget) into my project.

CRITICAL REQUIREMENTS:
1. Zero host coupling - NO imports from my app's modules
2. Zero auth coupling - NO reading from my auth system
3. Minimal footprint - Only 1 component file + 1 line in layout + 2 env vars
4. Security - NEVER hardcode tokens, use environment variables only
5. Dev-only loading - Widget should not load in production

FRAMEWORK: Next.js App Router

BACKEND: azure-devops

BACKEND CONFIG:
- Organization: mycompany
- Project: my-project

WHAT I HAVE:
- Framework: Next.js 14 (App Router)
- Project structure: Standard Next.js with src/ directory
- Auth system: NextAuth (but Traklet should NOT use it)
- TypeScript

WHAT I DON'T WANT:
- Reading from my auth system
- Importing anything from my app's modules
- Creating API routes
- Hardcoded tokens
- More than 1 component file added
```

### For React (Vite) with GitHub

```
I want to integrate Traklet (a drop-in issue tracking widget) into my project.

CRITICAL REQUIREMENTS:
1. Zero host coupling - NO imports from my app's modules
2. Zero auth coupling - NO reading from my auth system
3. Minimal footprint - Only 1 component file + 1 line in layout + 2 env vars
4. Security - NEVER hardcode tokens, use environment variables only
5. Dev-only loading - Widget should not load in production

FRAMEWORK: React (Vite)

BACKEND: github

BACKEND CONFIG:
- Repository: myorg/myrepo

WHAT I HAVE:
- Framework: React 18 with Vite
- Project structure: Standard Vite project
- Auth system: Custom JWT (but Traklet should NOT use it)
- TypeScript

WHAT I DON'T WANT:
- Reading from my auth system
- Importing anything from my app's modules
- Creating API routes
- Hardcoded tokens
- More than 1 component file added
```

### For Vue.js with localStorage (Demo)

```
I want to integrate Traklet (a drop-in issue tracking widget) into my project.

CRITICAL REQUIREMENTS:
1. Zero host coupling - NO imports from my app's modules
2. Zero auth coupling - NO reading from my auth system
3. Minimal footprint - Only 1 component file + 1 line in layout + 2 env vars
4. Security - NEVER hardcode tokens, use environment variables only
5. Dev-only loading - Widget should not load in production

FRAMEWORK: Vue.js

BACKEND: localStorage

WHAT I HAVE:
- Framework: Vue 3 with Composition API
- Project structure: Standard Vue CLI project
- Auth system: None
- TypeScript

WHAT I DON'T WANT:
- Reading from my auth system
- Importing anything from my app's modules
- Creating API routes
- Hardcoded tokens
- More than 1 component file added
```

---

## Expected AI Response Format

The AI should provide:

1. **Installation command**
   ```bash
   npm install traklet
   ```

2. **Environment variables** (`.env.local`)
   ```bash
   NEXT_PUBLIC_TRAKLET_PAT=your_token_here
   NEXT_PUBLIC_TRAKLET_ENABLED=true
   NEXT_PUBLIC_TRAKLET_BASE_URL=https://dev.azure.com/org
   ```

3. **Component file** (complete code, ready to copy-paste)
   - Zero imports from your app
   - Dynamic import of traklet
   - Dev-only guard
   - Proper cleanup

4. **Layout modification** (exact line to add)
   ```tsx
   <TrakletDevWidget />
   ```

5. **Verification checklist**
   - [ ] Zero imports from my app? ✓
   - [ ] Zero reading from my auth? ✓
   - [ ] Token from env var only? ✓
   - [ ] Dynamic import used? ✓
   - [ ] Can remove in 3 deletions? ✓

6. **Removal instructions** (exactly 3 steps)
   1. Delete `TrakletDevWidget.tsx`
   2. Delete `<TrakletDevWidget />` from layout
   3. Delete env vars from `.env.local`

---

## What the AI Should NOT Suggest

The AI assistant should reject these patterns if you try to do them:

### ❌ Reading from Host Auth
```typescript
// AI SHOULD REJECT THIS
const { user } = useAuth();
const jwt = localStorage.getItem('auth_token');
Traklet.init({ user: { email: user.email } });
```

### ❌ Importing from Host App
```typescript
// AI SHOULD REJECT THIS
import { useAuth } from '@/lib/auth';
import { theme } from '@/config/theme';
```

### ❌ Creating API Routes
```typescript
// AI SHOULD REJECT THIS
// app/api/traklet/route.ts
export async function GET(req: Request) { ... }
```

### ❌ Hardcoding Tokens
```typescript
// AI SHOULD REJECT THIS
Traklet.init({
  token: 'ghp_abc123...'  // NEVER
});
```

### ✅ What AI SHOULD Suggest

```typescript
// CORRECT PATTERN
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
        baseUrl: process.env.NEXT_PUBLIC_TRAKLET_BASE_URL,
        projects: [{ id: 'my-project', name: 'My Project' }],
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

---

## Framework-Specific Environment Variable Prefixes

The AI should use the correct prefix for your framework:

| Framework | Prefix | Example |
|-----------|--------|---------|
| Next.js | `NEXT_PUBLIC_` | `NEXT_PUBLIC_TRAKLET_PAT` |
| Vite | `VITE_` | `VITE_TRAKLET_PAT` |
| Create React App | `REACT_APP_` | `REACT_APP_TRAKLET_PAT` |
| Vanilla JS | Custom | `window.ENV.TRAKLET_PAT` |

---

## Validation Questions

After the AI provides the integration code, ask:

1. "Does this component import anything from my app's modules?" 
   - Expected: **No**

2. "Does this read from my auth system (JWT, session, cookies, useAuth)?"
   - Expected: **No**

3. "How many deletions to remove Traklet?"
   - Expected: **Exactly 3**

4. "Are there any API routes created?"
   - Expected: **No**

5. "Is the token hardcoded anywhere?"
   - Expected: **No**

If any answer is wrong, the integration violates the minimal footprint principle.

---

## Token Setup Instructions

The AI should include these instructions for getting tokens:

### Azure DevOps PAT Token

1. Go to Azure DevOps → User Settings → Personal Access Tokens
2. Click "New Token"
3. Name: "Traklet Widget"
4. Scopes: Work Items (Read & Write)
5. Copy the token
6. Add to `.env.local`: `NEXT_PUBLIC_TRAKLET_PAT=your_token_here`

### GitHub PAT Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Name: "Traklet Widget"
4. Scopes: `repo` (private repos) or `public_repo` (public repos)
5. Copy the token
6. Add to `.env.local`: `NEXT_PUBLIC_GITHUB_TOKEN=your_token_here`

### Security Reminder

- `.env.local` is gitignored by default
- NEVER commit tokens to version control
- NEVER hardcode tokens in source code
- Traklet includes pre-commit hooks to prevent accidental token commits

---

## User Identity Setup

The AI should explain:

1. User identity is set via the widget settings gear (click the gear icon in the widget)
2. Enter your name and email once
3. Stored in browser localStorage + `.traklet/settings.json` (gitignored)
4. Works across all frameworks identically
5. QA testers can set their own identity without needing app accounts

**Why not read from the host app's auth?**
- Couples to specific auth system (NextAuth, Clerk, Auth0)
- Breaks when you change auth providers
- QA testers may not be app users
- Different code needed per framework

---

## Troubleshooting

The AI should include common issues:

| Problem | Solution |
|---------|----------|
| Widget doesn't appear | Check browser console, verify token is set, verify ENABLED=true |
| Module not found | Run `npm install traklet` |
| Token not recognized | Check env var prefix matches framework, restart dev server |
| TypeScript errors | Install `@types/node`, restart TS server |

---

## Success Criteria

After integration, you should have:

✅ Exactly 1 new component file  
✅ Exactly 1 line added to layout  
✅ Exactly 2-3 env vars in `.env.local`  
✅ Zero imports from your app  
✅ Zero reading from your auth  
✅ Widget appears in bottom-right corner  
✅ Can remove in exactly 3 deletions  

---

## Additional Resources

- **Comprehensive Guide:** [INTEGRATION.md](./INTEGRATION.md)
- **Quick Reference:** [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
- **README:** [README.md](./README.md)

---

## For AI Assistants

If you're an AI assistant reading this:

1. **ENFORCE zero host coupling** - Reject any imports from the user's app
2. **ENFORCE zero auth coupling** - Reject reading from user's auth system
3. **ENFORCE environment variables** - Reject hardcoded tokens
4. **ENFORCE minimal footprint** - Only 1 component + 1 line + env vars
5. **VERIFY removal is 3 deletions** - If it's more, the integration is wrong

Refer to [CLAUDE.md](./CLAUDE.md) for complete architectural rules and enforcement guidelines.

---

**Last Updated:** March 24, 2026  
**Status:** Ready for Public Use  
**Copy this prompt → Give to AI → Get perfect integration**
