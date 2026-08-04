# Traklet AutoDev — guided setup

A **local, deterministic simulator** of the Jam → Resolution autonomous QA pipeline
([`JAM_TO_RESOLUTION_PIPELINE.md`](../JAM_TO_RESOLUTION_PIPELINE.md) ·
[`JAM_TRAKLET_PIPELINE_RECIPE.md`](../JAM_TRAKLET_PIPELINE_RECIPE.md)).

Those docs are a *design* — a real run needs a Jam account, GitHub Actions, the Claude
Code action, Vercel previews, and an isolated UAT database. **AutoDev collapses all of
that into one process you can run with no external accounts**, so you can see, develop,
and trust the loop *before* you wire the real thing. Then this guide walks you up the
ladder to the real pipeline — by hand, or with an AI assistant.

```
Record a Jam ─▶ INGEST ─▶ EXTRACT ─▶ AUTHOR + RED gate ─┬─ RED ──▶ [Start Work] ─▶ FIX ─▶ VERIFY ─▶ [Merge] ─▶ SOLVED
                                                         └─ GREEN ─▶ [Triage] ─▶ WONT-FIX (no code touched)
                                          two human gates: ① triage   ② merge
```

The walkthrough has four parts. Do them in order:

| Part | You get | Needs |
|---|---|---|
| **1. Run the simulator** | the loop running locally | nothing but Node |
| **2. Walk the two scenarios** | why the two human gates exist | — |
| **3. Bring your own Jam** | your real recordings driving the sim | a Jam account |
| **4. Go to the real pipeline** | the autonomous loop in your repo | Jam + GitHub + CI |

---

## Part 1 — Run the simulator (no accounts, ~2 minutes)

**Prerequisites:** Node 18+ and the repo's root dependencies installed (`npm install`
at the repo root once — AutoDev adds *no* new dependencies; the server runs under
`vite-node`, which the test toolchain already provides, and the dashboard uses Lit,
already a dependency).

From the **repo root**:

```bash
npm run demo
```

This boots both halves and prints the URLs:

- **Dashboard:** <http://localhost:5990>
- **Control plane (API + SSE):** <http://localhost:8787>

Nothing leaves your machine. Issues/labels live in a local JSON file
(`traklet-autodev/.state/`, gitignored). Run the two halves separately with
`npm run demo:server` and `npm run demo:dashboard` if you prefer.

> Tip: set `AUTODEV_STEP_MS=80 npm run demo:server` to make the machine race through
> stages, or a larger value to watch each transition.

---

## Part 2 — Walk the two scenarios (the whole point)

In the dashboard, pick a fixture from the dropdown and click **Record a Jam**. The card
appears in **Intake** and walks the `jam:state/*` board on its own until it reaches a
**human gate**, where it stops and waits for you.

### Scenario A — a real bug (🐞 "STACK50 negative total")

1. **Record it.** The card auto-advances `queued → extracting → authoring`.
2. At **AUTHOR** the RED gate sees the fixture carries a real `500` + a console error,
   so it classifies **RED** (`jam:verdict/bug`) and **rests** in the RED-gate lane.
3. Click **Start Work (approve fix)** — this adds `jam:control/approve-fix`, exactly
   like the Traklet widget's *Start Work* button. The machine runs `fixing → verifying`
   and **rests** at **Review** with a ready PR.
4. Click **Merge PR**. It writes back to the test case and lands on **solved** (issue
   closed). Open **details** on the card to read every stage's artifact (the authored
   spec, the fix diff, the RED→GREEN proof).

### Scenario B — works-as-designed (✅ "FREE100" — the Aracela case)

1. **Record it.** It advances to AUTHOR.
2. The fixture is all-`200`/no-errors, so the RED gate classifies **GREEN** and routes
   to **Triage** — **it does not try to fix anything.** This is the gate that stops the
   loop from "fixing" intended behavior.
