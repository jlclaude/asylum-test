# Asylum Games Desktop

Secure Electron shell for the hosted Host Portal and a separately partitioned Facebook browser.

## Development

From the repository root, run `npm run desktop:dev`. Override the defaults only for development with `ASYLUM_DESKTOP_HOST_URL` and `ASYLUM_DESKTOP_FACEBOOK_URL`.

Run `npm run desktop:typecheck` for validation and `npm run desktop:package:mac` to create unsigned arm64 and x64 development app directories under `desktop/release`.

## Production distribution

Local builds intentionally do not sign or notarize. Public distribution will require an Apple Developer ID Application certificate, hardened runtime/entitlements, notarization credentials, and stapling. Auto-update also requires a signed and notarized artifact plus a configured update publisher/feed; no update server or updater is included in this sprint.

The Host and Facebook partitions never share cookies. `Clear Facebook Login` clears only `persist:asylum-facebook` after operator confirmation.
