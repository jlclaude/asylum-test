import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const claimModel = readFileSync(
  new URL("../app/models/claim.server.ts", import.meta.url),
  "utf8",
);
const localSchema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);
const postgresSchema = readFileSync(
  new URL("../prisma/postgresql/schema.prisma", import.meta.url),
  "utf8",
);
const publicRoute = readFileSync(
  new URL("../app/routes/games.$id.tsx", import.meta.url),
  "utf8",
);
const gameActions = readFileSync(
  new URL("../app/services/game-control-actions.server.ts", import.meta.url),
  "utf8",
);

test("SQLite and PostgreSQL enforce one active-name reservation per game", () => {
  for (const schema of [localSchema, postgresSchema]) {
    assert.match(schema, /model ClaimNameReservation/);
    assert.match(schema, /@@unique\(\[gameId, normalizedDisplayName\]\)/);
    assert.match(schema, /claimId\s+String\s+@unique/);
    assert.match(schema, /normalizedDisplayName\s+String\?/);
  }
});

test("all interactive creation paths use the shared claim model", () => {
  assert.match(publicRoute, /createPublicClaim\(/);
  assert.match(gameActions, /await createClaim\(/);
  assert.match(claimModel, /createClaimWithTransaction\(transaction, input\)/);
  assert.match(claimModel, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(claimModel, /claimNameReservation\.upsert/);
});

test("cancellation releases reservations and edits exclude their own claim", () => {
  assert.match(
    claimModel,
    /claimNameReservation\.deleteMany\([\s\S]*?claimId: claim\.id/,
  );
  assert.match(
    claimModel,
    /assertDisplayNameAvailable\([\s\S]*?normalizedDisplayName,[\s\S]*?claim\.id/,
  );
});

test("public duplicate errors preserve fields and focus the display name", () => {
  assert.match(publicRoute, /const values = \{[\s\S]*?displayName/);
  assert.match(publicRoute, /defaultValue=\{actionData\?\.values\?\.displayName\}/);
  assert.match(publicRoute, /defaultValue=\{actionData\?\.values\?\.facebookHandle\}/);
  assert.match(publicRoute, /defaultValue=\{actionData\?\.values\?\.quantity\}/);
  assert.match(publicRoute, /displayNameRef\.current\?\.focus\(\)/);
  assert.match(publicRoute, /Display names must be unique within this raffle/);
});
