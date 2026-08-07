# Asylum Games Desktop

Secure Electron shell for the hosted Host Portal and a separately partitioned Facebook browser.

## Architectural boundary

Electron is an optional interface, never a prerequisite for operating a raffle. The normal browser Host Portal, the Shopify embedded `/app`, and this desktop shell remain complete supported interfaces over the same Render backend and PostgreSQL records. The desktop app loads the production `/host` UI; it contains no raffle engine, game database, authoritative wheel state, or offline mutation queue.

Only desktop preferences and integrations belong locally: window/layout preferences, the isolated Facebook session, and future OBS/hotkey configuration. When the server is unavailable the views show a retryable connection error; the desktop app does not permit offline spins or manufacture results.

Core commands continue through the hosted application's authenticated server actions. PostgreSQL remains authoritative, and critical wheel mutations use conditional writes so a stale controller cannot overwrite a concurrent shuffle, duration selection, spin, completion, or result acceptance from another interface.

## Development

From the repository root, run `npm run desktop:dev`. Override the defaults only for development with `ASYLUM_DESKTOP_HOST_URL` and `ASYLUM_DESKTOP_FACEBOOK_URL`.

Run `npm run desktop:typecheck` for validation and `npm run desktop:package:mac` to create unsigned arm64 and x64 development app directories under `desktop/release`.

## Production distribution

Local builds intentionally do not sign or notarize. Public distribution will require an Apple Developer ID Application certificate, hardened runtime/entitlements, notarization credentials, and stapling. Auto-update also requires a signed and notarized artifact plus a configured update publisher/feed; no update server or updater is included in this sprint.

The Host and Facebook partitions never share cookies. `Clear Facebook Login` clears only `persist:asylum-facebook` after operator confirmation.
