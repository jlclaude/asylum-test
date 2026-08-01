import assert from "node:assert/strict";
import test from "node:test";

import { toPublicGameResults } from "../app/lib/game-results.ts";
import { adjacentWheelId, fullscreenIsActive, savedSoundIsMuted, shortcutTargetIsEditable, unfinishedWheelIds, wheelActionBlockReason, wheelScrollBehavior } from "../app/lib/game-mode-operator.ts";
import { formatPublicName } from "../app/lib/public-name.ts";

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
