# Recipe: Jam → MCP → Playwright

> **From a tester's bug recording to a runnable Playwright spec — without losing the human touch.**

This recipe documents the proven pipeline for turning a [Jam.dev](https://jam.dev) bug recording into a BlessBox-style Playwright spec, using [Jam MCP](https://jam.dev/mcp) and Cursor. The QA tester keeps full creative control of the reproduction; the engineer gets a draft test in seconds instead of minutes.

**Reference implementation:** BlessBox (`/Users/admin/Dev/YOLOProjects/BlessBox`), tested against Aracela's "Fail:" reports for Issues #23, #24, #26, #27, #28.

> **Want the *full autonomous loop* — ingest → RED gate → auto-fix → verify → deploy-promote — not just spec generation?** This recipe is the manual core. Wrap it with the base build-your-own blueprint: [`JAM_TRAKLET_PIPELINE_RECIPE.md`](./JAM_TRAKLET_PIPELINE_RECIPE.md).

---

## The Problem We're Solving

Manual QA is irreplaceable — humans catch bugs that automation never will. But the cost of *converting* that human discovery into a regression-proof test is high:

```
┌────────────────────────────────────────────────────────────┐
│  Tester finds bug         ──▶  posts "Fail: ..." in chat   │
│            │                                                │
│            ▼                                                │
│  Engineer manually reproduces locally  ◀── 10 min wasted   │
│            │                                                │
│            ▼                                                │
│  Engineer hand-writes Playwright spec  ◀── 20 min wasted   │
│            │                                                │
│            ▼                                                │
│  Engineer fixes + verifies                                  │
└────────────────────────────────────────────────────────────┘
```

The two middle steps are pure friction. This recipe collapses them.

---

## The End-to-End Flow

```
Tester                    Jam (capture)              Cursor (consume)            Playwright (run)
──────                    ─────────────              ────────────────            ────────────────
  │                              │                          │                          │
  │ Records bug ───────────────▶ │                          │                          │
  │ (Chrome extension)           │ console + network        │                          │
  │                              │ + DOM events             │                          │
  │                              │ + video                  │                          │
  │ Posts Jam URL                │                          │                          │
  │ to issue ──────────────────▶ │                          │                          │
  │                              │                          │                          │
  │                              │ Engineer pastes URL ───▶ │                          │
  │                              │                          │ getUserEvents            │
  │                              │ ◀── Jam MCP tools ────── │ getNetworkRequests       │
  │                              │                          │ getConsoleLogs           │
  │                              │                          │ getMetadata              │
  │                              │                          │                          │
  │                              │                          │ + project page model    │
  │                              │                          │ (browser MCP, optional) │
  │                              │                          │                          │
  │                              │                          │ Generates spec ────────▶ │ npx playwright test
  │                              │                          │                          │ --headed --debug
  │                              │                          │                          │
  │                              │                          │                          │ RED → fix → GREEN
```

---

## The Stack

| Layer            | Tool                              | Role                                                       |
| ---------------- | --------------------------------- | ---------------------------------------------------------- |
| **Capture**      | Jam Chrome extension              | One-click recording of clicks, network, console, DOM, video |
| **Transport**    | Jam MCP (`https://mcp.jam.dev/mcp`) | Streams recording context into AI clients                  |
| **Consumer**     | Cursor (with MCP enabled)         | Reads Jam events + project code, emits draft spec          |
| **Resolver**     | Browser MCP (optional)            | Lets Cursor verify selectors against the live page         |
| **Runtime**      | Playwright                        | Executes the generated spec locally and in CI              |
| **Test management** | Traklet                        | Hosts the test cases the spec covers; tracks pass/fail     |

**Cost:** Free tier of Jam includes MCP. The whole pipeline runs on $0 until you hit 30 Jams/month.

---

## Prerequisites

Before running this recipe, the project must have:

1. **A test-id convention.** Interactive elements use stable `data-testid` attributes (e.g., `data-testid="btn-submit-login"`). Without this, generated selectors are brittle.
2. **Reusable test helpers.** Login and seeding should be one function call, not 20 lines per spec.
   - Example (BlessBox): `loginAsUser(page, email, { organizationId })`, `seedOrgViaRequest(request, key, opts)`
3. **A canonical reference spec.** One existing Playwright file Cursor can mimic for structure (describe blocks, fixture usage, assertions style).
   - Example (BlessBox): `tests/e2e/issues-23-24-26-27-28-aracela-batch.spec.ts`
4. **A test-only auth path.** API endpoint that accepts a shared secret and returns session cookies, so generated specs can run against production without real human OTP.
   - Example (BlessBox): `/api/test/login` gated by `PROD_TEST_LOGIN_SECRET`
5. **A test seed endpoint.** Deterministic data setup so tests don't depend on the tester's session.
   - Example (BlessBox): `/api/test/seed-prod` gated by `PROD_TEST_SEED_SECRET`

If any of these are missing, the recipe still works but Cursor's draft spec will need more hand-fixing.

---

## Recipe 1 — Onboard a tester to Jam (bridging the gap)

**Use this when:** the tester is new to Jam, or you need them to start producing MCP-readable recordings.

### Step 1.1 — Install the Chrome extension

The tester (only) needs to install Jam:

1. Visit [chromewebstore.google.com](https://chromewebstore.google.com/) → search "Jam" → "Add to Chrome"
2. Sign in with the team workspace email (workspace admin invites them as a Creator seat — see [Members and Roles](https://jam.dev/docs/administration/members-and-roles))
3. Pin the extension icon to the Chrome toolbar

### Step 1.2 — Set capture habits

Tell the tester these three rules. They're the entire training:

- **Start the recording at the section start, not at the failure.** Jam captures up to 5 min (free) or 15 min (Team). Starting earlier means we get the steps that *led* to the failure.
- **Use the keyboard shortcut.** `Shift + Cmd + X` for Instant Replay; faster than clicking.
- **Optional: enable the microphone.** If the tester narrates ("I expected X, I got Y"), Jam transcribes it via WebVTT and Cursor reads it via `getVideoTranscript`.

### Step 1.3 — Define the bug-report template

Standardize what gets attached to every "Fail:" report:

```markdown
## Fail: <feature area>

**Jam:** <jam.dev URL>
**Org used:** <org slug or "any seeded org">
**Expected:** <one sentence>
**Actual:** <one sentence>
**Console errors visible:** yes / no
```

That's it. Five fields. Cursor + Jam MCP will recover everything else from the recording.

### Step 1.4 — Verify the link is MCP-readable

For the first Jam the tester records, sanity-check it:

```bash
curl -X POST https://mcp.jam.dev/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"getDetails","arguments":{"jamUrl":"<paste URL>"}}}'
```

A 200 with JSON metadata means MCP can read it. A 404 usually means the Jam is private and the workspace needs a Personal Access Token (see [Jam → Personal Access Tokens](https://jam.dev/docs/integrations-overview)).

---

## Recipe 2 — Wire Jam MCP into Cursor (one-time)

**Use this when:** setting up an engineer's machine for the first time.

### Step 2.1 — Add the MCP server to Cursor

Edit `~/.cursor/mcp.json` (user-level) **or** `<project>/.cursor/mcp.json` (project-level):

```json
{
  "mcpServers": {
    "jam": {
      "url": "https://mcp.jam.dev/mcp"
    }
  }
}
```

### Step 2.2 — Restart Cursor

Required. Cursor only loads `mcp.json` on launch.

### Step 2.3 — Verify the tools are loaded

In a Cursor chat, run:

> List the MCP tools available from the `jam` server.

You should see at least: `getDetails`, `getUserEvents`, `getNetworkRequests`, `getConsoleLogs`, `getMetadata`, `getVideoTranscript`, `analyzeVideo`, `listJams`.

If the list is empty, see [Troubleshooting](#troubleshooting).

---

## Recipe 3 — Convert a Jam → Playwright spec

**Use this when:** a tester has posted a Jam URL and you need a runnable spec.

This is the recipe that runs every day. Treat the prompt as a contract.

### Step 3.1 — Gather the inputs

You need three things before opening Cursor:

1. **The Jam URL** (from the bug report)
2. **The path to your reference spec** (the one Cursor will mimic)
3. **The list of helpers the spec must use** (login, seed, any custom fixtures)

### Step 3.2 — The prompt template

Open Cursor, paste this prompt with the placeholders filled in:

```
You have access to the Jam MCP server. Use it to read this recording: <JAM_URL>

Convert it into a Playwright spec following these rules:

REFERENCE PATTERN
Mirror the structure of: <PATH_TO_REFERENCE_SPEC>
- Same import block, same describe layout, same fixture style.

REQUIRED HELPERS (do not inline auth or seed logic)
- Authentication: <LOGIN_HELPER_SIGNATURE>
- Test data: <SEED_HELPER_SIGNATURE>
- Production gate: skip the test if IS_PRODUCTION && !HAS_PROD_SECRETS

SELECTOR RULES
- Prefer data-testid over role/text selectors.
- If the Jam getUserEvents output describes an element by visible text, find the matching data-testid in the codebase by grepping for the closest enclosing component.
- Do NOT invent testids that don't exist.

ASSERTIONS
- Use getNetworkRequests to identify the failing API call (statusCode >= 400) — assert against it explicitly.
- Use getConsoleLogs (logLevel: error) to find runtime errors — assert they don't appear after the fix.
- The first run of this spec MUST be RED. If your generated spec passes against the current codebase, you've missed the bug.

OUTPUT
- Write the spec to: tests/e2e/<kebab-case-bug-summary>.spec.ts
- Add a top-of-file comment block with: Jam URL, issue link, expected vs actual, who reported it.
- Don't run the spec — I will run it manually.
```

### Step 3.3 — Run the draft against your local dev server

```bash
BASE_URL=http://localhost:7777 npx playwright test \
  tests/e2e/<your-new-spec>.spec.ts \
  --headed --debug
```

Three possible outcomes:

| Outcome | What it means | Next step |
| ------- | ------------- | --------- |
| **RED** (fails as expected) | Bug reproduced. ✅ | Fix the bug. Re-run. Aim for GREEN. |
| **GREEN** (passes immediately) | Either Cursor missed the bug OR the bug is environmental | Watch the Jam video again, refine the prompt, regenerate |
| **ERROR** (fails to run) | Selector / helper mismatch | Read the error, fix the selector or helper call by hand |

### Step 3.4 — Promote to production verification

Once RED → fix → GREEN locally, verify against production:

```bash
TEST_ENV=production BASE_URL=https://<your-prod-domain> \
  source .env.production.local && \
  npx playwright test tests/e2e/<your-new-spec>.spec.ts
```

Add the spec to your verification suite script (e.g., `run-verification-tests.sh`) so it runs on every deploy.

---

## Recipe 4 — (Optional) Inject jam.metadata() for context fidelity

**Use this when:** generated specs frequently get the wrong org / plan / environment because Jam's `getUserEvents` doesn't surface enough context.

### What it does

Jam ships a JS SDK that lets your app inject **custom metadata** at recording time. Cursor reads it via the MCP `getMetadata` tool. With this, every Jam tells the AI exactly which user, org, plan, and environment was active.

### What to inject (example)

```typescript
// In your auth provider or root layout — runs once per session
jam.metadata({
  userId: session.user.id,
  organizationId: session.user.organizationId,
  organizationName: session.user.organizationName,
  planType: subscription?.planType,
  env: process.env.VERCEL_ENV ?? 'development',
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
});
```

### Why this matters

Without metadata, Cursor has to *guess* which `seedOrgViaRequest({ planType: 'enterprise' })` parameters to use based on what it sees in clicks. With metadata, it reads `planType: 'enterprise'` directly. The generated spec is correct on the first pass.

This is **optional**. The recipe works without it; metadata just raises the success rate from ~80% to ~95%.

---

## Tested Prompt Template (BlessBox)

Copy/paste-ready for any BlessBox bug. Replace only `<JAM_URL>` and `<SUMMARY>`.

```
You have access to the Jam MCP server. Use it to read this recording: <JAM_URL>

Convert it into a Playwright spec following these rules:

REFERENCE PATTERN
Mirror the structure of: tests/e2e/issues-23-24-26-27-28-aracela-batch.spec.ts
- Use the same imports (loginAsUser, seedOrgViaRequest, IS_PRODUCTION, HAS_PROD_SECRETS).
- Use the same `test.describe('<Issue summary>', () => { ... })` wrapping.
- Use the same `test.skip()` guards for production.

REQUIRED HELPERS
- Auth: `await loginAsUser(page, seed.contactEmail, { organizationId: seed.organizationId })`
- Seed: `const seed = await seedOrgViaRequest(request, '<unique-key>', { /* opts */ })`
- For API-only assertions, extract cookies via `page.context().storageState()` then build a Cookie header.

SELECTOR RULES
- Prefer `data-testid` (project requires it via .cursorrules).
- If Jam describes "Click the Submit button", search the codebase for `data-testid="btn-submit*"` near the closest form.
- Use Playwright's `getByTestId()` where possible.

ASSERTIONS
- Use `getNetworkRequests({ statusCode: '4xx' })` to find the failing call — assert that response.
- For UI bugs: assert the broken element state is visible (RED-first).
- For data bugs: assert the API contract directly with `request.post(...)`.

OUTPUT
- File: `tests/e2e/<JAM_SUMMARY_kebab>.spec.ts`
- Header comment must include: Jam URL, GitHub issue (if known), expected/actual.
- Skip running it.

CONTEXT: <SUMMARY>
```

---

## Troubleshooting

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| Cursor doesn't list Jam tools | `mcp.json` not loaded | Restart Cursor; verify the file path is correct |
| `getDetails` returns 404 | Jam is private to a different workspace | Add a Jam Personal Access Token to the MCP config: `{ "url": "...", "headers": { "Authorization": "Bearer <PAT>" } }` |
| `getUserEvents` returns vague descriptions ("Clicked element") | Free-tier capture, low DOM specificity | Upgrade workspace, or use [Recording Links](https://jam.dev/docs/request-a-jam/recording-links) with a custom domain for richer DOM capture |
| Generated spec uses wrong selectors | Cursor invented testids that don't exist | Add explicit instruction: "Verify each `data-testid` exists in the codebase via Grep before using it" |
| Spec passes immediately (no RED) | Cursor inferred a fix path, not the bug path | Re-prompt: "Re-read getNetworkRequests and find the 4xx/5xx response. Assert the failure mode, not the success mode." |
| Spec uses real test data instead of seed | Cursor copied Aracela's session | Add explicit: "Replace any pre-existing org/email/cookie with `seedOrgViaRequest` + `loginAsUser`. Never use literal emails/IDs from the recording." |
| Free tier hit (30 Jams/month) | Tester is productive | Upgrade to Team ($14/creator/mo) — recordings extend to 15 min and limit becomes unlimited |

---

## Adoption Ladder

Don't try to build everything at once. Climb in this order:

### Tier 1 — Prompt Template (15 min)

- Wire `mcp.json`
- Save the prompt template to `tests/e2e/_prompts/jam-to-playwright.md`
- Use it on the next bug report
- **Stop here if it's working.** YAGNI applies.

### Tier 2 — Cursor Skill (~2 hours)

Promote the prompt to a Cursor skill at `.cursor/skills/jam-to-playwright/SKILL.md`:

```markdown
---
name: jam-to-playwright
description: Convert a Jam.dev recording into a Playwright spec following project conventions
---

When given a Jam URL, use the Jam MCP server tools (getUserEvents, getNetworkRequests,
getConsoleLogs, getMetadata) to extract the bug context. Generate a Playwright spec
following <reference spec path> using <helper signatures>. RED-first.
```

Now any team member can invoke it: "use the jam-to-playwright skill on this URL".

### Tier 3 — Webhook automation (only if Tier 2 isn't enough)

Jam fires webhooks on every recording. Wire one up:

1. Subscribe to `intercom.recorder.recorded` (or the equivalent for your workspace)
2. Endpoint: a small GitHub Action that creates an issue with the Jam URL
3. Issue triggers a Cursor Cloud Agent or a `gh` workflow that runs the skill
4. Output: a draft PR with a RED test

This is **moonshot territory**. Worth it only if your tester volume is high enough that even Tier 2 prompts feel like overhead.

---

## Reference: Jam MCP tool surface

From [jam.dev/mcp](https://jam.dev/mcp). Filters listed are the ones that matter most for spec generation.

| Tool                | What it returns                                                | When to use it                              |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| `getDetails`        | Author, title, related context                                 | Open of every prompt — orient Cursor        |
| `getUserEvents`     | Plain-language click/input/navigation log                      | Drives the test's action sequence           |
| `getNetworkRequests` | All requests as JSON; filter by `statusCode`/`host`           | Identify the failing call → assertions      |
| `getConsoleLogs`    | Console output; filter by `logLevel`                           | Find runtime errors → negative assertions   |
| `getMetadata`       | Custom KV pairs from `jam.metadata()` SDK                      | Get user/org/plan/env without guessing      |
| `getVideoTranscript`| Spoken WebVTT (if mic enabled)                                 | Capture tester's narration as test comments |
| `getScreenshot`     | All screenshots (screenshot-Jams only)                         | Visual confirmation before generating       |
| `analyzeVideo`      | Structured video analysis                                      | Fallback when events are ambiguous          |
| `listJams`          | Search/filter recordings by text/folder/author/url/date        | Build batch tools, not 1:1 conversion       |

---

## Verification Checklist

Before considering this recipe "operational" in your project:

- [ ] Tester has Jam Chrome extension installed and is in the workspace
- [ ] Bug-report template is documented and used (5 fields above)
- [ ] Engineer's `~/.cursor/mcp.json` includes the Jam MCP entry
- [ ] Cursor lists Jam tools when asked
- [ ] One reference Playwright spec exists in the project
- [ ] `loginAsUser` and `seedOrgViaRequest` (or equivalents) exist and are tested
- [ ] At least one bug has been converted end-to-end using the prompt template
- [ ] The generated spec was RED on first run (proving the bug was real)
- [ ] After fix, the spec is GREEN and added to the verification suite

If any box is unchecked, the recipe is not yet load-bearing in your workflow.

---

## Why This Recipe Lives in Traklet

Traklet is the test-case management layer. Test cases describe **what** must pass. This recipe describes **how** to author the regression test that proves a test case stays passing.

In a healthy QA workflow:
1. Traklet defines the test case (objective, prerequisites, steps, expected result)
2. The tester runs the test case manually and records it via Jam
3. This recipe converts the failed run into a Playwright regression
4. The regression runs in CI forever — no human re-execution needed

That's the loop Traklet was built for. This recipe closes it.

---

**See also:**
- [Jam → Traklet Pipeline Recipe](./JAM_TRAKLET_PIPELINE_RECIPE.md) — the full autonomous loop around this core
- [Jam → Resolution Pipeline (design + runbook)](./JAM_TO_RESOLUTION_PIPELINE.md) — the BlessBox reference implementation
- [Traklet Integration Guide](./INTEGRATION.md)
- [Traklet AI Integration Prompt](./AI_INTEGRATION_PROMPT.md)
- [Jam.dev MCP](https://jam.dev/mcp)
- BlessBox reference spec: `tests/e2e/issues-23-24-26-27-28-aracela-batch.spec.ts`
