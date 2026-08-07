# Asylum Games Desktop

The desktop companion embeds the Host Portal and a persistent Facebook view, and provides a local OBS Studio control panel. Open **Studio**, enable OBS WebSocket under **Tools → WebSocket Server Settings**, then connect to `127.0.0.1:4455`. Remote hosts are rejected. A remembered password is encrypted with the operating system credential facility; when encryption is unavailable it remains session-only.

The Studio panel can refresh and switch scenes, start or stop streaming and recording, and follows OBS scene/output events. Unexpected disconnects use bounded automatic retries. Stopping a stream or recording requires confirmation.

Secure Electron shell for the hosted Host Portal and a separately partitioned Facebook browser.

## Architectural boundary

Electron is an optional interface, never a prerequisite for operating a raffle. The normal browser Host Portal, the Shopify embedded `/app`, and this desktop shell remain complete supported interfaces over the same Render backend and PostgreSQL records. The desktop app loads the production `/host` UI; it contains no raffle engine, game database, authoritative wheel state, or offline mutation queue.

Only desktop preferences and integrations belong locally: window/layout preferences, the isolated Facebook session, and future OBS/hotkey configuration. When the server is unavailable the views show a retryable connection error; the desktop app does not permit offline spins or manufacture results.

The desktop toolbar switches between the hosted portal and Facebook panel, reloads the portal, and opens it in the system browser. “Studio — Coming Later” is intentionally disabled. `main/obs-controller.ts` defines only a future native integration boundary; it is not connected to raffle controls.

Core commands continue through the hosted application's authenticated server actions. PostgreSQL remains authoritative, and critical wheel mutations use conditional writes so a stale controller cannot overwrite a concurrent shuffle, duration selection, spin, completion, or result acceptance from another interface.

## Development

From the repository root, run `npm run desktop:dev`. Override the defaults only for development with `ASYLUM_DESKTOP_HOST_URL` and `ASYLUM_DESKTOP_FACEBOOK_URL`.

Run `npm run desktop:typecheck` for validation and `npm run desktop:package:mac` to create unsigned arm64 and x64 development app directories under `desktop/release`.

## Production distribution

Local builds intentionally do not sign or notarize. Public distribution will require an Apple Developer ID Application certificate, hardened runtime/entitlements, notarization credentials, and stapling. Auto-update also requires a signed and notarized artifact plus a configured update publisher/feed; no update server or updater is included in this sprint.

The Host and Facebook partitions never share cookies. `Clear Facebook Login` clears only `persist:asylum-facebook` after operator confirmation.
