# Worktree Paths

When a session is running inside a git worktree (working directory under `.claude/worktrees/<name>/`), both the main checkout and the worktree hold real, editable copies of the project. Writing to the wrong one silently corrupts the wrong tree — the edit succeeds, but the dev server, build, and PR see the other file.

## Rules

1. **Verify the first write path.** Before the first `Edit` or `Write` of a session, confirm the absolute target path starts with the worktree root (e.g. `/Users/.../.claude/worktrees/<name>/...`). A path missing the `.claude/worktrees/<name>/` segment is pointing at the main checkout — stop and re-resolve.
2. **Brief subagents about the worktree.** When spawning a search/research subagent (Explore, Plan, general-purpose, etc.), include the worktree root in its prompt and tell it to stay inside that root. Otherwise the agent may return absolute paths from the sibling main-repo checkout, which resolve to real files.
3. **If paths look off, verify before editing.** If a subagent reports paths without the worktree prefix, or references files that don't exist in the worktree (e.g. features not yet on the worktree's branch), that's the signal — don't act on them.

## Detecting the situation

The session system prompt names the worktree explicitly:

```
Primary working directory: /Users/.../.claude/worktrees/<name>
You are operating in a git worktree.
Worktree path: /Users/.../.claude/worktrees/<name>
```

If any of those appear, the rules above apply for the whole session.
