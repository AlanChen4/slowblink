# slowblink domain context

This file is the shared glossary for slowblink — the canonical names for the
concepts the code refers to. Keep it short and meaningful to domain readers,
not an exhaustive code reference.

## Capture pipeline

| Term | Meaning |
|---|---|
| **Capture (tick)** | One iteration of the periodic loop: take a screenshot, send it to the LLM, parse the result, insert a row into `samples`. The runner ([src/main/automation/runner.ts](src/main/automation/runner.ts)) runs one capture per tick. |
| **Sample** | A row in the `samples` table — the parsed `{confidence, app, activity}` triple plus window metadata for one tick. The user-facing artifact of a capture. |
| **Provider** | The path the capture takes to an LLM. Two implementations: `byo-openai` (user's own OpenAI key, optionally via Cloudflare AI Gateway) and `cloud-proxy` (slowblink-hosted Edge Function). |
| **DLP block** | The Cloud provider returns `{ blocked: true, reason }` when the upstream gateway flags sensitive content. The capture produces a sample with the placeholder activity `[Blocked by DLP]`. |

## Replay

A debug-only feature for inspecting past LLM classifications. Disabled in
packaged builds; in dev, gated by an explicit toggle. See
[docs/adr/0001-uuidv4-for-local-table-ids.md](docs/adr/0001-uuidv4-for-local-table-ids.md)
for the id convention used by the new table.

| Term | Meaning |
|---|---|
| **Replay** | The feature umbrella. Two halves: a recorder (write side) and a viewer (read side). |
| **Replay recorder** | The tee inside the Electron main process. Runs at the end of every runner tick when the "Replay logging" toggle is on. Writes a row to `dev_captures` and a JPEG to `<userData>/dev-captures/<uuid>.jpg`. **Hard guard**: refuses to write if `app.isPackaged`. |
| **Replay viewer** | A standalone Vite app at `:5174` (`pnpm replay`). Opens `slowblink.db` read-only via `better-sqlite3` middleware and serves capture queries + JPEGs. Read-only; the only mutation is the "Clear all" button. |
| **Capture record** | A single recorded tick — the JPEG that was sent to the LLM, the request envelope, the provider-level response, plus enough metadata to correlate to a `samples` row. Identified by UUIDv4. |
| **Replay logging toggle** | The setting (`replayLogging` in [src/main/settings.ts](src/main/settings.ts)) that gates the recorder. Default off. UI lives in the Dev tab and only renders when `import.meta.env.DEV` is true. |
| **Replay control endpoint** | Dev-only HTTP server in the Electron main process at `127.0.0.1:5175` ([src/main/replay/control-server.ts](src/main/replay/control-server.ts)). Single route `POST /capture` invokes `automation.captureNow()`. Hard guard: refuses to start if `app.isPackaged`. Returns 409 if Replay logging is off. Used by the viewer's "Capture now" button. |

## App icons

| Term | Meaning |
|---|---|
| **App icon** | A macOS-resolved icon for a given app name, stored locally as a base64 data URL keyed by name (table: `app_icons`). Resolved fire-and-forget after each capture (`osascript` + `app.getFileIcon`); cached locally with a 30-day TTL; mirrored to Supabase per user so cross-device "All devices" overviews can render icons for apps the local Mac never had installed. |
| **Negative cache** | An in-memory `Set<string>` of app names whose icon resolution failed during this session. Skipped on re-attempts until the next process restart. Pairs with the 30-day TTL: TTL governs *how often* we re-resolve; the negative cache prevents *retry storms* within a single session when osascript is failing. |
