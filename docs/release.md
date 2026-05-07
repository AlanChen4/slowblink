# Releasing slowblink

slowblink ships as a signed + notarized macOS DMG attached to a GitHub Release. The release workflow lives in [.github/workflows/release.yml](../.github/workflows/release.yml) and is triggered three ways:

| Trigger | What happens |
|---|---|
| Push a tag matching `v*` (e.g. `v0.3.0`) | Builds, signs, notarizes, publishes to a GitHub Release. |
| Push a commit on `main` that bumps `package.json#version` | Same as above. |
| Manually via **Actions → Release → Run workflow** | Dry run by default: builds, signs, notarizes, attaches the DMG as a workflow artifact (no Release created). Tick `publish` to also publish to a Release. |

The unsigned smoke-test build in [.github/workflows/ci.yml](../.github/workflows/ci.yml) runs on every PR — it verifies the app packages but never signs. Signing only happens on `release.yml`.

## What lives where

- **electron-builder config**: [electron-builder.yml](../electron-builder.yml). `mac.notarize: true` + `mac.hardenedRuntime: true` tell electron-builder to sign with the imported Developer ID cert and submit to Apple's notary service.
- **Entitlements**: [build/entitlements.mac.plist](../build/entitlements.mac.plist). The minimum needed for an Electron app + AppleEvents (window-title reads). Notarization will reject a hardened-runtime build that runs JS without `com.apple.security.cs.allow-jit`.
- **TCC strings**: still in `electron-builder.yml` under `mac.extendInfo` (`NSScreenCaptureUsageDescription`, `NSAppleEventsUsageDescription`). These show up in macOS permission prompts.
- **Dev-electron ad-hoc signing**: [scripts/sign-dev-electron.sh](../scripts/sign-dev-electron.sh), unrelated to release signing — it stabilizes TCC permissions for `pnpm dev`.

## One-time setup

The CI signing path needs six GitHub Actions secrets. Generate them once, store them, you're done until cert expiry (5 yrs) or you revoke an API key.

### 1. Apple Team ID

<https://developer.apple.com/account> → "Membership details" → copy the 10-character Team ID.

### 2. Developer ID Application certificate (.p12 + password)

Done from a Mac with Keychain Access:

1. **Keychain Access** → menu **Certificate Assistant** → **Request a Certificate from a Certificate Authority…**
2. Email = your Apple ID email; Common Name = `slowblink Developer ID`; tick **Saved to disk**. Save the `.certSigningRequest`.
3. <https://developer.apple.com/account/resources/certificates/add> → **Developer ID Application** → upload the CSR → download the resulting `.cer`.
4. Double-click the `.cer` to import it into the **login** keychain.
5. In Keychain Access, find "Developer ID Application: <Your Name> (TEAMID)". Expand to reveal the private key, then right-click the cert → **Export…** → format **Personal Information Exchange (.p12)** → set a strong password and save it. This password becomes `MAC_CERTS_PASSWORD`.
6. Base64-encode without line wraps:
   ```bash
   base64 -i Certificates.p12 -o cert.p12.b64
   ```
   `cert.p12.b64` contents = `MAC_CERTS_BASE64`.

Save the `.p12` and its password in your password manager — they are reusable.

### 3. App Store Connect API key (.p8)

1. <https://appstoreconnect.apple.com/access/integrations/api> → **Team Keys** tab → **Generate API Key** (or **+**).
2. Name = `slowblink CI`; Access = **Developer**.
3. Download the `.p8`. Apple lets you do this exactly once — keep it safe.
4. Note the **Key ID** (10 chars) and **Issuer ID** (UUID, top of the page).
5. Base64-encode:
   ```bash
   base64 -i AuthKey_<KEYID>.p8 -o api-key.p8.b64
   ```

### 4. Add the GitHub Actions secrets

<https://github.com/AlanChen4/slowblink/settings/secrets/actions> → **New repository secret** for each:

| Secret | Source |
|---|---|
| `MAC_CERTS_BASE64` | contents of `cert.p12.b64` |
| `MAC_CERTS_PASSWORD` | the password from step 2.5 |
| `APPLE_API_KEY_BASE64` | contents of `api-key.p8.b64` |
| `APPLE_API_KEY_ID` | the Key ID from step 3.4 |
| `APPLE_API_ISSUER` | the Issuer ID from step 3.4 |
| `APPLE_TEAM_ID` | the Team ID from step 1 |

That's it for setup. The first dry run will confirm everything works end-to-end.

## Cutting a release

1. Bump `version` in [package.json](../package.json) (semver, e.g. `0.2.0` → `0.2.1`).
2. Commit on `main` (or push a `vX.Y.Z` tag — both trigger the workflow).
3. Watch **Actions → Release**. The `build-mac` job takes ~6–12 min; most of that is notarization waiting on Apple.
4. Confirm the GitHub Release page shows two DMGs (`-x64.dmg`, `-arm64.dmg`) and `latest-mac.yml`.

## Dry-running the pipeline

When you change anything in `release.yml`, `electron-builder.yml`, or the entitlements file, dry-run before tagging:

1. **Actions → Release → Run workflow**. Leave `publish` unchecked.
2. After ~10 min, the run page shows an **Artifacts** section with `dmg-dry-run-<sha>` — download and inspect locally:
   ```bash
   spctl --assess --type open --context context:primary-signature -vv slowblink-*.dmg
   # → "accepted, source=Notarized Developer ID"
   ```
3. Mount the DMG, drag to Applications, launch on a machine where slowblink isn't installed. No Gatekeeper warning = green.

## Local builds

`pnpm package:mac` still works locally. With nothing set, electron-builder auto-discovers a Developer ID cert in your login keychain — useful when you've imported the cert (after the one-time setup) and want to verify a signed-but-not-notarized build before pushing. To force unsigned (e.g. on a clean machine without the cert), prefix:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package:mac
```

Local builds never notarize unless you also export `APPLE_TEAM_ID`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER` and place the `.p8` at `~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8`. In practice, push to CI for distributable builds.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "No identity found" | `MAC_CERTS_BASE64` is missing, mis-encoded, or password wrong. Re-export the `.p12` and re-`base64 -i`. |
| Notarization fails with "The signature does not include a secure timestamp" | Hardened runtime not enabled. Check `electron-builder.yml#mac.hardenedRuntime: true`. |
| Notarization fails citing a specific entitlement | Add the entitlement to [build/entitlements.mac.plist](../build/entitlements.mac.plist). Common ones: `com.apple.security.cs.disable-library-validation` if a future native dep loads unsigned dylibs. |
| Notarization "in progress" forever | Apple notary can be slow; electron-builder polls for ~30 min before failing. If consistently slow, check <https://developer.apple.com/system-status/>. |
| `spctl --assess` says "rejected, source=Unnotarized" | Build wasn't notarized (e.g. CI signed but failed before notary). Re-run the workflow. |
| Cert expired | Repeat step 2 above with a fresh CSR; replace `MAC_CERTS_BASE64` + `MAC_CERTS_PASSWORD`. The Team ID and API key stay valid. |
