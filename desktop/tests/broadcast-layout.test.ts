import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
async function run() {
  const route = await readFile(join(process.cwd(), "../app/routes/broadcast.tsx"), "utf8");
  const model = await readFile(join(process.cwd(), "../app/models/broadcast.server.ts"), "utf8");
  const css = await readFile(join(process.cwd(), "../app/styles/production-broadcast.css"), "utf8");
  const main = await readFile(join(process.cwd(), "main/main.ts"), "utf8");
  const engine = await readFile(join(process.cwd(), "main/obs/ObsAutomationEngine.ts"), "utf8");
  assert.doesNotMatch(route, /<button|<form|<nav|GameModeToolbar|useFetcher/, "production broadcast must remain viewer-only");
  for (const state of ["WAITING", "READY", "SPINNING", "WINNER", "SECOND_CHANCE", "REWARD_CHAMBER", "COMPLETED"]) assert.match(model, new RegExp(`"${state}"`));
  assert.match(route, /revalidator\.revalidate/); assert.match(route, /1_000/); assert.match(css, /overflow:\s*hidden/); assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /grid-template-rows: 110px minmax\(0, 1fr\) 58px/); assert.match(css, /grid-template-columns: minmax\(240px, 280px\) minmax\(620px, 1fr\) minmax\(240px, 300px\)/);
  assert.match(css, /width: clamp\(520px, 62vh, 760px\)/); assert.match(css, /\.broadcast-brand-logo[^}]*height: 84px/s);
  assert.match(css, /@media \(max-width: 1399px\)/); assert.match(css, /@media \(max-width: 1099px\)/); assert.match(css, /@media \(max-width: 899px\)/);
  assert.doesNotMatch(route, /broadcast-lower|winner-area|second-area/); assert.match(route, /broadcast-status-panel/); assert.match(route, /broadcast-result/);
  assert.match(route, /BROADCAST TEMPORARILY UNAVAILABLE/); assert.match(route, /SELECT AN ACTIVE RAFFLE/); assert.match(route, /RAFFLE COMPLETE/); assert.match(route, /READY TO SPIN/); assert.match(route, /REWARD CHAMBER RESULT/);
  assert.match(route, /Math\.min\(1_000 \* 2 \*\* failures\.current, 15_000\)/); assert.match(route, /data\.broadcast \?\? lastKnown/); assert.match(route, /asylumBroadcastDesktop/);
  assert.match(css, /broadcast-safe-zone/); assert.match(css, /state-spinning \.broadcast-wheel/); assert.match(css, /broadcast-connection-overlay/);
  assert.doesNotMatch(model, /randomInt|winnerEntryIndex\s*=/, "broadcast model must never calculate winners");
  assert.doesNotMatch(model, /facebookHandle|claimId|prizeClaim|payment/i, "broadcast payload must omit sensitive claim data");
  assert.match(engine, /runtimeEnabled = false/); assert.match(main, /new ObsAutomationEngine\(obsController, obsSettings\)/, "production automation must remain hard-disabled");
  assert.match(main, /broadcast:retry/); assert.match(main, /candidate\.broadcastUrl/); assert.match(route, /BROADCAST_GAME_ID/);
  assert.match(main, /did-navigate-in-page/); assert.match(main, /did-navigate/); assert.match(main, /ActiveGameStore/);
  console.info("Broadcast foundation and automation rollback tests passed");
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
