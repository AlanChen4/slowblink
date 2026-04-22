---
description: Parallel multi-agent review of the current branch (security, types, tests, UI consistency, dead code). Applies auto-fixes, re-runs failing checks, and pushes + opens a PR only when all five agents return PASS.
argument-hint: (no args)
---

# /ship — review, auto-fix, then ship

You are the **coordinator**. You spawn five review agents in parallel, collect their JSON verdicts, apply auto-fixable issues, re-run only the failing agents, and push + open the PR when all five return PASS. You do **not** review the code yourself — you orchestrate.

## Phase 0: Preflight

Run these in parallel:
- `git rev-parse --abbrev-ref HEAD` — must not be `main`.
- `git status --porcelain` — must be empty. If not, stop and tell the user to commit or stash.
- `git fetch origin main --quiet` — so the agents' `git diff main...HEAD` sees a current base.
- `git log --oneline main..HEAD` — must be non-empty (there is something to ship).

If any check fails, report the specific failure and stop. Do not continue.

## Phase 1: Spawn all five reviewers in parallel

Send a **single message with five `Agent` tool calls**. Each uses `subagent_type` set to the agent name:

1. `subagent_type: "security-auditor"` — prompt: `"Audit the current branch vs main. Return the JSON verdict per your spec."`
2. `subagent_type: "type-safety-checker"` — prompt: `"Typecheck and scan for weak typing on the current branch. Return the JSON verdict."`
3. `subagent_type: "test-coverage"` — prompt: `"Run the test suite and verify coverage of changed files. Return the JSON verdict."`
4. `subagent_type: "ui-consistency-reviewer"` — prompt: `"Review changed TSX files for drift. Return the JSON verdict."`
5. `subagent_type: "dead-code-detector"` — prompt: `"Run knip and detect stubs on the current branch. Return the JSON verdict."`

Each prompt must also include: `"Working directory is the current git worktree; stay inside it. Output must be a single JSON object matching your agent's schema — no prose around it."`

## Phase 2: Parse the five verdicts

Each agent returns a final message. Extract the JSON from each (strip any stray whitespace / fence). If parsing fails for any agent:
- Re-spawn that single agent once with `"Your previous output was not valid JSON. Return only the JSON object per your schema, nothing else."`
- If it fails again, abort /ship and report the parse failure with the raw text.

Print a one-line status table to the user:

```
security-auditor       PASS | FAIL (<N> errors, <M> warnings)
type-safety-checker    …
test-coverage          …
ui-consistency-reviewer…
dead-code-detector     …
```

## Phase 3: All PASS? → Phase 6.

If every agent's `status` is `"PASS"`, skip ahead to Phase 6.

## Phase 4: Apply auto-fixes (if any)

Collect every issue across all verdicts where `autofix` is a non-null string. For each:
1. Read the cited file.
2. Apply the fix via `Edit`. Keep changes **minimal** — the autofix text describes intent; don't extend it into a broader refactor.
3. If an autofix is ambiguous or you're not confident the edit matches the description, **skip it** and record it as "deferred".

After applying edits:
- Run `pnpm format` once (Biome is fast and deterministic). This keeps downstream lint stable.
- Stage and commit the fixes on their own:
  ```
  git add -u
  git commit -m "$(cat <<'EOF'
  🩹 Apply /ship auto-fixes

  Applied <N> auto-fixable findings from /ship review agents.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```
- If no fixes applied (e.g., all `error` issues had `autofix: null`), skip the commit. There is nothing the coordinator can do automatically — report the findings to the user and **stop**. Do not push.

## Phase 5: Re-run only the failing agents

Spawn only the agents whose previous verdict was FAIL, again in parallel (single message, multiple `Agent` calls). Same prompts as Phase 1.

Parse their new verdicts (Phase 2 logic). Merge with the previous PASSes.

**Loop budget**: up to 3 total iterations (Phase 1 counts as 1). If after iteration 3 anything is still FAIL, abort:
- Report which agents still fail and their remaining `error`-severity issues.
- Tell the user: "Auto-fix loop exhausted. Review the findings above and resolve manually before re-running /ship."
- Do **not** push.

If everything now PASSes, continue.

## Phase 6: Push and open / update the PR

1. `git push -u origin <branch>` (use the branch from Phase 0).
2. Check for an existing PR:
   ```
   gh pr view --json url,state
   ```
   - If it exists and is open: the push has updated it; report the URL.
   - If it doesn't exist: `gh pr create` with title and body:
     ```
     gh pr create --title "<gitmoji> <subject line from latest non-fix commit>" --body "$(cat <<'EOF'
     ## Summary

     - <bullet from commit body or diff overview>

     ## Review

     All five /ship agents returned PASS:
     - security-auditor ✅
     - type-safety-checker ✅
     - test-coverage ✅
     - ui-consistency-reviewer ✅
     - dead-code-detector ✅

     ## Test plan

     - [x] Test suite passes (verified by test-coverage agent).
     - [x] Typecheck passes (verified by type-safety-checker agent).
     - [x] knip clean (verified by dead-code-detector agent).
     - [ ] Manual smoke test in the Electron app.

     🤖 Generated with [Claude Code](https://claude.com/claude-code)
     EOF
     )"
     ```
   Pick the gitmoji from the branch's last substantive commit (see `.claude/rules/git-workflow.md`).

3. Return the PR URL to the user.

## Reporting back

End with a short summary:
- Which agents passed on the first try vs needed autofix rounds.
- Any autofixes applied (1-line per fix, citing file).
- The PR URL.
- Any deferred findings the user should know about.

## Guardrails

- **Never** push if any agent's final verdict is FAIL.
- **Never** apply an autofix you don't understand; skip and defer.
- **Never** modify files yourself outside the autofix loop — the review agents are the source of truth on what's wrong.
- If the working tree is dirty at Phase 0, do not `git stash` silently. Abort and tell the user.
- The Stop hook runs format/lint/typecheck/knip/test after the session ends; Phase 4's `pnpm format` is a courtesy so that hook doesn't immediately re-flag cosmetic issues introduced by autofixes.
