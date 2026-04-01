# 🤖 Auto-Integrate Traklet with AI

## Copy This → Give to Any AI Assistant → Get Perfect Integration

```
Integrate Traklet (https://github.com/rvegajr/traklet) into my project.

CRITICAL: Follow zero-coupling pattern:
- NO imports from my app's modules
- NO reading from my auth system (JWT/session/cookies)
- Only 1 component + 1 line in layout + 2 env vars
- Token from environment variables ONLY
- Dev-only loading (not in production)

My Setup:
- Framework: [Next.js App Router / React Vite / Vue.js / etc.]
- Backend: [azure-devops / github / localStorage]
- Config: [org/project or owner/repo]

Generate code following the canonical pattern from:
https://github.com/rvegajr/traklet/blob/main/AI_INTEGRATION_PROMPT.md

Verify:
- Zero host imports? ✓
- Zero auth coupling? ✓
- Can remove in 3 deletions? ✓
```

## That's It!

The AI will generate:
1. Complete component code (ready to copy-paste)
2. Environment variables to add
3. Exact line to add to your layout
4. Verification checklist
5. Removal instructions (3 steps)

## Example Output

**Component created:**
```typescript
// src/components/TrakletDevWidget.tsx
'use client';
import { useEffect, useRef } from 'react';

export function TrakletDevWidget() {
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_TRAKLET_PAT;
    if (!token || process.env.NEXT_PUBLIC_TRAKLET_ENABLED !== 'true') return;

    (async () => {
      const { Traklet } = await import('traklet');
      await Traklet.init({
        adapter: 'azure-devops',
        token,
        baseUrl: 'https://dev.azure.com/org',
        projects: [{ id: 'my-project', name: 'My Project' }],
      });
    })();
  }, []);
  return null;
}
```

**Add to `.env.local`:**
```bash
NEXT_PUBLIC_TRAKLET_PAT=your_token_here
NEXT_PUBLIC_TRAKLET_ENABLED=true
```

**Add to layout:**
```tsx
<TrakletDevWidget />  // ← One line
```

**Done!** Widget appears in bottom-right corner.

## Why This Works

- **Zero coupling** - No dependencies on your app's code
- **Framework agnostic** - Same pattern for Next.js, React, Vue, Svelte
- **Secure** - Environment variables only, never hardcoded
- **Minimal** - 1 file + 1 line + 2 env vars
- **Removable** - Delete 3 things, widget gone

## Frameworks Supported

✅ Next.js (App Router & Pages Router)  
✅ React (Vite, CRA)  
✅ Vue.js  
✅ Svelte  
✅ Vanilla JavaScript  
✅ Any JavaScript framework

## Backends Supported

✅ Azure DevOps Work Items  
✅ GitHub Issues  
✅ Generic REST APIs  
✅ localStorage (demo mode)  

## Get Started

1. Copy the prompt above
2. Replace `[Your framework]` with your actual framework
3. Replace `[azure-devops / github]` with your backend
4. Give to Claude, ChatGPT, or any AI assistant
5. Copy-paste the generated code
6. Widget appears!

**Total time: ~2 minutes**

---

**Full documentation:** https://github.com/rvegajr/traklet  
**Detailed AI prompt:** [AI_INTEGRATION_PROMPT.md](./AI_INTEGRATION_PROMPT.md)  
**Integration guide:** [INTEGRATION.md](./INTEGRATION.md)  
**Quick reference:** [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)

---

**Share this:** `https://github.com/rvegajr/traklet/blob/main/AI_INTEGRATION_ONEPAGER.md`
