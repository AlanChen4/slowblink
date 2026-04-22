---
description: Autonomous bug-hunting loop — reproduce with a failing test, diagnose, fix, and verify via both the test suite and visual Electron automation. Do not exit until both pass.
argument-hint: <bug description>
---

# /hunt-bug — autonomous reproduce → fix → verify loop

You are hunting down a bug end-to-end. The bug:

> $ARGUMENTS

This is a loop, not a linear task. **Do not exit until both the new test passes AND visual verification in the running Electron app confirms correct behavior.** If either check fails, log what you learned and loop back to diagnosis with that new information.

## Phase 1 — Reproduce with a failing test

1. Read the bug description carefully. Identify:
   - The observable symptom (what the user sees that's wrong).
   - The smallest scenario that triggers it (what state, what action).
   - The invariant being violated (what *should* be true but isn't).
2. Pick the test shape that most directly exercises the invariant:
   - **Unit / component test** (vitest + `@testing-library/react` under `src/**/*.test.{ts,tsx}`) when the bug lives in a pure function, a component's render, or a well-scoped module. This is the default — prefer it.
   - **Main-process test** (vitest, `node` env) when the bug is in `src/main/` logic that doesn't need a renderer.
   - **Electron UI script** (agent-browser via the [electron skill](../skills/electron/SKILL.md)) only when the bug is inherently cross-process and can't be reproduced without the running app. Capture it as a repeatable script or test, not a one-shot manual check.
3. Write the test so it **fails for the right reason** — it should assert on the invariant, not on the current buggy behavior. Verify the failure by running it (`pnpm test <path>`). If it passes unexpectedly, the reproduction is wrong; fix it before moving on.
4. Commit the failing test on its own so the repro is recoverable:
   ```bash
   git add <test path>
   git commit -m "$(cat <<'EOF'
   🧪 Reproduce <short bug name>

   Failing test that asserts <invariant>. Will go green once the fix lands.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

## Phase 2 — Diagnose root cause

Read widely before editing. For state-flow bugs, map all the actors:

- Where does the state *live* (store, module-level var, component state)?
- Who *reads* it — and from which copy?
- Who *writes* it — and what broadcasts does that writing trigger?
- Are there **multiple sources of truth** that can disagree during transitions? This is the pattern behind most "stale indicator" bugs.
- Are there ordering assumptions between broadcasts/events that aren't guaranteed?

Write the hypothesis down (one or two sentences, in your user-facing update) before writing the fix. If the hypothesis is wrong later, that framing makes it obvious.

## Phase 3 — Implement the fix

Fix the root cause, not the symptom. For state-flow bugs, prefer consolidating sources of truth over adding synchronization logic — fewer places that can disagree is better than more code keeping them in sync.

Scope discipline: don't refactor surrounding code, don't add unrelated guards, don't rename things. A bug fix is a bug fix.

## Phase 4 — Verify (both must pass)

### 4a. Test suite

Run the full suite, not just the new test:

```bash
pnpm test
```

The new test must pass. No other test may regress. If the Stop hook runs format/lint/typecheck/knip/test automatically, wait for its verdict and act on any failures before continuing.

### 4b. Visual verification in the running Electron app

Use the [electron skill](../skills/electron/SKILL.md) via agent-browser. Non-negotiable: you are verifying the *real* app, not just the model in the test.

1. Start dev with CDP: `pnpm dev -- --remote-debugging-port=9222` (background). Wait for `DevTools listening on ws://...`. If better-sqlite3 mismatches, rebuild per the electron skill.
2. Connect via the webSocketDebuggerUrl for the `slowblink` page (see the /go skill for the exact `curl`).
3. Reproduce the *original* user scenario from Phase 1 through the UI. Click the buttons, toggle the settings, trigger the transition that was broken.
4. Confirm the visible state is now consistent. Screenshot the key state and check that every UI surface that reflects the bug's domain agrees with every other surface.
5. Regression sweep: click through nearby UI that touches the same state. A "paused" fix could regress "running" rendering; verify both.
6. Stop the dev server: `pkill -f "electron-vite"; pkill -f "Electron"`.

If agent-browser can't connect or the flow can't be driven from the UI, say so explicitly — do **not** claim visual verification based on code reading.

## Phase 5 — Loop on failure

If 4a or 4b fails:

1. In your user-facing update, write one or two sentences: *what did I learn from this failure?* Be specific — "the badge still shows Paused for one render after clicking Resume" beats "it didn't work."
2. Return to Phase 2 with that new information. Your previous hypothesis was incomplete or wrong — refine it before editing again.
3. Re-run both verifications from scratch after the new fix. Don't skip 4a because "nothing test-relevant changed."

Do not cap the iteration count — keep looping until both pass. If you're stuck after several iterations without progress, report what you've tried and what you need from the user; don't silently give up or declare partial success.

## Phase 6 — Simplify

Only after **both** 4a and 4b are clean:

1. Commit the fix (gitmoji `🐛` for bug fix) referring to the failing test now passing.
2. **Run `/simplify`** via the `Skill` tool. It launches reuse / quality / efficiency reviewers in parallel against the diff. Apply any actionable fixes; skip false positives. Common catches for bug fixes:
   - Stale fixtures / dead properties that don't fail the Stop hook because an earlier `&&`-chained step already failed (e.g. `tsc --noEmit -p tsconfig.web.json` is skipped when `tsconfig.node.json` errors first). Run each `tsc -p <config>` separately to confirm.
   - Over-permissive `| null` prop types that are impossible at the actual call sites.
   - Redundant cache / refresh calls you added defensively that the existing subscribers already cover.
3. If `/simplify` applies changes, commit them separately with `♻️`.

## Phase 7 — Open the PR

Push and open (or update) the PR yourself rather than delegating to `/go` — the visual verification from Phase 4b already covers what `/go` would re-run.

1. **Push**: `git push -u origin <branch>` (the branch may be `main` if that's what you're on — check `git status`; if so, push the commits straight to main per the repo convention, otherwise push the feature branch).
2. **Create or update the PR** with `gh pr create` (or rely on auto-update if a PR already exists on this branch). Title uses a gitmoji matching the primary commit (`🐛 …`). Body:
   ```
   ## Summary
   - The bug, one line.
   - The root cause, one line.
   - The fix, one line.

   ## Test plan
   - [x] New test `<path>` — fails before the fix, passes after.
   - [x] Visual verification in Electron via agent-browser (describe what you clicked).
   - [ ] Anything the human should verify manually (packaged build, permission flows).
   ```
3. Return the PR URL to the user.

## Phase 8 — Report

End with a concise summary:
- What the bug was and where the divergent state / root cause lived.
- Commits (test repro + fix + optional simplify) and the PR link.
- Any findings from `/simplify` that were applied.
- Any caveats (tests you couldn't run, follow-ups worth separate PRs).

## Guardrails

- **Never** mark the task complete while any test fails or while visual verification has not been performed.
- **Never** skip Phase 4b by claiming the test is sufficient — the user asked for both because tests can pass while the UI is still wrong (e.g. the test mocks away the real state flow).
- **Never** amend the failing-test commit after fixing. Keep the repro commit intact so the history shows: "test fails" → "fix makes test pass".
- **Never** open the PR before running `/simplify` — that skill has caught real issues (dead properties, unused null-permissive types, redundant refresh calls) that would otherwise land in the PR.
- If the Stop hook runs checks automatically, let it; don't double-run format/lint. But **do** run each `tsc -p <config>` separately once before pushing, since the Stop hook's `&&`-chained typecheck can mask web-config errors when the node-config step fails first.
