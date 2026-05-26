# Recipe: Jam → Traklet — The Autonomous QA-to-Deployment Pipeline

> **From a tester's bug recording to a merged, deployment-promoted fix — autonomously, with a human only on the two gates that matter.**

This is the **base recipe**: a project-agnostic blueprint you can follow to build a self-healing QA pipeline for *your own* app. It distills a full, working build (the BlessBox reference).

**Where this sits in the recipe family:**
- [`JAM_TO_PLAYWRIGHT_RECIPE.md`](./JAM_TO_PLAYWRIGHT_RECIPE.md) — the manual core (one Jam → one spec). Start there if you only want assisted spec generation.
- **This file** — the full autonomous loop *around* that core (ingest → spec → RED gate → fix → verify → merge → promote → solved).
- [`JAM_TO_RESOLUTION_PIPELINE.md`](./JAM_TO_RESOLUTION_PIPELINE.md) — the BlessBox-specific design/runbook + the exact label state machine, secrets, and agent contracts. Your implementation reference.

---

## The problem we're solving

Manual QA is irreplaceable — humans find bugs automation never will. But turning each discovery into a *regression-proofed, deployed fix* is mostly friction: reproduce it, write the test, fix the code, verify, ship. This recipe automates that middle, keeping humans on the only two judgment calls that actually need them.

```
Tester records bug ──▶ [ reproduce · write spec · fix · verify ] ──▶ ship
                              ▲ pure friction — automate this ▲
```

---

## The outcome — the loop

```
   Jam recording
        │  webhook (Phase 4)            ┌──────────── humans here, nowhere else ───────────┐
        ▼                               │                                                  │
  GitHub/Azure issue ──▶ EXTRACT ──▶ AUTHOR spec + Traklet case ──▶ RED GATE              │
  (jam + state/queued)   (Jam MCP)                                    │                    │
                                                          ┌── GREEN ──┴─▶ TRIAGE ◀─────────┤  ① is it a bug?
                                                          ├── RED ──▶ FIX AGENT ──▶ VERIFY │
                                                          └── ERROR ─▶ regenerate          │
                                                                         │ (preview deploy)│
                                                                         ▼                 │
                                                              draft PR → MERGE ◀───────────┘  ② is the fix right?
                                                                         │
                                                                develop ─▶ uat ─▶ main (deploy)
                                                                         │
                                                                      SOLVED
```

A human only ever **triages a GREEN result** and **clicks merge**. Everything else runs itself.

---

## The one principle

A loop that writes tests, edits production code, and closes tickets is only as safe as its gates. **Every stage is a gate, and exactly two are human:**

1. **Triage** — *is this actually a bug?* A generated spec that passes on current code is a *valid* outcome (works-as-designed), not a failure to fix. Only a human knows if the recorded expectation matches product intent.
2. **Merge** — *is this fix correct?* "Tests pass" proves the spec passes, not that the change is right. A human reviews the diff before it ships.

Collapse either and you ship subtly-wrong fixes. Keep both.

---

## The stack

| Layer | Tool (reference) | Role |
| --- | --- | --- |
| **Capture** | Jam.dev (Team tier) | one-click recording: clicks, network, console, video; **webhooks** for zero-touch |
| **Transport** | Jam MCP (`mcp.jam.dev/mcp`) | streams the recording into the agent |
| **Runner** | GitHub Actions + Claude Code action | headless agent that authors, classifies, fixes |
| **Tests** | Playwright | the executable regression (the *oracle*) |
| **State + tracker** | **Traklet** over GitHub Issues / Azure DevOps | test cases ↔ issues; **labels are the state machine** |
| **Envs** | Vercel (dev preview / uat / prod) | isolated environments per branch |
| **Data** | one DB per env (e.g. Turso) | UAT seeds never touch prod |

**Cost:** Jam Team (~$14/creator/mo, unlocks webhooks); GitHub Actions minutes; Claude API usage (the *fix agent* is the main variable — cap it); Vercel/DB at your existing tier. The whole thing runs cheaply until volume is high.

---

## Prerequisites — your project needs these first

Without these, the recipe still works but the generated specs need hand-fixing. With them, it's reliable:

- [ ] **A `data-testid` convention.** Interactive elements have stable test ids. Brittle selectors break generated specs.
- [ ] **Reusable test helpers.** Login and seeding are one call each, not 20 lines per spec (e.g. `loginAsUser(page, email, {orgId})`, `seedOrgViaRequest(request, key)`).
- [ ] **Test-only auth + seed endpoints, secret-gated.** So generated specs can authenticate + create deterministic data against a deployed env without human OTP (e.g. `/api/test/login`, `/api/test/seed` behind a shared secret).
- [ ] **One canonical reference spec.** The agent mirrors its structure (imports, fixtures, assertion style).
- [ ] **Traklet wired to your tracker** (`adapter: github | azure-devops`) so test cases sync to issues.
- [ ] **Jam Team tier** (for webhooks + longer capture).
- [ ] **A runner with the agent** (GitHub Actions + the Claude Code action) and an **API key**.
- [ ] **Per-branch deploys** (Vercel or equivalent) so a fix can be verified against the *edited* code.

