<p align="center">
  <img src=".github/hero.png" alt="slowblink" width="720" />
</p>

<h1 align="center">slowblink</h1>

<p align="center">
  Screen Time, but it tells you what you <em>actually</em> did.
</p>

<p align="center">
  <a href="https://github.com/AlanChen4/slowblink/releases/latest"><strong>Download for macOS →</strong></a>
</p>

---

- **See what you actually did.** Not "Chrome, 2h" — "Researched React hooks, 47m."
- **Local-first.** Activity stays in a SQLite file on your Mac. Screenshots are discarded after analysis.
- **Bring your own key.** No subscription. Pay your OpenAI usage directly.

## First run

1. Grant **Screen Recording** in System Settings → Privacy & Security
2. Grant **Accessibility** in the same place
3. Add your [OpenAI API key](https://platform.openai.com/api-keys) in slowblink's settings

## Privacy

All activity data stays on your Mac. Screenshots are sent to your AI provider for analysis but never written to disk. Full details in [PRIVACY.md](PRIVACY.md).

## Development

```bash
pnpm install
pnpm dev
```

## License

[MPL-2.0](LICENSE)
