# Three-interface architecture

## Supported interfaces

1. Hosted Host Portal at `https://asylum-test.onrender.com/host`
2. Shopify embedded application at `/app`
3. Optional Electron desktop shell

All three use the same Render application, authenticated server routes, Prisma models, PostgreSQL database, and raffle implementation. Electron embeds `/host`; it does not reproduce it.

## Authoritative flow

```text
Browser /host ─────┐
Shopify /app ──────┼── authenticated React Router actions ── Prisma ── PostgreSQL
Electron → /host ──┘
```

Route loaders re-read persisted state after actions through normal React Router revalidation. Electron holds no game-state cache and adds no offline action path. A connection failure hides the failed remote view and offers Retry instead of local operation.

## Concurrency

Wheel shuffle, duration selection, and spin use the wheel row's `status` and `updatedAt` as a compare-and-set precondition. Only one request based on a given persisted version may win. A stale request receives a refresh instruction rather than overwriting the other controller. Completion transitions only `SPINNING` to `COMPLETED`; repeated completion and result acceptance remain idempotent.

## Desktop-only storage

- `persist:asylum-host`: Host authentication cookies
- `persist:asylum-facebook`: isolated Facebook cookies and site storage
- renderer local storage: divider size and Facebook panel visibility
- future desktop preferences: window placement, OBS, hotkeys, and notifications

None of these stores contains authoritative games, claims, wheel order, winners, Second Chance results, prize claims, templates, or settings.

## Release independence

Ordinary UI and raffle-service changes deploy with the web application through Render and appear inside Electron on reload. Shopify configuration continues through Shopify deployment. A new Electron release is needed only for native shell, browser-panel, security, packaging, OBS, or hotkey changes.