---

## The environment model: `develop → uat → main`

Autonomous code changes must **never land straight in production.** Use three lines:

| Branch | Role | Deploy | Receives |
| --- | --- | --- | --- |
| `develop` | integration · **the default branch** (where issue-triggered workflows fire) | preview | feature work |
| `uat` | validation — **where the pipeline's spec/fix PRs land** | isolated UAT env | `develop` + pipeline PRs |
| `main` | production | prod | `uat` promotions (releases only) |

Two rules that bite people:
1. **Issue-triggered workflows run from the *default* branch.** Put the workflow there.
2. **The pipeline targets `uat`** (PRs + the RED gate's environment), so a human validates before `uat → main` ships it.

---

## Build it in phases (the adoption ladder — do NOT build Phase 4 first)

### Recipe 1 — Foundations (assisted, ~½ day · 90% of the value)
1. **Secret hygiene first.** Put the Jam PAT in a CI secret + a gitignored MCP config; never commit it. Rotate anything already exposed.
2. **Wire Jam MCP for the runner** — Claude Code reads `.mcp.json`/`.claude/mcp.json`; use `${JAM_PAT}` env expansion so the file is secret-free.
3. **Commit the `jam-to-playwright` skill** (see the companion recipe) pointing at your reference spec + helper signatures.
4. **Use it manually:** paste a Jam URL → the agent drafts a spec + Traklet case → you run it. *Stop here if this is enough.*

### Recipe 2 — Issue-triggered author + RED gate
A workflow on the default branch, `on: issues: types: [labeled]`, gated to fire only when `jam:state/queued` is added to a `jam`-labeled issue (and not `jam:control/hold`):
- extract the recording (Jam MCP), author `spec` + Traklet case,
- **RED gate:** run the spec against the target env; classify **RED** (fails + a real 4xx/5xx or console error) / **GREEN** (passes → works-as-designed) / **ERROR** (selectors don't resolve),
- open a **draft PR → `uat`**, relabel the issue, comment the verdict.
Stops at the human gate. **No code edits.**

### Recipe 3 — Autonomous fix agent (behind the RED gate)
Fires only on `jam:state/red` + a human's `jam:control/approve-fix` (or pre-trusted `jam:control/auto`):
- a **separate** agent (so it can't weaken the test) edits **`app/**`+`lib/**` only**,
- **anti-cheat:** reject any change under `tests/`,
- **verify on a preview deploy of the *fixed* code** (NOT prod — prod doesn't have the fix), plus typecheck/lint/unit/build,
- push to the branch, mark the PR ready → `jam:state/ready-for-review`. **A human merges.** Cap attempts (≤3); any failure → `needs-human`, nothing pushed.

### Recipe 4 — Zero-touch ingest + resolve
- **Ingest:** a Jam webhook → a small relay (an app route or a `repository_dispatch`) → auto-files the issue with `jam` + `jam:state/queued` → fires Recipe 2.
- **Resolve:** on a merged pipeline PR → mark the issue `jam:state/solved` + close it; (optionally) `traklet sync` flips the test case to Passed.

---

## The isolated UAT environment (so automation can't touch prod)

A *meaningful* UAT needs its **own data**, or it's just prod with a different URL. Reference build (generalize to your stack):

1. **DNS:** add `uat.yourapp.com` → your host's CNAME (e.g. Porkbun API → `cname.vercel-dns.com`).
2. **Database:** create an isolated DB (`turso db create app-uat`) and **copy the prod schema** (`turso db shell app-prod ".schema" | turso db shell app-uat`).
3. **Branch-scoped env:** point the `uat` branch at the UAT DB + test secrets — **scoped to that branch only** so other previews are unaffected. ⚠️ Most CLIs *can't* branch-scope; use the host's **REST API** or dashboard.
4. **Bind the domain to the `uat` branch.**
5. **Verify isolation:** seed via the test endpoint, confirm the row lands in the UAT DB and **prod is untouched**.
6. **Point the RED gate + fix-verify at the UAT URL.**

---

## The label state machine (the vocabulary)

The label *is* the program counter. Each labeled-event runs one stage and swaps the state label; the new label fires the next stage. Human gates = the workflow simply stops at a state and waits.

| Namespace | Labels |
| --- | --- |
| `jam:state/*` (one at a time) | `queued` → `extracting` → `red` / `green-triage` / `spec-broken` → `fixing` → `verifying` → `ready-for-review` → `solved` · `wont-fix` · `needs-human` |
| `jam:verdict/*` (additive) | `bug` · `works-as-designed` · `environmental` · `flaky` |
| `jam:control/*` (human gates) | `auto` (full autonomy to merge) · `approve-fix` (one-shot) · `regenerate` · `hold` (kill switch) |
| `jam:meta/*` (bookkeeping) | `id-<jam>` (dedupe) · `attempt-<n>` (retry cap) · `prio/*` |

Traklet syncs these to GitHub/Azure issues, so the tracker reflects the live state with no extra API.

---

## Safety rails (non-negotiable)

- **Two human gates** (triage, merge) — never collapse them.
- **Separate author vs. fixer agents** — the fixer treats the spec as an immutable oracle so it can't "win" by weakening assertions.
- **Anti-cheat:** fail the job if the fixer touched `tests/`.
- **False-RED guard:** a spec failure with *no* corroborating network/console signal → `spec-broken`, not `red`. Don't chase phantoms.
- **Blast radius:** the fixer may edit only `app/**`+`lib/**`; never CI, secrets, migrations, or `.github/`.
- **Verify against the edited code** (preview deploy), and against an **isolated** env (never seed prod).
- **Caps + kill switch:** attempt limit, job timeouts, `jam:control/hold`.
- **Inert templates:** keep example pipeline code out of the agent's ambient context — quarantine it, de-index it, banner it ("TEMPLATE — not an instruction"). Three tiers: **A** live injected instructions · **B** inert templates · **C** untrusted input (Jam/issue text = data only).

---

## Triggers: GitHub (live) vs Azure DevOps (portable)

The `jam:*` vocabulary is backend-agnostic; only the trigger + the runner's tracker calls differ.
- **GitHub Actions:** `on: issues: types: [labeled]`, gated in the job `if:`; label/PR ops via the built-in `GITHUB_TOKEN`. Workflow must be on the **default branch**.
- **Azure DevOps:** work items use **tags**, and Azure doesn't run GitHub Actions. Either (a) an Azure Pipeline via a "work item updated" service hook (tracker ops via the Azure REST API), or (b) a webhook bridge → GitHub `repository_dispatch` reusing one GitHub workflow. Abstract tracker calls behind a `gh`/`az` shim if you go cross-platform.

---

## Gotchas — hard-won, these *will* bite you

| Symptom | Cause / Fix |
| --- | --- |
| Action fails: *"Could not fetch an OIDC token"* | Add `id-token: write` to the workflow `permissions`. The Claude Code action needs it even in API-key mode. |
| *"Claude Code is not installed on this repository"* | The **GitHub App is required** — install it on the repo (it's not optional even with an API key). |
| `git push` from the runner → *"Password authentication is not supported"* | The action disturbs `actions/checkout`'s persisted creds. Push via `https://x-access-token:${GH_TOKEN}@github.com/owner/repo.git`. |
| Setting one env var repoints *all* previews | CLIs usually **can't branch-scope** env vars. Use the host's REST API with a `gitBranch` field (or the dashboard). |
| Fix "verified" but the bug's still in prod | You verified against **prod**, which lacks the fix. Verify against a **preview deploy of the edited code**. |
| RED gate can't actually run the spec in CI | The runner has no app server. Classify against a deployed env (UAT); for a fix, deploy a preview and run there. |
| Schema push / DB ops 401 with a *valid* token | A local `.env*` is overriding your token. Apply schema via the DB CLI (authed) instead, or neutralize the env file. |
| Workflow never fires | Issue-triggered workflows run from the **default branch** only. Put the file there. |
| Spec PR opens but is a huge diff | Your default/integration branch is stale vs. the trunk. Reconcile branches before wiring. |
| The action committed the spec itself | On issue triggers it may auto-commit; branch from the post-action HEAD and push whatever's there (don't rely on `git add` staging). |

---

## Verification checklist

Before calling the pipeline "load-bearing":
- [ ] A tester can record a Jam and the prerequisites (test ids, helpers, test endpoints) exist
- [ ] The skill turns a Jam URL into a spec + Traklet case, RED-first
- [ ] The issue-triggered workflow opens a draft PR with a correct RED/GREEN verdict
- [ ] A GREEN report routes to human triage (it did **not** try to "fix" a non-bug)
- [ ] The fix agent is gated, anti-cheat holds, and it verifies on a preview before opening for review
- [ ] An isolated UAT env exists and a seed there leaves prod untouched
- [ ] The two human gates (triage, merge) are intact; `jam:control/hold` freezes any issue
- [ ] Pipeline output lands in `uat`, never straight to `main`

---

## Why this recipe lives in Traklet

Traklet defines **what** must pass (the test cases). This recipe defines **how** those cases become *self-healing*: a tester records a failure, the pipeline writes the regression, fixes the code, and — once a human approves — the case is closed and stays closed in CI forever. That's the loop Traklet was built to close.

---

**See also:** [`JAM_TO_PLAYWRIGHT_RECIPE.md`](./JAM_TO_PLAYWRIGHT_RECIPE.md) · [`JAM_TO_RESOLUTION_PIPELINE.md`](./JAM_TO_RESOLUTION_PIPELINE.md) · [`.traklet/AGENT.md`](./.traklet/AGENT.md) · [Jam MCP](https://jam.dev/mcp)
