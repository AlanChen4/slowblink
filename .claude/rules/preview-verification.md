# Preview Verification

The default `preview_start` config in [.claude/launch.json](../launch.json) is `replay` — the standalone Vite-served capture viewer at `http://localhost:5174`. That viewer is fine to verify with `preview_screenshot`.

For changes to the Electron renderer, do **not** use `preview_screenshot`, and do **not** ask the user to start the dev server. Manage `pnpm dev` yourself in a Bash background shell, then drive the running Electron app over CDP with `agent-browser`. This is intentionally separate from the `preview_*` MCP tools — the dev loop is a long-lived backgrounded process you own for the session, not a preview config.

## Why

`preview_screenshot` loads the Vite dev URL (`http://localhost:5173`) in a headless browser. The slowblink renderer at that URL is built to run inside Electron's `BrowserWindow` — it depends on the preload bridge (`window.slowblink`) injected by the main process. Loaded in a plain browser, the React tree mounts against `undefined` IPC and the screenshot comes back blank/black.

## Starting the dev server

1. **Probe first.** If CDP is already up, the dev server is already running — skip starting it.
   ```bash
   curl -s http://127.0.0.1:9222/json/version >/dev/null && echo "running"
   ```
2. **Otherwise, start it in a managed background shell.** Use the Bash tool with `run_in_background: true`. Pick `doppler run --` per [doppler.md](doppler.md) when `.doppler.yaml` is present:
   ```bash
   doppler run -- pnpm dev          # or just: pnpm dev
   ```
   The Electron binary launches as a separate GUI process, so macOS screen-recording / accessibility prompts still surface to the user in the foreground — being parented to a background shell doesn't suppress them. If it's a first-run machine without those permissions granted, tell the user to expect the dialogs and approve them.
3. **Wait for CDP** before using agent-browser:
   ```bash
   until curl -s http://127.0.0.1:9222/json/version >/dev/null; do sleep 1; done
   ```
4. **Don't kill the shell at end of task** unless the user asks. They typically want it left running for follow-ups, and electron-vite's HMR keeps picking up file changes.

## Use agent-browser via CDP

The main process opens the Chrome DevTools Protocol port `9222` whenever `!app.isPackaged` (see [src/main/index.ts](../../src/main/index.ts)). Attach with the [electron](../skills/electron/SKILL.md) skill / `agent-browser`:

```bash
agent-browser connect 9222
agent-browser tab                              # confirm the slowblink target is listed
agent-browser screenshot /tmp/check.png        # real Electron window capture
agent-browser eval 'window.slowblink.getStatus().then(s => JSON.stringify(s))'
```

This attaches to the running Electron process, so the screenshot, IPC bridge (`window.slowblink.*`), and DOM snapshot all reflect the actual app — not a browser-only render of the same HTML.

## When `preview_screenshot` is fine

For the rare case where you want to inspect the Vite-served HTML in isolation (e.g. debugging a build artifact). Otherwise, default to agent-browser.
