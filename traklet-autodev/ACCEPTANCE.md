# Acceptance criteria — what makes the pipeline trustworthy

An autonomous loop that writes tests, edits production code, and closes tickets is only
as safe as its gates and oracles. "Increase the success of a proper build" = define
acceptance criteria at **four layers** and make as many as possible *machine-checkable*.
`npm run demo:check` is where the checkable ones live; this file is the living index.

---

## Layer A — Readiness (preconditions; without these, nothing downstream is trustworthy)

The host app must have these before the pipeline is load-bearing (from the recipe):

- [ ] Stable `data-testid`s on interactive elements
- [ ] One-call test helpers (`loginAsUser`, `seedOrg…`)
- [ ] Secret-gated test login/seed endpoints
- [ ] One canonical reference spec the author mirrors
- [ ] An **isolated** UAT env (a seed there never touches prod)
- [ ] Jam PAT in a CI secret + a gitignored `.mcp.json` (rotate if ever exposed)

Most "the pipeline is flaky" reports are really Layer-A gaps.

## Layer B — Per-stage definition-of-done

| Stage | Acceptance |
|---|---|
| AUTHOR | spec uses only `data-testid`s that exist (grep-verified); RED-first; assertion references the captured failure |
| RED gate | verdict correlates with evidence — RED only on a real 4xx/5xx or console error (false-RED guard) |
| FIX | diff in `app/**`+`lib/**` only; `tests/**` untouched; ≤N files; no skips |
| VERIFY | new spec GREEN + full regression GREEN + re-run on a UAT/preview of the *edited* code; zero regressions |
| RESOLVE | test case written back with RED→GREEN proof + evidence links |

## Layer C — Loop-level acceptance (the golden corpus)

A labeled set of Jam fixtures with **held-out** expected outcomes (`expected` in each
fixture; the classifier never reads it). The loop must reproduce the known answer.
Current corpus in [`fixtures/jams/`](fixtures/jams/):

| Category | specOutcome + evidence | Must rest at | Terminal | Proves |
|---|---|---|---|---|
| `bug` | fail + real 5xx/console error | `red` | `solved` | the happy autonomous path |
| `works-as-designed` | pass | `green-triage` | `wont-fix` | **never auto-fix a non-bug** |
| `false-red` | fail + **no** evidence | `needs-human` | `needs-human` | the false-RED guard + attempt cap |
| `broken-selectors` | error | `needs-human` | `needs-human` | the ERROR path + escalation |

Grow this corpus from your real Jams (Part 3 of the README). More categories to add as
the classifier grows: `environmental`, `flaky`.

## Layer D — Operational / safety invariants (checked by `demo:check`)

| ID | Invariant |
|---|---|
| **INV-1** | every pipeline PR bases onto `uat` (never develop/main) |
| **INV-2** | verify runs against a UAT/preview env, **never prod** |
| **INV-3** | the fix diff stays in `app/**`+`lib/**`; never `tests/`, `.github/`, or the widget |
| **INV-4** | nothing in the loop targets `main` (the loop ends at uat) |
| **INV-5** | a non-bug **never** enters `fixing`/`verifying` (no auto-fix of a non-bug) |

Plus the unchecked-but-required rails: attempt caps, `jam:control/hold` kill switch,
per-issue cost ceiling, revert-on-regression, *loud* escalation (never guess).

---

## The metrics that define "success" (track once live)

| Metric | Why | Target |
|---|---|---|
| RED/GREEN/ERROR precision & recall vs ground truth | misclassification poisons everything | high GREEN recall (never auto-fix a non-bug) |
| **Human merge-approval rate** | the real acceptance test | the number that counts |
| **Post-merge revert / reopen rate** | catches subtly-wrong fixes past the gate | ~0 |
| Escalation (`needs-human`) rate & location | where the loop is weak | acceptable, never silent |
| Agent-minutes per Jam | the cost lever (the fix agent) | capped |

The two human gates are themselves acceptance criteria you can't automate away: merge
approval and revert rate are the top-line signals; everything else is leading.

---

## The irreducible truth

Two human gates — **triage** (is it a bug?) and **merge** (is the fix right?) — never
collapse. `demo:check` proves the *machine* behaves around them; it cannot prove a fix
is *correct*. That's what the merge gate is for. Design for high-signal gates: clear
RED→GREEN evidence, minimal diffs, and full triage context so the human's judgment is
cheap and fast.
