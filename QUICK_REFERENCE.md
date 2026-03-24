# Traklet Integration Quick Reference Card

## The Golden Rule
**Integration = 1 component + 1 line + 2 env vars**  
**Removal = 3 deletions**

---

## Step 1: Install (10 seconds)
```bash
npm install traklet
```

---

## Step 2: Environment Variables (30 seconds)
```bash
# .env.local (NEVER COMMIT THIS FILE)
NEXT_PUBLIC_TRAKLET_PAT=your_token_here
NEXT_PUBLIC_TRAKLET_ENABLED=true
```

Replace `NEXT_PUBLIC_` with your framework's prefix:
- **Next.js:** `NEXT_PUBLIC_`
- **Vite:** `VITE_`
- **CRA:** `REACT_APP_`

---

## Step 3: Create Component (2 minutes)

```typescript
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
        baseUrl: 'https://dev.azure.com/org',
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

## Step 4: Add to Layout (1 line)

```tsx
// src/app/layout.tsx
import { TrakletDevWidget } from '@/components/TrakletDevWidget';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <TrakletDevWidget />  {/* ← ADD THIS LINE */}
      </body>
    </html>
  );
}
```

---

## Backend Adapters

### Azure DevOps
```typescript
adapter: 'azure-devops',
token: process.env.NEXT_PUBLIC_TRAKLET_PAT,
baseUrl: 'https://dev.azure.com/your-org',
projects: [{ id: 'project-name', name: 'Display Name' }]
```

### GitHub
```typescript
adapter: 'github',
token: process.env.NEXT_PUBLIC_GITHUB_TOKEN,
projects: [{ id: 'owner/repo', name: 'My Repo' }]
```

### localStorage (Demo)
```typescript
adapter: 'localStorage',
projects: [{ id: 'demo', name: 'Demo Project' }]
```

---

## ✅ DO

- ✅ Use environment variables for tokens
- ✅ Dynamic import: `await import('traklet')`
- ✅ Dev-only guard: `TRAKLET_ENABLED !== 'true'`
- ✅ One component, zero host imports

---

## ❌ DON'T

- ❌ `import { useAuth } from '@/lib/auth'` (no host imports)
- ❌ `localStorage.getItem('auth_token')` (no host auth)
- ❌ `token: 'ghp_abc123...'` (no hardcoded tokens)
- ❌ Creating `/api/traklet/*` routes (built-in adapters)

---

## Verification Checklist

- [ ] Component has ZERO imports from host app
- [ ] Token comes from env var only
- [ ] Dynamic import used: `await import('traklet')`
- [ ] Widget appears in bottom-right corner
- [ ] Settings gear works (click to set user identity)

---

## Removal Test

**Can you remove Traklet in 3 deletions?**

1. Delete `TrakletDevWidget.tsx`
2. Delete `<TrakletDevWidget />` from layout
3. Delete env vars from `.env.local`

If you need more than 3 deletions, the integration is wrong.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Widget doesn't appear | Check console for errors, verify token is set |
| Module not found | Run `npm install traklet` |
| Token not recognized | Check env var prefix matches framework |
| TypeScript errors | Add `@types/node`, restart TS server |

---

## User Identity

Users set their identity via widget settings gear (stored in localStorage + `.traklet/settings.json`).

**Why not read from host auth?**
- Works with any framework
- QA testers don't need app accounts
- Doesn't break when auth changes
- True drop-in behavior

---

## Security

**Token management:**
- Environment variables: ✅
- `.traklet/settings.json`: ✅ (gitignored)
- Hardcoded in source: ❌ (NEVER)
- Committed to git: ❌ (pre-commit hook blocks this)

---

## Need More Help?

📖 **README.md** - Overview + Quick Start  
📚 **INTEGRATION.md** - Comprehensive framework guides  
🤖 **CLAUDE.md** - Architectural principles

---

**Total Integration Time: ~5 minutes**  
**Lines of Code Added: ~40**  
**Host Coupling: ZERO**

---

**Last Updated:** March 24, 2026  
**Print this card and keep it handy during integration!**