3. You decide. Click **Works as designed** → `wont-fix`, issue closed, **zero code
   touched**. (Or **It's a bug** to override the classifier and push it to the RED gate.)

That GREEN-routes-to-human behavior is the single most important property of the whole
design — see [§11 of the pipeline doc](../JAM_TO_RESOLUTION_PIPELINE.md).

---

## Part 3 — Bring your own Jam

Now that you have a Jam account, feed *your* recordings through the simulator. A real
Jam becomes an AutoDev **fixture** — a JSON file in
[`fixtures/jams/`](fixtures/jams/) — and then runs through the exact same loop.

### 3a. Record a good Jam

The pipeline is only as good as the recording. Before you record, your app should have
the [recipe prerequisites](../JAM_TRAKLET_PIPELINE_RECIPE.md#prerequisites--your-project-needs-these-first):
stable `data-testid`s, reusable test helpers, and secret-gated test login/seed
endpoints. Then record the broken flow in Jam (clicks + network + console).

### 3b. Turn the Jam into a fixture (AI-assisted)

A fixture matches the [`JamFixture`](pipeline/interfaces.ts) shape. The fastest way to
produce one is to let an AI read your Jam and emit the JSON. **Copy this prompt** into
Claude/ChatGPT (with Jam MCP connected, or paste the Jam's events/network/console):

```
Convert this Jam recording into a Traklet AutoDev fixture (JSON).

Output ONE JSON object with EXACTLY these fields:
- id: a kebab slug, e.g. "jam-bug-<short>"  (also used as the filename)
- url: the Jam share URL
- title: one line describing the behavior
- author: the tester's email
- createdAt: ISO timestamp
- route: the main route involved, e.g. "/checkout"
- suite: a one-word grouping inferred from the route, e.g. "checkout"
- category: display/grouping ONLY — one of "bug" | "works-as-designed" | "false-red"
            | "broken-selectors". Never used by the classifier.
- specOutcome: what running the authored spec against CURRENT code would do —
    "fail"  the assertion fails (a real bug, OR a false-red if no evidence backs it)
    "pass"  the assertion holds (works-as-designed)
    "error" the selectors/helpers don't resolve (broken-selectors)
- expectedBehavior: one sentence — the CORRECT behavior the tester expected
- metadata: { browser, viewport, env, plan }  (from Jam metadata)
- userEvents: [{ t, type, target, detail }]   (from getUserEvents; target is a selector)
- networkRequests: [{ t, method, url, status, responseBody? }]  (from getNetworkRequests)
- consoleLogs: [{ t, level, text }]            (errors only, from getConsoleLogs)
- assertion: { testid, expect, description }   (the single check that proves the fix)
- expected: { restsAt, terminal, humanAction } — the HELD-OUT acceptance answer:
    bug              -> { restsAt:"red",          terminal:"solved",       humanAction:"approve-fix-then-merge" }
    works-as-designed-> { restsAt:"green-triage",  terminal:"wont-fix",     humanAction:"triage-wad" }
    false-red        -> { restsAt:"needs-human",   terminal:"needs-human",  humanAction:"none" }
    broken-selectors -> { restsAt:"needs-human",   terminal:"needs-human",  humanAction:"none" }

RULES:
- Set specOutcome + the network/console evidence HONESTLY. The RED gate classifies
  RED only when specOutcome is "fail" AND a real 4xx/5xx or console error exists; a
  "fail" with no evidence is a false-red (spec-broken), not a bug. Do NOT invent a
  failure to make something look like a bug.
- `category` and `expected` are the held-out answer — they must be consistent with
  specOutcome + evidence, but the classifier never reads them.
- Use real data-testid selectors from the recording; do not guess.
- Output only the JSON. I will save it to traklet-autodev/fixtures/jams/<id>.json

JAM: [paste the Jam URL, or its getUserEvents / getNetworkRequests / getConsoleLogs / getMetadata output]
```

Save the result as `traklet-autodev/fixtures/jams/<id>.json`. (Prefer it by hand? Copy
an existing fixture and edit the fields — the two shipped fixtures are the reference.)

### 3c. Run it

Reload the dashboard page (the server reads `fixtures/jams/` live), then **Record a
Jam** and pick your new one. It runs through the same gates. If you set `signal` honestly, a real
bug goes RED and a non-bug routes to Triage — proving your recording is pipeline-ready
*before* you spend CI minutes on it.

---

## The three-branch model (enforced, seamless)

The loop runs on `develop → uat → main`, and the branch targets are **fixed constants
the pipeline enforces** — a human never picks a branch ([`branches.ts`](pipeline/branches.ts)):

| Branch | Role | Pipeline relationship |
|---|---|---|
| **develop** | integration · default branch | Traklet widget + workflow + `.mcp.json` live here · **issue-triggered workflows fire from here** · RED gate + fix verify run against its UAT/preview env |
| **uat** | validation | **every pipeline PR bases onto `uat`** · a human merges here (= `solved`) · isolated data, never prod |
| **main** | production | receives `uat → main` promotions on the **release train**, not per-Jam — the loop ends at uat |

The dashboard shows this strip live, and each PR card reads `PR #… → uat`. The two
rules that bite: the workflow must live on the **default branch** (develop) for issue
triggers to fire, and PRs must base onto **uat** (never main). Both are encoded, not
left to a human.

## Acceptance: the pipeline tests itself

`npm run demo:check` runs the whole golden corpus through the state machine headlessly
and asserts every fixture's **held-out** expected outcome plus the branch + safety
invariants (INV-1..5). This is the gate any change to the real pipeline must keep green.

```bash
npm run demo:check
#   4/4 fixtures passed   — incl. "a non-bug is NEVER auto-fixed" (INV-5)
```

Full criteria, invariants, and corpus categories: **[`ACCEPTANCE.md`](ACCEPTANCE.md)**.

## Part 4 — From the simulator to the real pipeline

AutoDev's orchestrator never talks to GitHub/Jam/CI directly — only to four interfaces
([`pipeline/interfaces.ts`](pipeline/interfaces.ts)). Going live is "replace four
implementations," **not** a rewrite:

| Seam | AutoDev (local) | Real |
|---|---|---|
| `IJamSource` | `MockJamSource` (fixtures) | Jam MCP |
| `ITracker` | `LocalTracker` (JSON) | `gh` / `az` REST |
| `Stage` | deterministic functions | headless Claude Code |
| `IDeployTarget` | (Phase B) local server | Vercel preview |

### The ladder (do NOT build the top rung first)

The recipe is explicit: build crawl → walk → run. AutoDev itself is rung 0.

0. **Simulator** — *(done — Parts 1–3)*. Develop and trust the state machine + gates.
1. **Assisted, local** — wire **real Jam MCP**, commit the `jam-to-playwright` skill,
   draft a spec from a real Jam by hand. *90% of the value.*
2. **Issue-triggered author + RED gate** — a GitHub Actions workflow on `issues.labeled`
   opens a draft PR with a correctly-classified spec. Stops at the human gate.
3. **Autonomous fix behind the RED gate** — the gated, anti-cheat fix agent; verify on a
   preview deploy; a human merges.
4. **Zero-touch ingest + resolve** — Jam webhook → auto-filed issue; on merge, write
   back + `traklet sync`.

Full detail per rung: [recipe §"Build it in phases"](../JAM_TRAKLET_PIPELINE_RECIPE.md#build-it-in-phases-the-adoption-ladder--do-not-build-phase-4-first)
and [pipeline §14](../JAM_TO_RESOLUTION_PIPELINE.md#14-phase-plan).

### Scaffold rung 1–2 (AI-assisted)

**Copy this prompt** to scaffold the real pipeline into your app's repo:

```
Help me set up the Jam -> Resolution QA pipeline (rungs 1-2) in my repository.

CONTEXT (read these first):
- Design + state machine + secrets: traklet/JAM_TO_RESOLUTION_PIPELINE.md
- Project-agnostic recipe: traklet/JAM_TRAKLET_PIPELINE_RECIPE.md
- The label vocabulary I will use is jam:state/* · jam:verdict/* · jam:control/* · jam:meta/*

MY SETUP:
- Tracker: [github / azure-devops]   Repo/Org: [...]
- Default branch (where issue-triggered workflows run): [main / develop]
- Pipeline PRs target: [uat]
- Framework: [...]   Per-branch deploys: [Vercel / ...]

DO THIS, IN ORDER:
1. SECRET HYGIENE FIRST. Put my Jam PAT in a CI secret (JAM_PAT) and a gitignored
   .mcp.json that uses ${JAM_PAT} env expansion. Never commit the token. If a PAT is
   already in a tracked or non-ignored file, tell me to rotate it.
2. Add .mcp.json wiring Jam MCP for headless Claude Code.
3. Add the jam-to-playwright skill pointing at my reference spec + test helpers.
4. Add a workflow on `issues: [labeled]`, gated to fire only when jam:state/queued is
   added to a `jam`-labeled issue and jam:control/hold is absent. It must: extract via
   Jam MCP, author a spec + Traklet test case, run the RED gate (RED = fails + a real
   4xx/5xx or console error; GREEN = passes; ERROR = selectors don't resolve), open a
   draft PR to uat, relabel the issue, and STOP at the human gate.

HARD RULES (from the docs — enforce them):
- Two human gates (triage GREEN, merge) — never collapse them.
- False-RED guard: a spec failure with no corroborating network/console signal is
  spec-broken, not red.
- Do NOT build the fix agent (rung 3) yet. Author + classify only. No code edits.
- Issue-triggered workflows run from the DEFAULT branch — put the workflow there.
```

> **Validate your understanding locally first.** Everything that prompt automates, you
> already watched happen in AutoDev with `signal`-driven classification. If a real Jam
> behaves differently than its fixture did in the sim, the recording — not the
> pipeline — is what to fix.

### Secret hygiene (do this the moment you have a real PAT)

The recipe flags this as a Phase-1 prerequisite: keep your **Jam PAT** in a CI secret
and a **gitignored** `.mcp.json` (env-expanded, token-free). If a token ever lands in a
tracked or merely-untracked-but-not-ignored file, **rotate it** — it's been written in
plaintext. See [pipeline §13](../JAM_TO_RESOLUTION_PIPELINE.md#13-secrets--config-inventory).

---

## What's real vs. simulated (so you trust the right things)

This is **Phase A** of AutoDev: the program counter is real; the stage *contents* are
deterministic stand-ins.

| Concern | AutoDev today | Faithful? |
|---|---|---|
| `jam:*` taxonomy ([`labels.ts`](pipeline/labels.ts)) | real | ✅ exact |
| Transition table + two human gates ([`orchestrator.ts`](pipeline/orchestrator.ts)) | real | ✅ exact |
| RED-gate logic + false-RED guard ([`stages/redGate.ts`](pipeline/stages/redGate.ts)) | real, from the recording's evidence | ✅ logic |
| Dedupe on Jam id, attempt cap, `hold` kill switch | real | ✅ |
| The Jam recording | JSON fixture | simulated input |
| Authored spec / fix diff / verify proof | generated text | simulated output |
| The app being fixed | none yet | Phase B |

**AutoDev roadmap:** Phase A (done) → **Phase B** add a small deliberately-buggy app +
a real Playwright RED gate → **Phase C** real fix/verify/resolve + `traklet sync` →
**Phase D** swap each mock seam for Jam MCP / `gh` / the Claude Code action / Vercel.

---

## Layout

```
traklet-autodev/
  fixtures/jams/      canned Jam recordings (the IJamSource input)
  pipeline/
    labels.ts         the jam:* taxonomy + transition table
    interfaces.ts     the four seams
    tracker/          LocalTracker (the label state machine store)
    jam/              MockJamSource
    stages/           extract · author · redGate · fix · verify · resolve
    orchestrator.ts   the platform-independent state-machine driver
  server/             control plane: HTTP API + SSE
  dashboard/          Lit board UI + the two human-gate buttons
  scripts/dev.mjs     boots both halves
```
