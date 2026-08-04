/**
 * branches.ts — the three-branch topology, as enforced constants.
 *
 * The model from the recipe: develop -> uat -> main. These are fixed; the
 * pipeline never lets a human pick a branch, which is what makes it seamless and
 * what makes the branch invariants (INV-1..4) mechanically checkable.
 *
 *   develop  default branch · Traklet widget + workflow + .mcp.json live here ·
 *            issue-triggered workflows FIRE from here · RED gate + fix verify
 *            run against its UAT/preview env
 *   uat      every pipeline PR bases onto this · human merges here (= solved) ·
 *            isolated UAT data, never prod
 *   main     production · receives uat -> main promotions on the release train,
 *            NOT per-Jam (the loop ends at uat)
 */

export const BRANCHES = {
  /** Default branch — where issue-triggered workflows run from. */
  default: 'develop',
  /** Base branch every pipeline PR targets. */
  pipelineBase: 'uat',
  /** Production — the loop must never push here. */
  prod: 'main',
} as const;

/** The verify environment the fix is validated against (never prod). */
export const VERIFY_ENV = 'uat-preview';
