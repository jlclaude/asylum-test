import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

test("Shopify and Host Game Control Center routes use the same service and component", () => {
  const shopify = source("app/routes/app.games.$id.tsx");
  const host = source("app/routes/host.games.$id.tsx");
  for (const shared of ["loadGameControlCenter", "handleGameControlAction", "GameControlCenter"]) {
    assert.match(shopify, new RegExp(shared));
    assert.match(host, new RegExp(shared));
  }
});

test("Shopify, Host, and Electron use the shared hosted wheel service", () => {
  const shopify = source("app/routes/app.games.$id_.play.tsx");
  const host = source("app/routes/host_.games.$id_.play.tsx");
  const desktop = source("desktop/main/main.ts");
  assert.match(shopify, /handleGameModeAction/);
  assert.match(host, /handleGameModeAction/);
  assert.match(desktop, /asylum-test\.onrender\.com|ASYLUM_ORIGIN/);
  assert.doesNotMatch(desktop, /electronSpin|electronShuffle|winnerEntryIndex\s*=/);
});

test("Host Portal and Shopify remain independently runnable without Electron imports", () => {
  const webFiles = [
    "app/routes/host.tsx",
    "app/routes/host_.login.tsx",
    "app/routes/app.tsx",
    "app/routes/app.games.$id.tsx",
  ];
  for (const file of webFiles) assert.doesNotMatch(source(file), /from ["']electron["']|desktop\//);
});

test("Electron source contains no authoritative raffle datastore or offline mutation queue", () => {
  const desktopFiles = readdirSync(join(root, "desktop/main"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => source(`desktop/main/${file}`))
    .join("\n");
  assert.doesNotMatch(desktopFiles, /PrismaClient|sqlite|GameRun|GameRound|electronSpin|offlineQueue/i);
  assert.doesNotMatch(desktopFiles, /ipcMain\.handle\(["'](?:wheel|claim|raffle):/);
});

test("Host and Facebook Electron partitions remain isolated", () => {
  assert.match(source("desktop/main/main.ts"), /persist:asylum-host/);
  assert.match(source("desktop/main/facebook-view.ts"), /persist:asylum-facebook/);
  assert.doesNotMatch(source("desktop/preload/preload.ts"), /cookies|session\.fromPartition/);
});

test("connection loss disables the hosted view and offers only retry", () => {
  const shell = source("desktop/renderer/index.html");
  const main = source("desktop/main/main.ts");
  assert.match(shell, /ASYLUM GAMES CONNECTION LOST/);
  assert.match(shell, /Raffle controls are unavailable until the server reconnects/);
  assert.match(main, /setVisible\(state === "loading" \|\| state === "ready"\)/);
  assert.doesNotMatch(source("desktop/preload/preload.ts"), /shuffle|spin|accept/i);
});

test("wheel mutations expose safe stale-state recovery", () => {
  const model = source("app/models/game-run.server.ts");
  const service = source("app/services/game-mode.server.ts");
  assert.match(model, /class StaleWheelStateError/);
  assert.match(model, /status: "READY",\s*updatedAt: wheel\.updatedAt/);
  assert.match(service, /authoritativeWheel: error\.wheel/);
  assert.match(model, /This wheel changed in another session/);
});

test("result acceptance and Second Chance persistence are idempotent", () => {
  assert.match(source("app/models/game-run.server.ts"), /resultAcceptedAt: null/);
  assert.match(source("app/models/second-chance.server.ts"), /secondChanceCalculatedAt: null/);
});

test("trusted operator context derives shop from authenticated server sessions", () => {
  const operators = source("app/lib/operator-context.server.ts");
  assert.match(operators, /authenticate\.admin\(request\)/);
  assert.match(operators, /requireHostUser\(request\)/);
  assert.doesNotMatch(operators, /formData|get\(["']shop/);
});

test("cross-shop model mutations include a server-derived shop constraint", () => {
  const wheel = source("app/models/game-run.server.ts");
  const claims = source("app/models/prize-claim.server.ts");
  assert.match(wheel, /game: \{ shop, archivedAt: null \}/);
  assert.match(claims, /game: \{ shop: input\.shop \}/);
});
