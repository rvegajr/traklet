# Traklet Integration Standard

> **The single authoritative standard for putting Traklet in a project.**
> `QUICK_REFERENCE.md` is the printable card and `INTEGRATION.md` has framework
> specifics — this document is the canonical *policy*. If anything conflicts,
> this wins.

## The golden rule

- **Integration** = 1 gated component + 1 line in the layout + 2 env vars.
- **Removal** = 3 deletions.
- **Three non-negotiables:** (1) **DEV/UAT only**, (2) **one tracker + environment labels**, (3) **fine-grained token, never on prod**.

---

## 1. The gated widget (the only file you add)

Zero host coupling — no imports from the app, no reading host auth, only env vars, dynamic import.

```tsx
'use client';
import { useEffect, useRef } from 'react';

export function TrakletDevWidget() {
  const instanceRef = useRef<{ destroy(): void } | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_TRAKLET_PAT;
    const enabled = process.env.NEXT_PUBLIC_TRAKLET_ENABLED === 'true';
    if (!enabled || !token || initRef.current) return; // OFF unless explicitly enabled + token present
    initRef.current = true;

    let cancelled = false;
    import('traklet')
      .then(async ({ Traklet }) => {
        if (cancelled) return;
        instanceRef.current = await Traklet.init({
          adapter: 'github',                 // or 'azure-devops'
          token,
          projects: [{ id: 'owner/repo', name: 'My Project', identifier: 'owner/repo' }],
          position: 'bottom-right',
        });
      })
      .catch((err) => console.warn('[Traklet] init failed:', err));

    return () => {
      cancelled = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
      initRef.current = false;
    };
  }, []);

  return null;
}
```

Add one line to the layout: `<TrakletDevWidget />`.

**Env-var prefix** (framework): Next.js `NEXT_PUBLIC_`, Vite `VITE_`, CRA `REACT_APP_`.
**Canonical var names:** `<PREFIX>_TRAKLET_PAT` (token) and `<PREFIX>_TRAKLET_ENABLED`. (Some older projects use `<PREFIX>_TRAKLET_GITHUB_TOKEN`; converge on `_TRAKLET_PAT`.)

---

## 2. Environment policy — the hard rule

| Environment | `..._TRAKLET_ENABLED` | `..._TRAKLET_PAT` (token) | Widget |
|---|---|---|---|
| **dev** | `true` | set (fine-grained PAT) | on |
| **uat** | `true` | set | on |
| **prod** | unset / not `true` | **NOT SET** | off |

**Why the token must be *absent* on prod, not merely gated:** `NEXT_PUBLIC_ / VITE_ / REACT_APP_` values are inlined into the **client bundle at build time**. The `ENABLED` guard stops the widget from *rendering*, but if the token var is present in the prod build it is still **baked into the public JS and extractable by anyone**. So prod must have **neither** `ENABLED` **nor** the token.

These are **build-time** values — after changing them you must **rebuild** that environment's web app (setting a var alone doesn't re-bake an existing build).

---

## 3. One tracker, environment labels ("reported once")

- **Every environment files into the one project tracker.** Never create per-environment trackers.
- Each issue is auto-tagged with the environment it came from — **`env:dev` / `env:uat`** — derived from the reporting URL Traklet already writes into every issue body (`- **URL:** https://dev.example.com/…`).
- A bug seen in both environments is a **single** issue carrying **both** labels. Filter with `label:env:dev` / `label:env:uat`.

### GitHub (proven)

1. Create the labels once per repo:
   ```bash
   gh label create "env:dev" --color 4338ca --description "Reported from DEV" --force
   gh label create "env:uat" --color b45309 --description "Reported from UAT" --force
   ```
2. Add this workflow to the repo's **default branch** — issue-event workflows only run from the default branch:

   `.github/workflows/traklet-env-label.yml`
   ```yaml
   name: Traklet env label
   on:
     issues:
       types: [opened]
   permissions:
     issues: write
   jobs:
     label:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/github-script@v7
           with:
             script: |
               const body = context.payload.issue.body || '';
               const m = body.match(/(?:\*\*URL:\*\*|URL:)\s*(\S+)/i);
               if (!m) return;
               let host = '';
               try { host = new URL(m[1]).host.toLowerCase(); } catch { return; }
               const segs = host.split(/[.-]/);
               let label = null;
               if (segs.includes('dev') || segs.includes('development')) label = 'env:dev';
               else if (segs.includes('uat') || segs.includes('staging') || segs.includes('qa')) label = 'env:uat';
               if (!label) return;
               const have = (context.payload.issue.labels || []).map((l) => l.name);
               if (have.includes(label)) return;
               await github.rest.issues.addLabels({
                 owner: context.repo.owner, repo: context.repo.repo,
                 issue_number: context.issue.number, labels: [label],
               });
   ```
   The matcher keys on a `dev`/`uat` (or `development`/`staging`/`qa`) **host segment**, so it is portable across projects regardless of the exact domain.

### Azure DevOps (recipe — implement per project)

GitHub Actions don't apply. Achieve the same with a **Service Hook** on **"Work item created"** → a small handler (Azure Function / Logic App) that reads the reporting URL from the work-item description and adds an `env:dev` / `env:uat` **tag** (same host-segment logic). *(No shared implementation yet — this is the pattern to build for Azure-backed projects such as sji-flight-deck.)*

---

## 4. Token security

- The token is **client-exposed by design** (the widget runs in the browser). Contain the blast radius:
  - **Fine-grained PAT**, scoped to **`Issues: write`** (GitHub) / **Work Items: Read & Write** (Azure) on the **one** repo/project only. No `repo`-wide or org tokens.
  - Present on **dev/uat builds only — never prod** (see §2).
- Never hardcode a token in source; never commit `.traklet/settings.json` (it is gitignored, and the pre-commit hook blocks token leaks).

---

## 5. Verification checklist

- [ ] **prod:** no widget renders; grep the built prod JS → **no token string** (or confirm the prod build has no `..._TRAKLET_*` vars).
- [ ] **dev:** widget renders; file an issue → it lands in the **one** repo → auto-labeled **`env:dev`** within ~1 min.
- [ ] **uat:** same → **`env:uat`**.
- [ ] One repo holds issues from both, distinguishable by label.

## 6. Removal test

Still 3 deletions: (1) the component file, (2) the `<TrakletDevWidget />` line, (3) the `..._TRAKLET_*` env vars. (The env-label workflow + labels are additive and can stay.)

## Anti-patterns (the zero-coupling contract)

❌ importing host modules (auth/theme/apiClient) · ❌ reading host auth (JWT/cookies/session) · ❌ hardcoded tokens · ❌ `/api/traklet/*` proxy routes (use the built-in adapters).

---

## Appendix: label-at-creation alternative (optional)

The GitHub/Azure recipes above label **after** creation from the URL — zero package change. A cleaner-but-heavier option is to add a `defaultLabels?: string[]` field to `TrakletConfig` so the environment label is applied **at creation** (the widget passes `defaultLabels: ['env:dev']` per build). Prefer the config-only recipe unless you specifically want at-creation labeling across every consumer.
