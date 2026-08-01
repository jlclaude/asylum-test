import assert from "node:assert/strict";
import test from "node:test";

import { toPublicGameResults } from "../app/lib/game-results.ts";
import { adjacentWheelId, broadcastWheelStatus, defaultActiveWheelId, defaultBroadcastActiveWheelId, fullscreenIsActive, nextUnfinishedWheelId, savedSoundIsMuted, shortcutTargetIsEditable, unfinishedWheelIds, wheelActionBlockReason, wheelScrollBehavior } from "../app/lib/game-mode-operator.ts";
import { formatPublicName } from "../app/lib/public-name.ts";
import { idleRotationAt, remainingSpinSeconds, wheelPositionAt, wheelSpinTotalDegrees } from "../app/lib/wheel-effects.client.ts";
import { broadcastCountdownLabels, shouldAnimateBroadcastCountdown } from "../app/lib/broadcast-countdown.ts";

test("public names use the existing privacy convention", () => {
  assert.equal(formatPublicName("John Quincy Smith"), "John S.");
  assert.equal(formatPublicName("Cher"), "Cher");
});

test("public results preserve order and omit private fields", () => {
  const publicResults = toPublicGameResults({
    completedAt: "2026-01-01T00:00:00.000Z",
    rounds: [{
      title: "Round 1",
      status: "COMPLETED",
      wheels: [
        { label: "Name Wheel 1", type: "NAME", status: "COMPLETED", winner: "John Smith", spinDurationSeconds: 40, completedAt: "2026-01-01T00:00:00.000Z", winningClaimQuantity: 3 },
        { label: "Value Wheel", type: "VALUE", status: "COMPLETED", winner: "125", spinDurationSeconds: 60, completedAt: "2026-01-01T00:01:00.000Z", winningClaimQuantity: null },
      ],
    }],
  });

  assert.deepEqual(publicResults.rounds[0].wheels.map((wheel) => wheel.label), ["Name Wheel 1", "Value Wheel"]);
  assert.equal(publicResults.rounds[0].wheels[0].winner, "John S.");
  assert.equal(JSON.stringify(publicResults).includes("quantity"), false);
  assert.equal(JSON.stringify(publicResults).includes("claimId"), false);
});

test("partial games retain only unfinished active targets", () => {
  const wheels = [{ id: "one", status: "COMPLETED" as const }, { id: "two", status: "READY" as const }, { id: "three", status: "READY" as const }];
  assert.deepEqual(unfinishedWheelIds(wheels), ["two", "three"]);
  assert.equal(adjacentWheelId(["two", "three"], "two", 1), "three");
  assert.equal(adjacentWheelId(["two", "three"], "two", -1), "three");
});

