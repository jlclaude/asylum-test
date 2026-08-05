import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicGame = readFileSync(
  new URL("../app/routes/games.$id.tsx", import.meta.url),
  "utf8",
);
const gameControl = readFileSync(
  new URL(
    "../app/components/game-control/GameControlCenter.tsx",
    import.meta.url,
  ),
  "utf8",
);
const claimModel = readFileSync(
  new URL("../app/models/claim.server.ts", import.meta.url),
  "utf8",
);

test("public and shared admin claim forms use the optional Facebook label", () => {
  for (const source of [publicGame, gameControl]) {
    assert.match(source, /Facebook @username \(optional\)/);
    assert.match(source, /placeholder="@username \(optional\)"/);
    assert.match(source, /Optional\. Used only to help identify your Facebook/);
    assert.match(source, /profile[\s\n ]*if you know it\./);
  }
});

test("Facebook username inputs have no required constraint", () => {
  for (const source of [publicGame, gameControl]) {
    const inputStart = source.indexOf('name="facebookHandle"');
    assert.notEqual(inputStart, -1);
    const inputEnd = source.indexOf("/>", inputStart);
    assert.doesNotMatch(source.slice(inputStart, inputEnd), /\brequired\b/);
    assert.doesNotMatch(source, /Facebook username is required/i);
  }
});

test("empty Facebook usernames remain valid and persist as optional null", () => {
  for (const source of [publicGame, gameControl]) {
    assert.doesNotMatch(source, /if\s*\(\s*!facebookHandle\s*\)/);
  }
  assert.match(claimModel, /facebookHandle:\s*input\.facebookHandle \|\| null/);
});
