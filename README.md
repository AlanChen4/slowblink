# slowblink

A macOS menu-bar app that periodically captures screenshots of your screen and uses AI to summarize how you're spending your time.

## How it works

slowblink runs in your menu bar and captures a screenshot every few seconds (configurable). Each screenshot is sent to an AI model (OpenAI by default) which returns a short description of what you're doing and a category like "coding", "browsing", or "meeting". Screenshots are analyzed and discarded — only the text summaries are stored locally in a SQLite database.

## Requirements

- macOS 13+
- An [OpenAI API key](https://platform.openai.com/api-keys)

## Install

1. Download the latest `.dmg` from [GitHub Releases](https://github.com/AlanChen4/slowblink/releases)
2. Open the DMG and drag slowblink to Applications
3. First launch: right-click slowblink in Applications → **Open** → **Open** (builds are unsigned, so macOS needs this one-time override)
4. slowblink will appear in your menu bar

## Setup

On first launch, slowblink will ask for two macOS permissions:

- **Screen Recording** — to capture screenshots
- **Accessibility** — to read window titles for better activity context

Grant both in **System Settings > Privacy & Security**. You may need to restart the app after granting permissions.

Then enter your OpenAI API key in the app settings. Your key is encrypted and stored in your macOS Keychain.

## Usage

- Click the menu bar icon to open the main window
- The icon shows capture status: **●** running, **◌** paused, **●!** missing permission or API key
- Right-click the icon to pause/resume capture or quit

## Privacy

slowblink stores all activity data locally on your machine. Screenshots are sent to your configured AI provider for analysis but are not saved to disk. See [PRIVACY.md](PRIVACY.md) for full details.

## Development

```bash
pnpm install
pnpm dev
```

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start in development mode |
| `pnpm build` | Build the app |
| `pnpm package:mac` | Package a macOS DMG |
| `pnpm lint` | Run linter |
| `pnpm typecheck` | Run type checking |
| `pnpm test` | Run tests |

## License

[MPL-2.0](LICENSE)
