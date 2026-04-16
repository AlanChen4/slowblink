---
name: go
description: End-of-task workflow for slowblink. Use when the user says "/go" or asks you to wrap up a change by testing in the Electron app, simplifying the diff, and opening or updating a PR. Runs agent-browser against the Electron app, runs the /simplify skill, and creates/updates a pull request with a gitmoji-prefixed commit.
---

# /go — ship a change

Run this at the end of a coding task to verify the change in the live app, clean up the diff, and open or update a PR. Execute each phase in order.

## Prerequisites

- Changes are committed-or-ready on the current branch.
- The session is running in a git worktree under `.claude/worktrees/<name>/` (see [worktree-paths rule](../../rules/worktree-paths.md)). Verify edit paths before writing.

## Phase 1: Test in the Electron app via agent-browser

The [electron skill](../electron/SKILL.md) has the full agent-browser reference. Short version for slowblink:

1. **Start the dev server with CDP enabled.** Use `run_in_background`:
   ```bash
   pnpm dev -- --remote-debugging-port=9222
   ```
   Wait ~10–15s, then confirm the log shows `DevTools listening on ws://127.0.0.1:9222/...`.

2. **If better-sqlite3 fails with `NODE_MODULE_VERSION` mismatch**, rebuild it against Electron:
   ```bash
   npx --yes @electron/rebuild@latest -f -w better-sqlite3
   ```
   Then kill Electron and restart `pnpm dev`.

3. **Find the renderer target.** `agent-browser connect 9222` may land on `about:blank`. Query CDP directly and connect by websocket URL:
   ```bash
   curl -s http://127.0.0.1:9222/json
   # copy the webSocketDebuggerUrl for title "slowblink", then:
   agent-browser connect "ws://127.0.0.1:9222/devtools/page/<id>"
   ```

4. **Exercise the feature.** Use `agent-browser snapshot -i` to discover refs, `agent-browser click @eN`, `agent-browser screenshot /tmp/check.png`, `agent-browser eval '<js>'`. For sidebar/nav items, `Array.from(document.querySelectorAll('[data-sidebar="menu-item"]')).map(el => el.textContent)` is a quick probe.

5. **Confirm golden path + regression sweep.** Click through the new UI, then visit the sections you touched to confirm nothing you removed is still lingering. Screenshot the key states.

6. **Stop the dev server** when done:
   ```bash
   pkill -f "electron-vite"; pkill -f "Electron"
   ```

If you can't test the UI (e.g. change isn't renderer-facing, or agent-browser fails to connect), say so explicitly to the user — don't claim success.

## Phase 2: Run /simplify

Invoke the `simplify` skill via the `Skill` tool. It launches three review agents (reuse, quality, efficiency) in parallel against the current diff and aggregates findings. Apply any actionable fixes; skip false positives. Report what changed (or that the code was already clean).

## Phase 3: Create or update the PR

1. **Commit** any remaining changes using the [gitmoji convention](../../rules/git-workflow.md). Heredoc the message so newlines survive:
   ```bash
   git commit -m "$(cat <<'EOF'
   ♻️ Short description (50 chars max)

   - Bullet point 1
   - Bullet point 2

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```
   Pick the right gitmoji — `♻️` for refactor, `✨` for feature, `🐛` for bug fix, `💄` for UI polish. See the full list in the git-workflow rule.

2. **Push** the branch:
   ```bash
   git push -u origin <branch>
   ```

3. **Create or update the PR.** If no PR exists, create one:
   ```bash
   gh pr create --title "<gitmoji> <title>" --body "$(cat <<'EOF'
   ## Summary

   - What changed and why (1–3 bullets).

   ## Test plan

   - [x] Items you verified via agent-browser.
   - [ ] Items the human should verify manually (e.g. prod build, permission flows).

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```
   If a PR already exists on this branch, additional commits update it automatically — no `gh pr edit` needed unless the description changed.

4. **Return the PR URL** to the user.

## Reporting back

End with a concise summary:
- What landed in the PR (link it).
- What the agent-browser test covered.
- Any findings from /simplify that were applied.
- Any caveats (tests you couldn't run, follow-ups worth separate PRs).
