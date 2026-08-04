import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  MAX_BACKUP_BYTES,
  backupPreview,
  canonicalJson,
  createBackupDocument,
  parseBackupJson,
  restoredPrizeClaimStatus,
  restoredRaffleNextValue,
  type BackupPayload,
} from "../app/lib/backup-format.ts";
import { claimsCsv, prizeClaimsCsv, winnersCsv } from "../app/lib/csv-export.ts";

const date = "2026-08-04T12:00:00.000Z";

function payload(): BackupPayload {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: date,
    shop: "alpha.myshopify.com",
    schemaVersion: "test",
    data: {
      shopSettings: { id: "settings-1", paymentInstructions: "Pay safely", createdAt: date, updatedAt: date },
      templates: [{ id: "template-1", name: "Default", description: null, defaultGameTitle: "Friday", defaultGameDescription: null, totalSpots: 20, pricePerSpot: "10.50", wheelCount: 1, initialStatus: "OPEN", isDefault: true, createdAt: date, updatedAt: date }],
      games: [{ id: "game-1", title: "Friday", description: null, totalSpots: 20, pricePerSpot: "10.50", wheelCount: 1, secondChanceOffset: 7, raffleNumber: 8, status: "COMPLETED", archivedAt: null, createdAt: date, updatedAt: date }],
      claims: [{ id: "claim-1", gameId: "game-1", displayName: "Alex Smith", facebookHandle: null, quantity: 2, comment: null, status: "CONFIRMED", externalPayment: true, expiresAt: null, createdAt: date, updatedAt: date }],
      runs: [{ id: "run-1", gameId: "game-1", startedAt: date, completedAt: date, secondChanceCalculatedAt: date, secondChanceSourceWheelId: "wheel-1", secondChanceBeforeClaimId: "claim-1", secondChanceBeforeDisplayName: "Alex Smith", secondChanceBeforeEntryIndex: 0, secondChanceAfterClaimId: "claim-1", secondChanceAfterDisplayName: "Alex Smith", secondChanceAfterEntryIndex: 1 }],
      rounds: [{ id: "round-1", gameRunId: "run-1", position: 1, title: "Round 1", status: "COMPLETED", startedAt: date, completedAt: date, createdAt: date, updatedAt: date }],
      wheels: [{ id: "wheel-1", gameRoundId: "round-1", position: 1, type: "NAME", status: "COMPLETED", label: "Containment A", originalEntries: [{ claimId: "claim-1", displayName: "Alex Smith" }], shuffledEntries: [{ claimId: "claim-1", displayName: "Alex Smith" }], spinDurationSeconds: 25, winnerEntryIndex: 0, winnerClaimId: "claim-1", winnerDisplayName: "Alex Smith", winnerValue: null, shuffledAt: date, spunAt: date, completedAt: date, resultAcceptedAt: date, createdAt: date, updatedAt: date }],
      prizeClaims: [{ id: "prize-1", gameId: "game-1", gameWheelId: "wheel-1", winnerClaimId: "claim-1", winnerDisplayName: "Alex Smith", wheelLabel: "Containment A", status: "OPEN", expiresAt: null, generatedAt: date, submittedAt: null, reviewedAt: null, fulfilledAt: null, revokedAt: null, preferredPrize: null, prizeOptions: [{ id: "one", label: "Ball" }], selectedPrizeOptionId: null, selectedPrizeOptionLabel: null, selectedPrizeOption: null, selectedBalls: null, recipientName: null, addressLine1: null, addressLine2: null, city: null, stateProvince: null, postalCode: null, country: null, winnerNotes: null, adminNotes: null, createdAt: date, updatedAt: date }],
      raffleSequence: { id: "sequence-1", nextValue: 12, createdAt: date, updatedAt: date },
    },
  };
}

test("versioned backup validates checksum, dates, decimals, JSON entries, and preview", () => {
  const document = createBackupDocument(payload());
  const restored = parseBackupJson(JSON.stringify(document), document.shop);
  assert.deepEqual(restored.data.wheels[0].originalEntries, payload().data.wheels[0].originalEntries);
  assert.equal(restored.data.games[0].pricePerSpot, "10.50");
  assert.equal(restored.exportedAt, date);
  assert.deepEqual(backupPreview(restored), {
    exportedAt: date, games: 1, claims: 1, runs: 1, rounds: 1, wheels: 1,
    templates: 1, prizeClaims: 1, raffleSequenceNextValue: 12, openPrizeLinksRevoked: 1,
  });
});

test("checksum detects modified payload", () => {
  const document = createBackupDocument(payload());
  document.data.games[0].title = "Tampered";
  assert.throws(() => parseBackupJson(JSON.stringify(document), document.shop), /checksum/i);
});

