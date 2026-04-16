# Privacy Policy

_Last updated: April 2026_

slowblink is a desktop application that tracks your computer activity by capturing periodic screenshots and summarizing them with an AI model. This policy explains what data is collected, where it goes, and how to delete it.

## What slowblink collects

Each capture cycle (default: every 5 seconds while you are active) records:

- A screenshot of your primary display (downscaled, JPEG)
- The name of the focused application and its window title
- A list of all open windows and their titles

An AI model analyzes the screenshot and window context to produce a short text summary (e.g. "Writing code in VS Code") and a category (e.g. "coding"). Only the text summary, category, and window metadata are stored. Screenshots are not saved to disk.

## Where your data goes

### Stored locally

All activity data is stored in a SQLite database on your machine at:

```
~/Library/Application Support/slowblink/slowblink.db
```

slowblink does not operate a server and does not transmit your activity data to any service under our control.

### Sent to your AI provider

Each screenshot and the focused window title are sent to the AI provider you configure (OpenAI by default, or Cloudflare AI Gateway if configured) for analysis. This data is subject to your AI provider's privacy policy and data retention practices:

- [OpenAI API Data Usage Policy](https://openai.com/policies/api-data-usage-policies)
- [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/) (if using Cloudflare AI Gateway)

Your API key is encrypted using your operating system's secure credential storage (macOS Keychain) and is never transmitted anywhere other than your configured AI provider.

## What slowblink does not collect

- slowblink does not collect analytics or telemetry
- slowblink does not phone home or contact any server other than your AI provider
- slowblink does not access your camera, microphone, contacts, location, or files
- slowblink does not track you across applications or websites

## macOS permissions

slowblink requests two macOS permissions:

- **Screen Recording** — required to capture screenshots
- **Accessibility** — required to read window titles via AppleScript

These permissions can be revoked at any time in System Settings > Privacy & Security.

## How to delete your data

- Open slowblink and use the "Delete All Data" option in Settings to clear the local database
- To remove everything, also delete the application support folder:
  ```
  rm -rf ~/Library/Application\ Support/slowblink
  ```
- Uninstall the app by dragging it to Trash

Data already sent to your AI provider is subject to their retention policies.

## Changes to this policy

Updates will be posted in this file in the project repository. The "Last updated" date at the top reflects the most recent revision.

## Contact

For questions about this policy, open an issue at [github.com/AlanChen4/slowblink](https://github.com/AlanChen4/slowblink).
