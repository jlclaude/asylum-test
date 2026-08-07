import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const claimModel = read("../app/models/claim.server.ts");
const publicRoute = read("../app/routes/games.$id.tsx");
const gameActions = read("../app/services/game-control-actions.server.ts");
const readiness = read("../app/lib/game-readiness.ts");
const localSchema = read("../prisma/schema.prisma");
const postgresSchema = read("../prisma/postgresql/schema.prisma");

test("display names are not uniquely constrained in either database schema", () => {
  for (const schema of [localSchema, postgresSchema]) {
    assert.doesNotMatch(schema, /normalizedDisplayName/);
    assert.doesNotMatch(schema, /ClaimNameReservation/);
  }
});

test("public, Host, and Shopify claim paths do not check display-name availability", () => {
  assert.match(publicRoute, /createPublicClaim\(/);
  assert.match(gameActions, /await createPublicClaim\(/);
  assert.doesNotMatch(claimModel, /assertDisplayNameAvailable/);
  assert.doesNotMatch(claimModel, /claimNameReservation/);
  assert.doesNotMatch(publicRoute, /already being used|already taken/i);
});

test("claim edits update by claim identity without rejecting another visible name", () => {
  assert.match(claimModel, /where: \{ id: claim\.id \}/);
  assert.match(claimModel, /data: \{ displayName \}/);
  assert.doesNotMatch(claimModel, /excludeClaimId|normalizedDisplayName/);
});

test("readiness explicitly allows duplicate display names", () => {
  assert.match(readiness, /Duplicate names are allowed and retained/);
  assert.doesNotMatch(readiness, /claims\.unique-names/);
});

test("Facebook username remains optional", () => {
  assert.match(publicRoute, /@username \(optional\)/);
  assert.doesNotMatch(publicRoute, /facebookHandle[^\n]*required/);
});
