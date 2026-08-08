import assert from "node:assert/strict";
import test from "node:test";
import {
  gameControlRoutes,
  hostGameControlPermissions,
  shopifyGameControlPermissions,
} from "../app/lib/game-control-routes.ts";
import {
  LIVE_CLAIM_REVALIDATION_INTERVAL_MS,
  shouldPollLiveClaims,
} from "../app/lib/live-claim-updates.ts";

test("live claim polling is limited to active OPEN games", () => {
  assert.equal(LIVE_CLAIM_REVALIDATION_INTERVAL_MS, 2_500);
  assert.equal(
    shouldPollLiveClaims({ status: "OPEN", archivedAt: null }),
    true,
  );
  assert.equal(
    shouldPollLiveClaims({
      status: "OPEN",
      archivedAt: "2026-08-08T12:00:00.000Z",
    }),
    false,
  );
  for (const status of ["CLOSED", "READY", "IN_PROGRESS", "COMPLETED"]) {
    assert.equal(shouldPollLiveClaims({ status, archivedAt: null }), false);
  }
});

test("Shopify and Host Game Control Center links stay in their authenticated route families", () => {
  const shopify = gameControlRoutes("SHOPIFY_ADMIN", "game-1");
  const host = gameControlRoutes("HOST_PORTAL", "game-1", "csrf-value");
  assert.deepEqual(
    {
      dashboard: shopify.dashboard,
      settings: shopify.settings,
      play: shopify.play,
      broadcast: shopify.broadcast,
    },
    {
      dashboard: "/app",
      settings: "/app/settings",
      play: "/app/games/game-1/play",
      broadcast: "/app/games/game-1/broadcast",
    },
  );
  assert.deepEqual(
    {
      dashboard: host.dashboard,
      settings: host.settings,
      play: host.play,
      broadcast: host.broadcast,
    },
    {
      dashboard: "/host",
      settings: "/host/settings",
      play: "/host/games/game-1/play",
      broadcast: "/host/games/game-1/broadcast",
    },
  );
  assert.match(host.exportUrl("claims-csv"), /^\/host\/backups\/export\?/);
  assert.match(host.exportUrl("claims-csv"), /csrf=csrf-value/);
  assert.doesNotMatch(shopify.exportUrl("claims-csv"), /csrf=/);
});

test("Host Game Control Center capabilities are derived from server permissions", () => {
  const owner = hostGameControlPermissions([
    "games:manage",
    "claims:manage",
    "wheels:operate",
    "backups:manage",
    "games:archive",
    "games:delete",
    "settings:manage",
    "prizeClaims:manage",
  ]);
  assert.equal(owner.canEditClaims, true);
  assert.equal(owner.canStartGame, true);
  assert.equal(owner.canDelete, true);
  assert.equal(owner.canCreatePrizeClaims, true);

  const viewer = hostGameControlPermissions(["games:view"]);
  assert.deepEqual(
    Object.values(viewer),
    Object.values(viewer).map(() => false),
  );
  assert.ok(Object.values(shopifyGameControlPermissions).every(Boolean));
});
