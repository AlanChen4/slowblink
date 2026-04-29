# Issue Titles

Issue titles on the GitHub tracker (`AlanChen4/slowblink`) use the same gitmoji prefix convention as commit messages — see the full gitmoji list in [git-workflow.md](git-workflow.md).

## Format

```
<gitmoji> <Short imperative title>
```

Examples:

- `✨ Add Anthropic BYO provider end-to-end`
- `🐛 Fix stale paused state indicator`
- `🏗️ Design AI provider extensibility`
- `♻️ Extract sample-flusher backoff into shared helper`
- `📝 Document Doppler setup for new contributors`

## Picking the gitmoji

Pick the one that best describes the *outcome* of the issue, not the work performed. The most common picks for issues:

| Gitmoji | When to use |
|---------|-------------|
| `✨` | New feature or user-facing capability |
| `🐛` | Bug fix |
| `🏗️` | Architectural change or HITL design ticket producing an ADR |
| `♻️` | Refactor with no behavior change |
| `📝` | Docs-only change |
| `⚡️` | Performance improvement |
| `🔒️` | Security fix |
| `🧱` | Infrastructure (CI, build, deploy) |

For any other case, consult the full list in [git-workflow.md](git-workflow.md).

## Why

Keeps the issue tracker visually scannable in the same vocabulary as the commit log. When an issue is implemented, the resulting commit's gitmoji should usually match the issue's gitmoji (or be a close cousin — e.g. `🏗️` design issue → `✨` implementation commits).

## Where this is enforced

The [`/to-issues`](../skills/to-issues/SKILL.md) skill creates issues. It defers to project-specific title conventions, so this rule is what it follows. The [`/triage`](../skills/triage/SKILL.md) skill does not retitle existing issues — apply the convention manually when triaging legacy issues if needed.
