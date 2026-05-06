# Preview Verification

The default `preview_start` config in [.claude/launch.json](../launch.json) is `replay` — the standalone Vite-served capture viewer at `http://localhost:5174`. That viewer is fine to verify with `preview_screenshot`.

For changes to the Electron renderer, the dev server is started from the terminal (`doppler run -- pnpm dev` or `pnpm dev`) so screen-recording / accessibility permission prompts can be approved in the foreground. The `slowblink-dev` config in `launch.json` does the same thing but isn't the default. Either way, do **not** verify Electron-app changes with `preview_screenshot`.

## Why

`preview_screenshot` loads the Vite dev URL (`http://localhost:5173`) in a headless browser. The slowblink renderer at that URL is built to run inside Electron's `BrowserWindow` — it depends on the preload bridge (`window.slowblink`) injected by the main process. Loaded in a plain browser, the React tree mounts against `undefined` IPC and the screenshot comes back blank/black.

## Use agent-browser via CDP

The main process opens the Chrome DevTools Protocol port `9222` whenever `!app.isPackaged` (see [src/main/index.ts](../../src/main/index.ts)). Attach with the [electron](../skills/electron/SKILL.md) skill / `agent-browser`:

```bash
agent-browser connect 9222
agent-browser tab                              # confirm the slowblink target is listed
agent-browser screenshot /tmp/check.png        # real Electron window capture
agent-browser eval 'window.slowblink.getStatus().then(s => JSON.stringify(s))'
```

This attaches to the running Electron process, so the screenshot, IPC bridge (`window.slowblink.*`), and DOM snapshot all reflect the actual app — not a browser-only render of the same HTML.

## Workflow

1. Start Electron from a terminal (`doppler run -- pnpm dev`) — or, if permissions are already granted, `preview_start` on the `slowblink-dev` config.
2. Wait for CDP: `until curl -s http://127.0.0.1:9222/json/version >/dev/null; do sleep 1; done`.
3. `agent-browser connect 9222`.
4. Drive the verification — screenshot, `eval` IPC calls, `snapshot -i` for interactive elements, `click`/`fill` for flows.

## When `preview_screenshot` is fine

For the rare case where you want to inspect the Vite-served HTML in isolation (e.g. debugging a build artifact). Otherwise, default to agent-browser.