test("shortcut safety blocks form targets and spin without duration", () => {
  assert.equal(shortcutTargetIsEditable({ tagName: "INPUT" }), true);
  assert.equal(shortcutTargetIsEditable({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(shortcutTargetIsEditable({ tagName: "BUTTON" }), false);
  assert.equal(wheelActionBlockReason("spin-wheel", { status: "READY", spinning: false, busy: false, selectedDuration: null }), "Select a random time first.");
  assert.equal(wheelActionBlockReason("spin-wheel", { status: "READY", spinning: false, busy: false, selectedDuration: 30 }), null);
});

test("scroll behavior respects reduced motion", () => {
  assert.equal(wheelScrollBehavior(true), "auto");
  assert.equal(wheelScrollBehavior(false), "smooth");
});

test("sound persistence defaults on and restores a saved mute", () => {
  assert.equal(savedSoundIsMuted(null), false);
  assert.equal(savedSoundIsMuted("false"), false);
  assert.equal(savedSoundIsMuted("true"), true);
});

test("fullscreen state recognizes standard and Safari elements", () => {
  const element = {} as Element;
  assert.equal(fullscreenIsActive(null), false);
  assert.equal(fullscreenIsActive(element), true);
  assert.equal(fullscreenIsActive(null, element), true);
});

test("saved spin recovery resumes only the remaining duration", () => {
  const startedAt = "2026-01-01T00:00:00.000Z";
  const halfway = Date.parse("2026-01-01T00:00:30.000Z");
  const elapsed = Date.parse("2026-01-01T00:02:00.000Z");

  assert.equal(remainingSpinSeconds(startedAt, 60, halfway), 30);
  assert.equal(remainingSpinSeconds(startedAt, 60, elapsed), 0);
});

test("saved spin recovery rejects invalid timing values", () => {
  assert.equal(remainingSpinSeconds("not-a-date", 60), null);
  assert.equal(remainingSpinSeconds("2026-01-01T00:00:00.000Z", 0), null);
  assert.equal(remainingSpinSeconds("2026-01-01T00:00:00.000Z", Number.NaN), null);
});

test("broadcast defaults to and advances through unfinished wheels", () => {
  const wheels = [
    { id: "one", status: "COMPLETED" as const },
    { id: "two", status: "READY" as const },
    { id: "three", status: "READY" as const },
  ];
  assert.equal(defaultActiveWheelId(wheels), "two");
  assert.equal(defaultBroadcastActiveWheelId(wheels), "one");
  assert.equal(nextUnfinishedWheelId(wheels, "two"), "three");
  assert.equal(defaultActiveWheelId(wheels.map((wheel) => ({ ...wheel, status: "COMPLETED" as const }))), "one");
});

test("broadcast cards distinguish selected time and persisted completion", () => {
  assert.equal(broadcastWheelStatus({ status: "READY", spinDurationSeconds: 45 }), "TIME SELECTED");
  assert.equal(broadcastWheelStatus({ status: "COMPLETED", spinDurationSeconds: 45 }), "COMPLETED");
});

test("broadcast countdown is one three-step sequence and respects reduced motion", () => {
  assert.deepEqual(broadcastCountdownLabels(), ["3", "2", "1"]);
  assert.equal(shouldAnimateBroadcastCountdown(false), true);
  assert.equal(shouldAnimateBroadcastCountdown(true), false);
});

function profileVelocity(progress: number, step = 0.0001) {
  return (wheelPositionAt(progress + step) - wheelPositionAt(progress - step)) / (2 * step);
}

test("wheel velocity accelerates once, cruises steadily, then decelerates", () => {
  const acceleration = [0.01, 0.03, 0.05, 0.07, 0.09].map((point) => profileVelocity(point));
  const cruise = [0.2, 0.4, 0.6, 0.75].map((point) => profileVelocity(point));
  const deceleration = [0.82, 0.86, 0.9, 0.94, 0.98].map((point) => profileVelocity(point));

  assert.equal(acceleration.every((velocity, index) => index === 0 || velocity > acceleration[index - 1]), true);
  assert.equal(Math.max(...cruise) - Math.min(...cruise) < 0.00001, true);
  assert.equal(deceleration.every((velocity, index) => index === 0 || velocity < deceleration[index - 1]), true);
});

test("wheel position and velocity remain continuous at phase boundaries", () => {
  for (const boundary of [0.1, 0.8]) {
    assert.equal(Math.abs(wheelPositionAt(boundary - 0.000001) - wheelPositionAt(boundary + 0.000001)) < 0.00001, true);
    assert.equal(Math.abs(profileVelocity(boundary - 0.0002) - profileVelocity(boundary + 0.0002)) < 0.01, true);
  }
  assert.equal(Math.abs(wheelPositionAt(1) - 1) < 1e-12, true);
});

test("30 and 120 second trajectories land on the saved segment center", () => {
  for (const duration of [30, 120]) {
    const entries = 19;
    const winner = 7;
    const finalRotation = wheelSpinTotalDegrees(0, entries, winner, duration) * wheelPositionAt(1);
    const expected = (360 - (winner + 0.5) * (360 / entries) + 360) % 360;
    assert.equal(Math.abs(((finalRotation % 360) + 360) % 360 - expected) < 1e-9, true);
  }
});

test("reload progress resumes the original acceleration, cruise, or deceleration phase", () => {
  assert.equal(profileVelocity(0.05) < profileVelocity(0.1), true);
  assert.equal(Math.abs(profileVelocity(0.5) - profileVelocity(0.7)) < 0.00001, true);
  assert.equal(profileVelocity(0.9) > profileVelocity(0.95), true);
  assert.equal(profileVelocity(0.95) > profileVelocity(0.99), true);
});

test("idle rotation is constant and completes one silent visual turn in 28 seconds", () => {
  assert.equal(idleRotationAt(25, 0), 25);
  assert.equal(idleRotationAt(25, 14_000), 205);
  assert.equal(idleRotationAt(25, 28_000), 385);
});
