---
name: thermo-review-fix-pr
description: Run a subagent-backed thermo-nuclear code quality review, implement the surfaced fixes, validate the result, and create or update the pull request.
---

# Thermo Review, Fix, PR

Use this skill for the full loop:

1. delegate a strict maintainability review to a subagent
2. apply the review findings locally
3. validate the final diff
4. commit, push, and create or update the PR

This workflow is adapted from the Lumos Fellows skill at:
https://github.com/Lumos-Fellows/lumos-fellows-web/tree/main/.agents/skills/thermo-review-fix-pr

## Workflow

1. Load `thermo-nuclear-code-quality-review/SKILL.md`.
2. If any branch, commit, push, or PR work is needed, read the repo's git workflow rules before publishing.
3. Inspect the current branch, working tree, staged changes, remote, and existing PR state.
4. Spawn one read-only subagent to perform a thermo-nuclear review of the current branch changes.
5. While the subagent runs, do non-overlapping local checks: diff shape, obvious call sites, file sizes, and targeted tests to run later.
6. Implement every actionable review finding that is in scope and technically sound.
7. Validate, commit, push, and create or update the PR.

## Subagent Review

Default to spawning a subagent when this skill is triggered. Use an explorer-style subagent when available because the review must be read-only. Skip delegation only when the user opts out, the tool is unavailable, or the review scope is too small to justify the overhead.

Give the subagent:

- repo path and current branch context
- the `thermo-nuclear-code-quality-review` skill as an attached skill item if the tool supports it
- an explicit "do not edit files" instruction
- the exact review scope: current branch changes, maintainability, abstraction quality, spaghetti growth, type boundaries, file-size thresholds, and missed simplifications
- output requirements: prioritized findings with exact file/line references and concrete remedies

Do not block idly while the subagent runs. Continue with local work that does not duplicate the delegated review.

## Apply Findings

Treat the review as input, not as an automatic command.

- Fix blocker and high-conviction findings unless clearly wrong or outside scope.
- Prefer structural simplifications over cosmetic edits.
- Avoid expanding the PR with unrelated refactors.
- Do not revert user or pre-existing changes.
- If the subagent reports checks it ran, do not claim them as local validation unless you also ran them.

After fixes, run another quick local audit for stale imports, dead code, repeated logic, files crossing the 1k-line threshold, and accidental unrelated changes.

If the review finds substantial architecture issues and the fixes are broad, consider asking the same subagent for a second read-only pass before publishing.

## Validation

Run the most focused relevant tests for the changed behavior. Also run low-cost consistency checks such as `git diff --check` and targeted `rg` searches for removed patterns.

Honor repo-specific rules. For slowblink Electron UI changes, verify through agent-browser on CDP port 9222; do not rely on Vite preview screenshots.

If browser QA is relevant but no authenticated session or dev server is available, state that clearly in the PR body and final response.

## Publish

- inspect `git status --short --branch`
- stage explicit files only, not `git add .` or `git add -A`
- use the repo's gitmoji commit and PR title convention
- do not add AI co-author trailers unless the user explicitly asks

If the branch already has a PR, update it by committing and pushing. If no PR exists, create one against the default branch. Open a draft PR unless the user explicitly asks for ready-for-review or the repo guidance says otherwise.

PR body should include:

- summary of what changed
- root cause or quality issue fixed
- review findings addressed
- validation actually performed locally
- explicit gaps, such as browser QA not run

## Final Response

Report:

- PR URL and number
- branch and commit SHA
- review result summary
- fixes applied from the review
- validation run and anything not run
