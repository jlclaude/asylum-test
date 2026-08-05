import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicSelector = readFileSync(
  new URL(
    "../app/components/prize-claims/PublicPrizePackageSelector.tsx",
    import.meta.url,
  ),
  "utf8",
);
const packageBuilder = readFileSync(
  new URL(
    "../app/components/prize-claims/PrizePackageBuilder.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("public Domestic weight select uses only the shared weight constant", () => {
  assert.match(publicSelector, /import \{ DOMESTIC_BALL_WEIGHTS,/);
  assert.match(publicSelector, /DOMESTIC_BALL_WEIGHTS\.map/);
  assert.match(publicSelector, /defaultValue=""/);
  assert.match(publicSelector, /<option value="" disabled>Select weight<\/option>/);
  assert.doesNotMatch(publicSelector, /\[\s*13\s*,\s*14\s*,\s*15\s*,\s*16\s*\]/);
});

test("Overseas and Custom prize options do not render a weight field", () => {
  assert.match(publicSelector, /ballType === "DOMESTIC" \? <label>Weight/);
  assert.doesNotMatch(packageBuilder, /ballWeight|DOMESTIC_BALL_WEIGHTS/);
});
