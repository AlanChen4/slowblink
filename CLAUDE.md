# slowblink

An Electron app that uses AI to track how the user is spending their time on their computer.

## Rules

- [No useEffect](.claude/rules/no-use-effect.md) — Use derived state, event handlers, `useMountEffect`, or `key` props instead of `useEffect`
- [Main process layout](.claude/rules/main-process-layout.md) — AI code in `src/main/ai/`, tightly-coupled code stays together, new domains get subdirectories
- [No section-separator comments](.claude/rules/no-section-comments.md) — Don't add banner/divider comments; split the file instead
- [Git workflow](.claude/rules/git-workflow.md) — Commit with a gitmoji prefix from the provided list

## Skills

- [Electron automation](.agents/skills/electron/SKILL.md) — Automate Electron apps via Chrome DevTools Protocol using agent-browser
