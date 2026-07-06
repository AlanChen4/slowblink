# slowblink

An Electron app that uses AI to track how the user is spending their time on their computer.

## Rules

- [No useEffect](.Codex/rules/no-use-effect.md) — Use derived state, event handlers, `useMountEffect`, or `key` props instead of `useEffect`
- [Loading skeletons](.Codex/rules/loading-skeletons.md) — Use shadcn `<Skeleton>` shaped like the real content; don't render "Loading…" text
- [Main process layout](.Codex/rules/main-process-layout.md) — AI code in `src/main/ai/`, tightly-coupled code stays together, new domains get subdirectories
- [No section-separator comments](.Codex/rules/no-section-comments.md) — Don't add banner/divider comments; split the file instead
- [Git workflow](.Codex/rules/git-workflow.md) — Commit with a gitmoji prefix from the provided list
- [Issue titles](.Codex/rules/issue-titles.md) — Prefix issue titles with the matching gitmoji (`✨` features, `🐛` bugs, `🏗️` design, etc.)
- [Worktree paths](.Codex/rules/worktree-paths.md) — In a worktree session, verify edit paths and brief subagents to stay inside the worktree root
- [Doppler secrets](.Codex/rules/doppler.md) — Recommended secret manager; when `.doppler.yaml` is present, prefix dev commands with `doppler run --`. Falls back to `.env.local` + `supabase/.env`.
- [Preview verification](.Codex/rules/preview-verification.md) — Verify Electron changes via agent-browser on CDP port 9222, not `preview_screenshot` (the Vite URL renders blank without the preload bridge).

## Skills

- [Electron automation](.agents/skills/electron/SKILL.md) — Automate Electron apps via Chrome DevTools Protocol using agent-browser
- [/go](.agents/skills/go/SKILL.md) — End-of-task workflow: test via agent-browser, run thermo review/fix, then create or update a PR
- [Thermo review/fix PR](.agents/skills/thermo-review-fix-pr/SKILL.md) — Subagent-backed maintainability review, fix loop, validation, and PR publish

## Agent skills

### Issue tracker

Issues live in GitHub Issues at `AlanChen4/slowblink`. Use the `gh` CLI. See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).

### Triage labels

Five canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See [docs/agents/domain.md](docs/agents/domain.md).
