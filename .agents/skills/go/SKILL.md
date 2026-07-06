---
name: go
description: End-of-task workflow for slowblink. Use when the user says "/go" or asks you to wrap up a change by delegating Electron QA, running the thermo review/fix PR loop, and opening or updating a PR.
---

# /go — ship a change

Run this at the end of a coding task to verify the change in the live app through a subagent, clean up the diff through thermo review/fix, and open or update a PR. Execute each phase in order.

## Prerequisites

- Changes are committed-or-ready on the current branch.
- The session is running in a git worktree under `.Codex/worktrees/<name>/` (see [worktree-paths rule](../../rules/worktree-paths.md)). Verify edit paths before writing.

## Phase 1: Delegate Electron QA via agent-browser

The coordinator should delegate Electron app QA to a subagent instead of driving agent-browser directly. The [electron skill](../electron/SKILL.md) has the full agent-browser reference.

1. **Prepare the app target.** Start the dev server with CDP enabled unless an existing usable Electron dev session is already running:

   ```bash
   pnpm dev -- --remote-debugging-port=9222
   ```

   Wait ~10–15s, then confirm the log shows `DevTools listening on ws://127.0.0.1:9222/...`.

   If better-sqlite3 fails with `NODE_MODULE_VERSION` mismatch, rebuild it against Electron:

   ```bash
   npx --yes @electron/rebuild@latest -f -w better-sqlite3
   ```

   Then kill Electron and restart `pnpm dev`.

2. **Spawn a QA subagent.** Tell it:
   - Working directory is the current git worktree.
   - Stay inside this worktree.
   - Use the `electron` skill and agent-browser, not `preview_screenshot`.
   - Connect to the Electron renderer through CDP port 9222.
   - `agent-browser connect 9222` may land on `about:blank`; if so, query CDP directly and connect by websocket URL:

     ```bash
     curl -s http://127.0.0.1:9222/json
     agent-browser connect "ws://127.0.0.1:9222/devtools/page/<id>"
     ```

   - Exercise the changed behavior's golden path and a focused regression sweep.
   - Use `agent-browser snapshot -i` to discover refs, `agent-browser click @eN`, `agent-browser screenshot /tmp/check.png`, and `agent-browser eval '<js>'` as needed.
   - For sidebar/nav items, `Array.from(document.querySelectorAll('[data-sidebar="menu-item"]')).map(el => el.textContent)` is a useful probe.
   - Return a concise QA report with exact flows tested, screenshots or artifact paths if captured, failures, and any untested gaps.

3. **Do non-overlapping coordinator work while the subagent runs.** Review diff shape, prepare likely PR notes, and list focused checks, but do not duplicate the browser QA manually.

4. **Stop the dev server** when done if this workflow started it:
   ```bash
   pkill -f "electron-vite"; pkill -f "Electron"
   ```

If the subagent cannot test the UI (e.g. change isn't renderer-facing, or agent-browser fails to connect), say so explicitly in the PR body and final response — don't claim success.

## Phase 2: Run thermo review/fix PR

Load and follow the [thermo-review-fix-pr](../thermo-review-fix-pr/SKILL.md) skill.

Use the Electron QA subagent's report from Phase 1 as browser QA evidence for the PR body. The thermo workflow owns the maintainability review, fix loop, validation, commit, push, and PR creation/update.

If the subagent tool is unavailable or the review scope is too small to justify delegation, perform the same thermo-nuclear review locally using [thermo-nuclear-code-quality-review](../thermo-nuclear-code-quality-review/SKILL.md), apply high-conviction findings, and continue to Phase 3.

## Phase 3: Create or update the PR

If Phase 2 already committed, pushed, and opened or updated the PR, do not duplicate that work. Verify the PR URL with `gh pr view --json url,state` and skip to reporting.

If Phase 2 stopped before publishing, commit any remaining changes using the [gitmoji convention](../../rules/git-workflow.md). Heredoc the message so newlines survive:

```bash
git commit -m "$(cat <<'EOF'
♻️ Short description (50 chars max)

- Bullet point 1
- Bullet point 2

Co-Authored-By: Codex Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Pick the right gitmoji — `♻️` for refactor, `✨` for feature, `🐛` for bug fix, `💄` for UI polish. See the full list in the git-workflow rule.

Push the branch:

```bash
git push -u origin <branch>
```

Create or update the PR. If no PR exists, create one:

```bash
gh pr create --title "<gitmoji> <title>" --body "$(cat <<'EOF'
## Summary

- What changed and why (1–3 bullets).

## Test plan

- [x] Items the Electron QA subagent verified via agent-browser.
- [ ] Items the human should verify manually (e.g. prod build, permission flows).

🤖 Generated with [Codex](https://Codex.com/Codex)
EOF
)"
```

If a PR already exists on this branch, additional commits update it automatically — no `gh pr edit` needed unless the description changed.

Return the PR URL to the user.

## Reporting back

End with a concise summary:

- What landed in the PR (link it).
- What the Electron QA subagent covered.
- Any thermo review findings that were applied.
- Any caveats (tests you couldn't run, follow-ups worth separate PRs).
