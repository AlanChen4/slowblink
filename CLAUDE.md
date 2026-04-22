# slowblink

An Electron app that uses AI to track how the user is spending their time on their computer.

## Rules

- [No useEffect](.claude/rules/no-use-effect.md) — Use derived state, event handlers, `useMountEffect`, or `key` props instead of `useEffect`
- [Main process layout](.claude/rules/main-process-layout.md) — AI code in `src/main/ai/`, tightly-coupled code stays together, new domains get subdirectories
- [No section-separator comments](.claude/rules/no-section-comments.md) — Don't add banner/divider comments; split the file instead
- [Git workflow](.claude/rules/git-workflow.md) — Commit with a gitmoji prefix from the provided list
- [Worktree paths](.claude/rules/worktree-paths.md) — In a worktree session, verify edit paths and brief subagents to stay inside the worktree root
- [Doppler secrets](.claude/rules/doppler.md) — Recommended secret manager; when `.doppler.yaml` is present, prefix dev commands with `doppler run --`. Falls back to `.env.local` + `supabase/.env`.

## Skills

- [Electron automation](.agents/skills/electron/SKILL.md) — Automate Electron apps via Chrome DevTools Protocol using agent-browser
- [/go](.claude/skills/go/SKILL.md) — End-of-task workflow: test via agent-browser, run /simplify, then create or update a PR
- [/ship](.claude/commands/ship.md) — Parallel multi-agent review (security, types, tests, UI consistency, dead code), auto-fix loop, then push + PR

## Review agents

The `/ship` workflow spawns five specialist agents in parallel. Each returns a structured JSON verdict; `/ship` is the coordinator that applies auto-fixable findings, re-runs failing agents (up to 3 iterations), and only pushes + opens a PR when every agent returns PASS.

- [security-auditor](.claude/agents/security-auditor.md) — Secret leakage, Supabase RLS, Electron IPC validation, injection surfaces
- [type-safety-checker](.claude/agents/type-safety-checker.md) — `tsc` + weak typing (`any`, unsafe casts, Zod gaps on boundaries)
- [test-coverage](.claude/agents/test-coverage.md) — `pnpm test` + new code paths have tests + no stray `.only`/`.skip`
- [ui-consistency-reviewer](.claude/agents/ui-consistency-reviewer.md) — Inline hex colors, duplicated status strings, spacing drift in TSX
- [dead-code-detector](.claude/agents/dead-code-detector.md) — `knip` + stub implementations + unused exports

Agents are read-only: they report, the coordinator decides. An agent can be invoked standalone via the `Agent` tool with `subagent_type: "<agent-name>"` when you want just one facet reviewed without the full ship loop.
