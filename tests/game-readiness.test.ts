import assert from "node:assert/strict";
import test from "node:test";

import { evaluateGameReadiness, type ReadinessSnapshot } from "../app/lib/game-readiness.ts";
import { REWARD_CHAMBER_VALUES, rewardChamberCanBeRepaired, rewardChamberEntries } from "../app/lib/reward-chamber.ts";

const claim = (overrides: Partial<ReadinessSnapshot["claims"][number]> = {}) => ({
  id: "claim-a",
  displayName: "Alex Smith",
  quantity: 2,
  status: "CONFIRMED",
  externalPayment: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

function snapshot(overrides: Partial<ReadinessSnapshot> = {}): ReadinessSnapshot {
  return {
    game: {
      id: "game-a",
      title: "Friday Game",
      totalSpots: 20,
      wheelCount: 2,
      secondChanceOffset: 7,
      raffleYear: 2026,
      raffleNumber: 12,
      status: "CLOSED",
      archivedAt: null,
    },
    claims: [claim()],
    run: null,
    paymentInstructionsConfigured: true,
    music: { idleCount: 1, spinCount: 1, unsupportedCount: 0, readable: true },
    prizeClaims: [],
    now: "2026-01-01T01:00:00.000Z",
    ...overrides,
  };
}

function readyRunSnapshot(): ReadinessSnapshot {
  const base = snapshot();
  const nameEntries = [
    { claimId: "claim-a", displayName: "Alex Smith" },
    { claimId: "claim-a", displayName: "Alex Smith" },
  ];
  const wheelBase = {
    roundId: "round-a",
    roundPosition: 1,
    status: "READY" as const,
    spinDurationSeconds: null,
    winnerEntryIndex: null,
    winnerClaimId: null,
    winnerDisplayName: null,
    winnerValue: null,
    shuffledAt: null,
    spunAt: null,
    completedAt: null,
  };
  return {
    ...base,
    game: { ...base.game, status: "READY" },
    run: {
      id: "run-a",
      gameId: base.game.id,
      completedAt: null,
      secondChanceCalculatedAt: null,
      secondChanceSourceWheelId: null,
      secondChanceBeforeDisplayName: null,
      secondChanceBeforeEntryIndex: null,
      secondChanceAfterDisplayName: null,
      secondChanceAfterEntryIndex: null,
      wheels: [
        { ...wheelBase, id: "name-a", position: 1, type: "NAME", label: "Containment A", originalEntriesJson: JSON.stringify(nameEntries), shuffledEntriesJson: JSON.stringify(nameEntries) },
        { ...wheelBase, id: "name-b", position: 2, type: "NAME", label: "Containment B", originalEntriesJson: JSON.stringify(nameEntries), shuffledEntriesJson: JSON.stringify(nameEntries) },
        { ...wheelBase, id: "value", position: 3, type: "VALUE", label: "Reward Chamber", originalEntriesJson: JSON.stringify(rewardChamberEntries()), shuffledEntriesJson: JSON.stringify(rewardChamberEntries()) },
      ],
    },
  };
}

test("healthy closed game with confirmed paid claims is ready", () => {
  const report = evaluateGameReadiness(snapshot());
  assert.equal(report.isReady, true);
  assert.equal(report.blockingCount, 0);
});

test("warnings for missing payment and music do not block opening", () => {
  const report = evaluateGameReadiness(snapshot({
    paymentInstructionsConfigured: false,
    music: { idleCount: 0, spinCount: 0, unsupportedCount: 2, readable: false },
  }));
  assert.equal(report.isReady, true);
  assert.equal(report.warningCount >= 3, true);
});

test("no confirmed paid claims and archived games are blocking", () => {
  const report = evaluateGameReadiness(snapshot({
    game: { ...snapshot().game, archivedAt: "2026-01-01T00:00:00.000Z" },
    claims: [claim({ status: "PENDING", externalPayment: false })],
  }));
  assert.equal(report.isReady, false);
  assert.equal(report.checks.some((item) => item.id === "archive.active" && item.severity === "BLOCKING"), true);
  assert.equal(report.checks.some((item) => item.id === "claims.eligible" && item.severity === "BLOCKING"), true);
});

test("malformed raffle years block readiness while historical years remain valid", () => {
  const malformed = evaluateGameReadiness(snapshot({ game: { ...snapshot().game, raffleYear: 26 } }));
  assert.equal(malformed.checks.find((item) => item.id === "raffle.valid")?.severity, "BLOCKING");
  const historical = evaluateGameReadiness(snapshot({ game: { ...snapshot().game, raffleYear: 2024 } }));
  assert.equal(historical.checks.find((item) => item.id === "raffle.valid")?.severity, "PASS");
});

test("duplicate eligible display names remain valid and repeated", () => {
  const report = evaluateGameReadiness(snapshot({
    claims: [claim({ id: "claim-a", quantity: 1 }), claim({ id: "claim-b", quantity: 1, createdAt: "2026-01-01T00:00:01.000Z" })],
  }));
  assert.equal(report.isReady, true);
  assert.equal(report.checks.find((item) => item.id === "claims.names")?.severity, "PASS");
});

test("blank eligible display names are blocking", () => {
  const report = evaluateGameReadiness(snapshot({ claims: [claim({ displayName: "  " })] }));
  assert.equal(report.checks.find((item) => item.id === "claims.names")?.severity, "BLOCKING");
});

test("healthy initialized run preserves wheel counts, snapshots, and Reward Chamber weighting", () => {
  const report = evaluateGameReadiness(readyRunSnapshot());
  assert.equal(report.isReady, true);
  assert.equal(report.checks.find((item) => item.id === "wheels.reward-values")?.severity, "PASS");
  assert.equal(REWARD_CHAMBER_VALUES.length, 20);
  assert.equal(REWARD_CHAMBER_VALUES.filter((value) => value === "12.5").length, 7);
  assert.equal(REWARD_CHAMBER_VALUES.filter((value) => value === "25").length, 6);
  assert.equal(REWARD_CHAMBER_VALUES.filter((value) => value === "37.5").length, 2);
  for (const value of ["50", "75", "100", "125", "250"] as const) {
    assert.equal(REWARD_CHAMBER_VALUES.filter((entry) => entry === value).length, 1);
  }
  assert.deepEqual(
    rewardChamberEntries().map((entry) => entry.value),
    [...REWARD_CHAMBER_VALUES],
  );
});

test("name-wheel count and snapshot mismatches are blocking", () => {
  const input = readyRunSnapshot();
  input.run!.wheels = input.run!.wheels.filter((wheel) => wheel.id !== "name-b");
  const report = evaluateGameReadiness(input);
  assert.equal(report.checks.find((item) => item.id === "wheels.name-count")?.severity, "BLOCKING");
});

test("malformed JSON becomes a visible blocking check", () => {
  const input = readyRunSnapshot();
  input.run!.wheels[0].originalEntriesJson = "{broken";
  const report = evaluateGameReadiness(input);
  assert.equal(report.checks.find((item) => item.id === "wheels.json")?.severity, "BLOCKING");
});

test("legacy 19-entry READY Reward Chamber provides the safe repair", () => {
  const input = readyRunSnapshot();
  const legacyValues = REWARD_CHAMBER_VALUES.filter((_, index) => index !== 6);
  assert.equal(legacyValues.length, 19);
  input.run!.wheels[2].originalEntriesJson = JSON.stringify(
    legacyValues.map((value) => ({ value })),
  );
  const check = evaluateGameReadiness(input).checks.find((item) => item.id === "wheels.reward-values");
  assert.equal(check?.severity, "BLOCKING");
  assert.equal(check?.repairIntent, "repair-reward-chamber");
});

test("SPINNING and COMPLETED Reward Chambers never offer entry repair", () => {
  for (const status of ["SPINNING", "COMPLETED"] as const) {
    const input = readyRunSnapshot();
    const reward = input.run!.wheels[2];
    reward.status = status;
    reward.originalEntriesJson = JSON.stringify(
      REWARD_CHAMBER_VALUES.slice(1).map((value) => ({ value })),
    );
    if (status === "SPINNING") {
      reward.spunAt = "2026-01-01T00:00:00.000Z";
      reward.winnerEntryIndex = 0;
      reward.winnerValue = "12.5";
    } else {
      reward.spunAt = "2026-01-01T00:00:00.000Z";
      reward.completedAt = "2026-01-01T00:01:00.000Z";
      reward.winnerEntryIndex = 0;
      reward.winnerValue = "12.5";
    }
    const check = evaluateGameReadiness(input).checks.find((item) => item.id === "wheels.reward-values");
    assert.equal(check?.severity, "BLOCKING");
    assert.equal(check?.repairIntent, undefined);
    assert.equal(rewardChamberCanBeRepaired(reward), false);
  }
});

test("Reward Chamber entries remain isolated from name-wheel snapshots", () => {
  const input = readyRunSnapshot();
  const nameEntries = input.run!.wheels
    .filter((wheel) => wheel.type === "NAME")
    .flatMap((wheel) => JSON.parse(wheel.originalEntriesJson) as Array<Record<string, string>>);
  assert.equal(nameEntries.every((entry) => "claimId" in entry && !("value" in entry)), true);
  assert.equal(rewardChamberEntries().every((entry) => !("claimId" in entry)), true);
});

test("an unspun READY Reward Chamber remains safely repairable", () => {
  const reward = readyRunSnapshot().run!.wheels[2];
  assert.equal(rewardChamberCanBeRepaired(reward), true);
});

test("durations below 25 and above 75 are blocking", () => {
  for (const duration of [24, 76]) {
    const input = readyRunSnapshot();
    input.run!.wheels[0].spinDurationSeconds = duration;
    const report = evaluateGameReadiness(input);
    assert.equal(report.checks.some((item) => item.id === "wheel.duration.name-a" && item.severity === "BLOCKING"), true);
  }
});

test("elapsed persisted spin is recoverable without changing its winner", () => {
  const input = readyRunSnapshot();
  input.game.status = "IN_PROGRESS";
  Object.assign(input.run!.wheels[0], {
    status: "SPINNING",
    spinDurationSeconds: 25,
    spunAt: "2026-01-01T00:00:00.000Z",
    winnerEntryIndex: 1,
    winnerClaimId: "claim-a",
    winnerDisplayName: "Alex Smith",
  });
  const report = evaluateGameReadiness(input);
  const recovery = report.checks.find((item) => item.id === "wheel.elapsed.name-a");
  assert.equal(recovery?.severity, "WARNING");
  assert.equal(recovery?.repairIntent, "reconcile-elapsed-spin");
  assert.equal(input.run!.wheels[0].winnerEntryIndex, 1);
});

test("deterministic repeated checks return identical findings", () => {
  const input = readyRunSnapshot();
  assert.deepEqual(evaluateGameReadiness(input), evaluateGameReadiness(input));
});
