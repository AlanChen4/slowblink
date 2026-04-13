# Main Process File Organization

Keep `src/main/` organized by domain. Do not add top-level files for new concerns — place them in the appropriate subdirectory.

| Directory | Purpose |
|-----------|---------|
| `src/main/ai/` | AI/LLM integration (prompts, model wrappers, summarization) |
| `src/main/` (root files) | Core Electron plumbing: app lifecycle (`index.ts`), IPC (`ipc.ts`), capture loop (`capture.ts`), database (`db.ts`), settings (`settings.ts`), permissions (`permissions.ts`), env (`env.ts`) |

## Rules

1. **AI code goes in `src/main/ai/`** — any module that calls an LLM, builds prompts, or processes AI responses belongs here.
2. **Keep tightly-coupled code together** — if a module is only used by one other module and they share a single concern (e.g., window enumeration is an implementation detail of screen capture), consolidate them into one file rather than splitting across two.
3. **New domains get new directories** — if you're adding a genuinely new concern (e.g., analytics, notifications, sync), create a subdirectory rather than adding more root-level files to `src/main/`.
