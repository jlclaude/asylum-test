import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
async function run() {
  const publicRoute = await readFile(join(process.cwd(), "../app/routes/broadcast.tsx"), "utf8");
  const gameRoute = await readFile(join(process.cwd(), "../app/routes/app.games.$id_.broadcast.tsx"), "utf8");
  const hostRoute = await readFile(join(process.cwd(), "../app/routes/host_.games.$id_.broadcast.tsx"), "utf8");
  const presentation = await readFile(join(process.cwd(), "../app/components/broadcast/BroadcastPresentation.tsx"), "utf8");
  const model = await readFile(join(process.cwd(), "../app/models/broadcast.server.ts"), "utf8");
  const css = await readFile(join(process.cwd(), "../app/styles/broadcast-presentation.css"), "utf8");
  const main = await readFile(join(process.cwd(), "main/main.ts"), "utf8");
  const activeGame = await readFile(join(process.cwd(), "main/active-game.ts"), "utf8");
  const engine = await readFile(join(process.cwd(), "main/obs/ObsAutomationEngine.ts"), "utf8");
  assert.doesNotMatch(publicRoute, /<button|<form|<nav|GameModeToolbar|useFetcher/, "public broadcast must remain viewer-only");
  assert.match(publicRoute, /<BroadcastPresentation/); assert.match(gameRoute, /<BroadcastPresentation/); assert.match(hostRoute, /BroadcastModePage/);
  assert.match(gameRoute, /<WheelSection/); assert.match(publicRoute, /<WheelCanvas/); assert.match(presentation, /broadcast-presentation-main/);
  assert.match(css, /grid-template-columns:minmax\(230px,280px\) minmax\(650px,1fr\) minmax\(230px,300px\)/);
  assert.match(css, /width:clamp\(580px,62vh,780px\)/); assert.match(css, /opacity:\.045/); assert.match(css, /height:78px/);
  assert.match(css, /broadcast-information-left/); assert.match(css, /broadcast-information-right/); assert.doesNotMatch(gameRoute, /BroadcastWheelRail|BroadcastGameHeader/);
  assert.match(publicRoute, /Math\.min\(1_000 \* 2 \*\* failures\.current, 15_000\)/); assert.match(publicRoute, /data\.broadcast \?\? lastKnown/);
  assert.doesNotMatch(model, /randomInt|winnerEntryIndex\s*=/, "broadcast model must never calculate winners");
  assert.doesNotMatch(model, /facebookHandle|claimId|prizeClaim|payment/i, "broadcast payload must omit sensitive claim data");
  assert.match(engine, /runtimeEnabled = false/); assert.match(main, /new ObsAutomationEngine\(obsController, obsSettings\)/);
  assert.match(activeGame, /host\/games\/\$\{encodeURIComponent\(gameId\)\}\/broadcast/); assert.match(activeGame, /obsBroadcastUrlFor/);
  assert.match(main, /partition: "persist:asylum-host"[\s\S]*broadcast-preload\.js/); assert.match(main, /broadcast:copy-obs-url/);
  console.info("Shared Broadcast presentation and routing tests passed");
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
