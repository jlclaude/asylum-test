import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function run() {
  const html = await readFile(join(process.cwd(), "renderer/index.html"), "utf8");
  const css = await readFile(join(process.cwd(), "renderer/desktop-shell.css"), "utf8");
  const renderer = await readFile(join(process.cwd(), "renderer/desktop-shell.ts"), "utf8");
  assert.ok(html.indexOf('id="divider"') < html.indexOf('id="obs-panel"'), "divider must precede every lower panel");
  assert.match(html, /Production Studio/); assert.match(html, /OBS Status:/); assert.match(html, /id="studio-error"/);
  assert.match(html, /Program Preview/); assert.match(html, /id="program-preview-image"/); assert.match(html, /Preview status:/);
  assert.match(html, /img-src 'self' data:/, "CSP must permit in-memory OBS preview data URLs");
  assert.match(css, /#divider\s*\{\s*grid-row:\s*3/); assert.match(css, /#facebook-panel, #obs-panel\s*\{\s*grid-row:\s*4/);
  assert.doesNotMatch(css, /#obs-panel[^,{]*:hover|\.studio[^,{]*:hover/i, "Studio root must not have a hover background");
  assert.doesNotMatch(css, /#(?:f00|ff0000)|\b(?:red|crimson)\b/i, "desktop CSS must not contain red debug fills");
  assert.match(renderer, /panel === "facebook" \? rect\(facebookRegion\) : null/, "Studio must hide the Facebook native view");
  assert.match(renderer, /window\.asylumDesktop\?\.obs/, "Studio must guard a missing OBS preload bridge");
  assert.match(renderer, /showStudioFailure/, "renderer errors must produce the Studio fallback");
  assert.match(renderer, /PREVIEW_INTERVAL_MS = 1_000/); assert.match(renderer, /previewInFlight/);
  assert.match(renderer, /document\.visibilityState === "visible"/); assert.match(renderer, /panel === "obs"/);
  assert.match(renderer, /beforeunload.*stopPreviewPolling/); assert.doesNotMatch(renderer, /writeFile|imageFilePath/);
  assert.match(renderer, /candidate\.onerror/); assert.match(renderer, /new Image\(\)/, "frames must decode before replacing the visible preview");
  assert.match(html, /Test Preview/); assert.match(html, /Preview bytes:/); assert.match(renderer, /testProgramPreview/);
  for (const label of ["Host Scene", "Wheel Scene", "Winner Scene", "Second Chance Scene", "Reward Chamber Scene", "Break Scene", "Ending Scene"]) assert.match(html, new RegExp(label));
  assert.match(html, /Switch to Wheel Scene when Spin starts/); assert.match(html, /Return to Host Scene after Accept Result/);
  assert.match(renderer, /saveSceneMappings/); assert.doesNotMatch(renderer, /integration.*scene|raffle.*switchScene/i, "mapping toggles must not execute raffle automation");
  assert.match(html, /Export Studio Profile/); assert.match(html, /Import Studio Profile/); assert.match(html, /Automatic Scene Switching/);
  assert.match(renderer, /testMappedScene/); assert.doesNotMatch(renderer, /data-test-mapping[^\n]*switchScene/, "mapped tests must use the restricted mapped-scene API");
  console.info("Studio layout and fallback tests passed");
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