test("duplicate IDs and broken relations are rejected after a valid checksum", () => {
  const duplicatePayload = payload();
  duplicatePayload.data.claims.push({ ...duplicatePayload.data.claims[0] });
  const duplicate = createBackupDocument(duplicatePayload);
  assert.throws(() => parseBackupJson(JSON.stringify(duplicate), duplicate.shop), /duplicate ID/i);

  const relationPayload = payload();
  relationPayload.data.claims[0].gameId = "missing-game";
  const relation = createBackupDocument(relationPayload);
  assert.throws(() => parseBackupJson(JSON.stringify(relation), relation.shop), /missing game/i);
});

test("wrong shop, unsupported version, malformed JSON, unsafe keys, and oversized uploads are rejected", () => {
  const document = createBackupDocument(payload());
  assert.throws(() => parseBackupJson(JSON.stringify(document), "other.myshopify.com"), /different Shopify shop/i);
  const version = { ...document, version: 99 };
  assert.throws(() => parseBackupJson(JSON.stringify(version), document.shop), /version/i);
  assert.throws(() => parseBackupJson("{broken", document.shop), /valid JSON/i);
  assert.throws(() => parseBackupJson('{"__proto__":{}}', document.shop), /unsafe/i);
  assert.throws(() => parseBackupJson("x".repeat(MAX_BACKUP_BYTES + 1), document.shop), /10 MB/i);
});

test("backup shape excludes sessions, access tokens, and prize-link secrets", () => {
  const text = JSON.stringify(createBackupDocument(payload()));
  assert.equal(text.includes("accessToken"), false);
  assert.equal(text.includes("refreshToken"), false);
  assert.equal(text.includes("tokenHash"), false);
  assert.equal(text.includes("encryptedToken"), false);
  assert.equal(text.includes('"Session"'), false);
});

test("canonical serialization converts BigInt to a stable string", () => {
  assert.equal(canonicalJson({ userId: 1234567890123456789n }), '{"userId":"1234567890123456789"}');
});

test("restore safety revokes open prize links and advances raffle sequence past restored numbers", () => {
  assert.equal(restoredPrizeClaimStatus("OPEN"), "REVOKED");
  assert.equal(restoredPrizeClaimStatus("FULFILLED"), "FULFILLED");
  assert.equal(restoredRaffleNextValue(payload().data.games, 2), 9);
  assert.equal(restoredRaffleNextValue(payload().data.games, 20), 20);
});

test("claims CSV is chronological and omits internal IDs", () => {
  const csv = claimsCsv([{ raffleCode: "ASY-000008", gameTitle: "Friday", claims: [
    { id: "later-private", displayName: "Later", quantity: 1, status: "PENDING", externalPayment: false, createdAt: "2026-02-01T00:00:00.000Z" },
    { id: "earlier-private", displayName: "Earlier", quantity: 2, status: "CONFIRMED", externalPayment: true, createdAt: "2026-01-01T00:00:00.000Z" },
  ] }]);
  assert.equal(csv.indexOf("Earlier") < csv.indexOf("Later"), true);
  assert.equal(csv.includes("earlier-private"), false);
  assert.equal(csv.includes("later-private"), false);
});

test("winners CSV uses only persisted winner fields", () => {
  const csv = winnersCsv([{ raffleCode: "ASY-000008", gameTitle: "Friday", archived: false, secondChanceOffset: 7, run: {
    secondChanceBeforeDisplayName: "Before Saved", secondChanceAfterDisplayName: "After Saved",
    rounds: [{ position: 1, title: "Round 1", wheels: [{ position: 1, label: "Containment A", type: "NAME", winnerDisplayName: "Persisted Winner", winnerValue: null, completedAt: date, spinDurationSeconds: 25 }] }],
  } }]);
  assert.match(csv, /Persisted Winner/);
  assert.match(csv, /Before Saved/);
  assert.match(csv, /After Saved/);
});

test("private prize CSV contains fulfillment fields but no tokens", () => {
  const csv = prizeClaimsCsv([{ raffleCode: "ASY-000008", gameTitle: "Friday", winnerDisplayName: "Alex", wheelLabel: "Containment A", status: "SUBMITTED", selectedPrizeOptionLabel: "Two balls", selectedBalls: [{ productTitle: "Ball One", weight: 15 }, { productTitle: "Ball Two", weight: 16 }], recipientName: "Alex Smith", addressLine1: "1 Main St", addressLine2: null, city: "Town", stateProvince: "NY", postalCode: "10001", country: "US", winnerNotes: "Door", generatedAt: date, submittedAt: date, reviewedAt: null, fulfilledAt: null }]);
  assert.match(csv, /Ball One/);
  assert.match(csv, /1 Main St/);
  assert.equal(csv.includes("tokenHash"), false);
  assert.equal(csv.includes("encryptedToken"), false);
});
