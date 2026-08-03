import assert from "node:assert/strict";
import test from "node:test";

import { toPublicGameResults } from "../app/lib/game-results.ts";
import { adjacentWheelId, broadcastWheelStatus, defaultActiveWheelId, defaultBroadcastActiveWheelId, defaultGameModeActiveWheelId, fullscreenIsActive, nextUnfinishedWheelId, savedSoundIsMuted, shortcutTargetIsEditable, unfinishedWheelIds, wheelActionBlockReason, wheelScrollBehavior } from "../app/lib/game-mode-operator.ts";
import { formatPublicName } from "../app/lib/public-name.ts";
import { claimNameEditBlockReason, replaceClaimDisplayNameInEntries, validateClaimDisplayName } from "../app/lib/claim-display-name.ts";
import { isPrizeClaimExpired, prizeClaimExpirationDate, validatePrizeClaimSubmission } from "../app/lib/prize-claim.ts";
import { generatePrizeClaimToken, hashPrizeClaimToken } from "../app/lib/prize-claim-token.server.ts";
import { formatRaffleCode, parseRaffleSearch } from "../app/lib/raffle-number.ts";
import { getContainmentLabel, getWheelDisplayLabel } from "../app/lib/wheel-labels.ts";
import { idleRotationAt, remainingSpinSeconds, wheelPositionAt, wheelSpinTotalDegrees } from "../app/lib/wheel-effects.client.ts";
import { getWinningRestRotation, normalizeDegrees } from "../app/lib/wheel-geometry.ts";
import {
  chooseRandomTrack,
  getSpinMusicSnapshot,
  loopingPlaybackOffset,
  subscribeToSpinMusic,
} from "../app/lib/wheel-music.ts";
import { broadcastCountdownLabels, shouldAnimateBroadcastCountdown } from "../app/lib/broadcast-countdown.ts";
import { normalizeDashboardGameCounts } from "../app/lib/dashboard-game-counts.ts";
import {
  archiveBlockReason,
  deleteConfirmationMatches,
  duplicateGameTitle,
} from "../app/lib/game-administration.ts";
import {
  gameTemplateValues,
  gameSetupTemplateInput,
  validateGameTemplate,
} from "../app/lib/game-template-validation.ts";
import { renderGameInstructionVariables } from "../app/lib/game-instruction-variables.ts";
import { formatOrdinal } from "../app/lib/ordinal.ts";
import { secondChanceResultForWheel, selectSecondChanceEntries, toPublicSecondChanceResult } from "../app/lib/second-chance.ts";

test("template default game descriptions preserve spacing and raw variables", () => {
  const description = "  Welcome!\n\nHow to play:\n1. Claim.\n2. Pay.\n\nOffset: {{SECOND_CHANCE_NUMBER}} / {{SECOND_CHANCE_ORDINAL}}\n  Indented note\n";
  const formData = new FormData();
  formData.set("name", "Formatted template");
  formData.set("defaultGameDescription", description);
  formData.set("totalSpots", "25");
  formData.set("pricePerSpot", "5");
  formData.set("wheelCount", "2");
  formData.set("initialStatus", "OPEN");

  const values = gameTemplateValues(formData);
  const validation = validateGameTemplate(values);
  assert.equal(values.defaultGameDescription, description);
  assert.equal(validation.input?.defaultGameDescription, description);
});

test("raffle codes use the permanent six-digit Asylum format", () => {
  assert.equal(formatRaffleCode(1), "ASY-000001");
  assert.equal(formatRaffleCode(12), "ASY-000012");
  assert.equal(formatRaffleCode(347), "ASY-000347");
  assert.equal(formatRaffleCode(999999), "ASY-999999");
  assert.throws(() => formatRaffleCode(0));
  assert.throws(() => formatRaffleCode(1.5));
  assert.throws(() => formatRaffleCode(1000000));
  assert.equal(parseRaffleSearch("ASY-000347"), 347);
  assert.equal(parseRaffleSearch("000347"), 347);
  assert.equal(parseRaffleSearch("347"), 347);
  assert.equal(parseRaffleSearch("not-a-raffle"), null);
});

test("wheel labels use containment letters and Reward Chamber", () => {
  assert.equal(getContainmentLabel(1), "Containment A");
  assert.equal(getContainmentLabel(2), "Containment B");
  assert.equal(getContainmentLabel(26), "Containment Z");
  assert.equal(getContainmentLabel(27), "Containment AA");
  assert.equal(getContainmentLabel(52), "Containment AZ");
  assert.equal(getContainmentLabel(53), "Containment BA");
  assert.equal(getWheelDisplayLabel("VALUE", 21), "Reward Chamber");
  assert.throws(() => getContainmentLabel(0));
});
import {
  PAYMENT_INSTRUCTIONS_MAX_LENGTH,
  publicPaymentInstructionsPayload,
  validatePaymentInstructions,
} from "../app/lib/payment-instructions.ts";

test("payment instructions preserve internal lines, trim edges, and allow clearing", () => {
  assert.deepEqual(validatePaymentInstructions("  PayPal: host@example.com\nVenmo: @host  "), {
    value: "PayPal: host@example.com\nVenmo: @host",
  });
  assert.deepEqual(validatePaymentInstructions("   \n  "), { value: "" });
  assert.equal(Boolean(validatePaymentInstructions("x".repeat(PAYMENT_INSTRUCTIONS_MAX_LENGTH + 1)).error), true);
});

test("public payment payload exposes only plain instruction text", () => {
  const unsafeLookingText = "<script>alert('no')</script>\nhttps://example.com";
  assert.equal(publicPaymentInstructionsPayload({ paymentInstructions: unsafeLookingText }), unsafeLookingText);
  assert.equal(publicPaymentInstructionsPayload(null), null);
  assert.deepEqual(Object.keys({ paymentInstructions: publicPaymentInstructionsPayload({ paymentInstructions: unsafeLookingText }) }), ["paymentInstructions"]);
});

test("template validation accepts new-game limits and rejects invalid statuses", () => {
  const valid = validateGameTemplate({ name: "Friday", description: "", defaultGameTitle: "Friday Game", defaultGameDescription: "Prize", totalSpots: "100", pricePerSpot: "5.25", wheelCount: "2", initialStatus: "OPEN", isDefault: true });
  assert.deepEqual(valid.errors, {});
  assert.equal(valid.input?.pricePerSpot, "5.25");

  const invalid = validateGameTemplate({ name: "", description: "", defaultGameTitle: "", defaultGameDescription: "", totalSpots: "0", pricePerSpot: "-1", wheelCount: "21", initialStatus: "READY", isDefault: false });
  assert.equal(Boolean(invalid.errors.name), true);
  assert.equal(Boolean(invalid.errors.totalSpots), true);
  assert.equal(Boolean(invalid.errors.pricePerSpot), true);
  assert.equal(Boolean(invalid.errors.wheelCount), true);
  assert.equal(Boolean(invalid.errors.initialStatus), true);
});

test("saving a game setup copies configuration only", () => {
  const source = {
    title: "Friday Draw",
    description: "Prize details",
    totalSpots: 100,
    pricePerSpot: { toString: () => "5" },
    wheelCount: 2,
    claims: [{ id: "private-claim" }],
    run: { winner: "private-winner" },
  };
  const input = gameSetupTemplateInput("Reusable", source);
  assert.deepEqual(Object.keys(input).sort(), ["defaultGameDescription", "defaultGameTitle", "initialStatus", "isDefault", "name", "pricePerSpot", "totalSpots", "wheelCount"]);
  assert.equal(JSON.stringify(input).includes("private-claim"), false);
  assert.equal(JSON.stringify(input).includes("private-winner"), false);
});

test("dashboard game counts preserve every status and normalize missing groups", () => {
  assert.deepEqual(
    normalizeDashboardGameCounts(11, [
      { status: "OPEN", count: 3 },
      { status: "CLOSED", count: 2 },
      { status: "READY", count: 1 },
      { status: "IN_PROGRESS", count: 1 },
      { status: "COMPLETED", count: 4 },
    ], 2),
    {
      total: 11,
      open: 3,
      closed: 2,
      ready: 1,
      inProgress: 1,
      completed: 4,
      archived: 2,
    },
  );

  assert.deepEqual(normalizeDashboardGameCounts(1, [{ status: "OPEN", count: 1 }]), {
    total: 1,
    open: 1,
    closed: 0,
    ready: 0,
    inProgress: 0,
    completed: 0,
    archived: 0,
  });
});

test("game administration enforces archive and deletion safety", () => {
  assert.equal(archiveBlockReason("OPEN", false), null);
  assert.match(archiveBlockReason("IN_PROGRESS", false) ?? "", /in-progress/i);
  assert.match(archiveBlockReason("READY", true) ?? "", /spinning/i);
  assert.equal(deleteConfirmationMatches("DELETE", "Friday Game"), true);
  assert.equal(deleteConfirmationMatches("Friday Game", "Friday Game"), true);
  assert.equal(deleteConfirmationMatches("friday game", "Friday Game"), false);
});

test("duplicated games receive a bounded copy title", () => {
  assert.equal(duplicateGameTitle("Friday Game"), "Friday Game Copy");
  assert.equal(duplicateGameTitle("x".repeat(150)).length, 150);
  assert.match(duplicateGameTitle("x".repeat(150)), / Copy$/);
});

const secondChanceEntries = (names: string[]) => names.map((displayName, index) => ({
  claimId: `claim-${index}`,
  displayName,
}));

test("Second Chance selects exact offset positions for odd and even wheels", () => {
  const odd = selectSecondChanceEntries(secondChanceEntries(["A", "B", "C", "D", "E"]), 0, 2);
  assert.equal(odd.before?.displayName, "D");
  assert.equal(odd.after?.displayName, "C");
  const even = selectSecondChanceEntries(secondChanceEntries(["A", "B", "C", "D", "E", "F"]), 5, 2);
  assert.equal(even.before?.displayName, "D");
  assert.equal(even.after?.displayName, "B");
});

test("Second Chance offset 10 wraps around both wheel boundaries", () => {
  const fromFirst = selectSecondChanceEntries(secondChanceEntries(["A", "B", "C", "D", "E", "F", "G"]), 0, 10);
  assert.equal(fromFirst.before?.entryIndex, 4);
  assert.equal(fromFirst.after?.entryIndex, 3);
  const fromLast = selectSecondChanceEntries(secondChanceEntries(["A", "B", "C", "D", "E", "F", "G"]), 6, 10);
  assert.equal(fromLast.before?.entryIndex, 3);
  assert.equal(fromLast.after?.entryIndex, 2);
});

test("Second Chance skips repeated main-winner entries in each direction", () => {
  const entries = secondChanceEntries(["Other Before", "Main", "MAIN", " Main ", "Main", "Other After"]);
  const result = selectSecondChanceEntries(entries, 3, 2);
  assert.equal(result.before?.displayName, "Other Before");
  assert.equal(result.after?.displayName, "Other After");
});

test("Second Chance preserves capitalization and may award one person twice", () => {
  const result = selectSecondChanceEntries(secondChanceEntries(["Main", "Jane Smith", "Main", "Jane Smith"]), 0, 2);
  assert.equal(result.before?.displayName, "Jane Smith");
  assert.equal(result.after?.displayName, "Jane Smith");
});

test("Second Chance records unresolved directions when all entries match", () => {
  const result = selectSecondChanceEntries(secondChanceEntries(["Main", " main ", "MAIN"]), 0, 2);
  assert.equal(result.before, null);
  assert.equal(result.after, null);
});

test("repeated Second Chance selection is deterministic", () => {
  const entries = secondChanceEntries(["Main", "A", "B", "Main", "C"]);
  const first = selectSecondChanceEntries(entries, 0, 2);
  const repeated = selectSecondChanceEntries(entries, 0, 2);
  assert.deepEqual(repeated, first);
});

test("game instruction variables replace only the supported token", () => {
  const raw = "<script>alert(1)</script>\n\nOffset {{SECOND_CHANCE_NUMBER}}, {{SECOND_CHANCE_ORDINAL}}, and {{OTHER}}";
  assert.equal(
    renderGameInstructionVariables(raw, { secondChanceNumber: 7 }),
    "<script>alert(1)</script>\n\nOffset 7, 7th, and {{OTHER}}",
  );
});

test("ordinal formatting handles standard and teen suffixes", () => {
  assert.deepEqual(
    [2, 3, 4, 8, 9, 10, 11, 12, 13, 21, 22, 23].map(formatOrdinal),
    ["2nd", "3rd", "4th", "8th", "9th", "10th", "11th", "12th", "13th", "21st", "22nd", "23rd"],
  );
});

test("persisted Second Chance results attach only to their source name wheel", () => {
  const result = { sourceWheelId: "name-1", offset: 4 };
  assert.equal(secondChanceResultForWheel(result, { id: "name-1", type: "NAME" }), result);
  assert.equal(secondChanceResultForWheel(result, { id: "name-2", type: "NAME" }), null);
  assert.equal(secondChanceResultForWheel(result, { id: "name-1", type: "VALUE" }), null);
  assert.equal(secondChanceResultForWheel(null, { id: "name-1", type: "NAME" }), null);
});

test("public Second Chance payload shortens names and omits internal fields", () => {
  const internal = {
    offset: 7,
    beforeDisplayName: "Jane Louise Smith",
    afterDisplayName: "Mike Robert Jones",
    sourceWheelId: "private-wheel",
    beforeClaimId: "private-claim",
    beforeEntryIndex: 12,
  };
  const publicResult = toPublicSecondChanceResult(internal, formatPublicName);
  assert.deepEqual(publicResult, {
    offset: 7,
    beforeDisplayName: "Jane S.",
    afterDisplayName: "Mike J.",
  });
  assert.equal(JSON.stringify(publicResult).includes("private"), false);
});

test("claim name correction validates plain display text", () => {
  assert.deepEqual(validateClaimDisplayName("  Jane   Doe  "), {
    displayName: "Jane   Doe",
  });
  assert.equal("error" in validateClaimDisplayName("   "), true);
  assert.equal("error" in validateClaimDisplayName(`Jane\u0000Doe`), true);
  assert.deepEqual(validateClaimDisplayName("<script>alert('x')</script>"), {
    displayName: "<script>alert('x')</script>",
  });
});

test("claim name correction preserves duplicate count, indexes, and other claims", () => {
  const entries = [
    { claimId: "claim-a", displayName: "Jnae Doe" },
    { claimId: "claim-b", displayName: "Jnae Doe" },
    { claimId: "claim-a", displayName: "Jnae Doe" },
    { value: "125" },
  ];
  const result = replaceClaimDisplayNameInEntries(entries, "claim-a", "Jane Doe");

  assert.equal(result.updatedCount, 2);
  assert.equal(result.entries.length, entries.length);
  assert.deepEqual(result.entries, [
    { claimId: "claim-a", displayName: "Jane Doe" },
    { claimId: "claim-b", displayName: "Jnae Doe" },
    { claimId: "claim-a", displayName: "Jane Doe" },
    { value: "125" },
  ]);
});

test("claim names lock after spinning, completion, or Second Chance", () => {
  const ready = {
    status: "READY" as const,
    winnerEntryIndex: null,
    winnerDisplayName: null,
    winnerValue: null,
    spunAt: null,
  };
  assert.equal(claimNameEditBlockReason([ready], null), null);
  assert.equal(claimNameEditBlockReason([{ ...ready, status: "SPINNING" }], null), "Names are locked because wheel results have begun.");
  assert.equal(claimNameEditBlockReason([{ ...ready, status: "COMPLETED" }], null), "Names are locked because wheel results have begun.");
  assert.equal(claimNameEditBlockReason([ready], new Date()), "Names are locked because wheel results have begun.");
});

test("prize claim tokens have 256-bit randomness and are stored by hash", () => {
  const first = generatePrizeClaimToken();
  const second = generatePrizeClaimToken();
  assert.notEqual(first, second);
  assert.equal(Buffer.from(first, "base64url").byteLength, 32);
  assert.equal(hashPrizeClaimToken(first).length, 64);
  assert.equal(hashPrizeClaimToken(first).includes(first), false);
  assert.equal(hashPrizeClaimToken(first), hashPrizeClaimToken(first));
});

test("prize request validation requires prize, recipient, and contact", () => {
  const missing = new FormData();
  assert.equal("error" in validatePrizeClaimSubmission(missing), true);

  const valid = new FormData();
  valid.set("preferredPrize", "  Signed game  ");
  valid.set("recipientName", "Jane Doe");
  valid.set("email", "jane@example.com");
  valid.set("winnerNotes", "Line one\nLine two");
  const result = validatePrizeClaimSubmission(valid);
  assert.equal("input" in result, true);
  if (result.input) {
    assert.equal(result.input.preferredPrize, "Signed game");
    assert.equal(result.input.winnerNotes, "Line one\nLine two");
  }
});

test("prize claim expiration supports none, 7, 14, and 30 days", () => {
  const now = new Date("2026-08-03T00:00:00.000Z");
  assert.equal(prizeClaimExpirationDate(0, now), null);
  assert.equal(prizeClaimExpirationDate(7, now)?.toISOString(), "2026-08-10T00:00:00.000Z");
  assert.equal(isPrizeClaimExpired("2026-08-02T00:00:00.000Z", now), true);
  assert.equal(isPrizeClaimExpired("2026-08-04T00:00:00.000Z", now), false);
});

test("public names use the existing privacy convention", () => {
  assert.equal(formatPublicName("John Quincy Smith"), "John S.");
  assert.equal(formatPublicName("Cher"), "Cher");
});

test("public results preserve order and omit private fields", () => {
  const publicResults = toPublicGameResults({
    raffleCode: "ASY-000347",
    completedAt: "2026-01-01T00:00:00.000Z",
    rounds: [{
      title: "Round 1",
      status: "COMPLETED",
      wheels: [
        { label: "Containment A", type: "NAME", status: "COMPLETED", winner: "John Smith", spinDurationSeconds: 40, completedAt: "2026-01-01T00:00:00.000Z", winningClaimQuantity: 3 },
        { label: "Reward Chamber", type: "VALUE", status: "COMPLETED", winner: "125", spinDurationSeconds: 60, completedAt: "2026-01-01T00:01:00.000Z", winningClaimQuantity: null },
      ],
    }],
  });

  assert.equal(publicResults.raffleCode, "ASY-000347");
  assert.deepEqual(publicResults.rounds[0].wheels.map((wheel) => wheel.label), ["Containment A", "Reward Chamber"]);
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

test("Game Mode reload keeps the latest completed wheel selected for acceptance", () => {
  const wheels = [
    { id: "one", status: "COMPLETED" as const },
    { id: "two", status: "READY" as const },
    { id: "three", status: "READY" as const },
  ];
  assert.equal(defaultGameModeActiveWheelId(wheels), "one");
  assert.equal(nextUnfinishedWheelId(wheels, "one"), "two");
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

test("25 and 75 second trajectories land on the saved segment center", () => {
  for (const duration of [25, 75]) {
    const entries = 19;
    const winner = 7;
    const finalRotation = wheelSpinTotalDegrees(0, entries, winner, duration) * wheelPositionAt(1);
    const expected = (90 - (winner + 0.5) * (360 / entries) + 360) % 360;
    assert.equal(Math.abs(((finalRotation % 360) + 360) % 360 - expected) < 1e-9, true);
    const renderedWinnerAngle = -90 + (winner + 0.5) * (360 / entries) + finalRotation;
    assert.equal(Math.abs(((renderedWinnerAngle % 360) + 360) % 360) < 1e-9, true);
  }
});

test("saved winners restore deterministically beneath the right-side pointer", () => {
  for (const entryCount of [2, 3, 19, 100, 500]) {
    for (const winnerEntryIndex of [0, entryCount - 1]) {
      const rotation = getWinningRestRotation({ entryCount, winnerEntryIndex });
      const segmentCenter = -90 +
        (winnerEntryIndex + 0.5) * (360 / entryCount);

      assert.equal(
        Math.abs(normalizeDegrees(segmentCenter + rotation)) < 1e-9 ||
          Math.abs(normalizeDegrees(segmentCenter + rotation) - 360) < 1e-9,
        true,
      );
      assert.equal(
        getWinningRestRotation({ entryCount, winnerEntryIndex }),
        rotation,
      );
    }
  }
});

test("live spins and restored completed wheels share the same resting angle", () => {
  for (const entryCount of [3, 19, 500]) {
    const winnerEntryIndex = entryCount - 1;
    const restored = getWinningRestRotation({ entryCount, winnerEntryIndex });

    for (const startRotation of [0, 47.25, 359.9, -18]) {
      const liveFinal = startRotation + wheelSpinTotalDegrees(
        startRotation,
        entryCount,
        winnerEntryIndex,
        25,
      );
      assert.equal(Math.abs(normalizeDegrees(liveFinal) - restored) < 1e-9, true);
    }
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

test("recovered spin music resumes at the looping playback offset", () => {
  assert.equal(loopingPlaybackOffset(67, 20), 7);
  assert.equal(loopingPlaybackOffset(12, 20), 12);
  assert.equal(loopingPlaybackOffset(12, 0), 0);
});

test("spin music store exposes an SSR-safe stable named API", () => {
  assert.deepEqual(getSpinMusicSnapshot(), {
    idleTracks: [],
    spinTracks: [],
    activeTrackId: "",
    activePlaylist: null,
    volume: 0.7,
    muted: false,
    status: "OFF",
    warning: null,
  });

  const unsubscribe = subscribeToSpinMusic(() => undefined);
  assert.equal(typeof unsubscribe, "function");
  unsubscribe();
});

test("music randomization avoids immediate repeats when alternatives exist", () => {
  const tracks = [{ id: "one" }, { id: "two" }, { id: "three" }];
  assert.notEqual(chooseRandomTrack(tracks, "one", () => 0)?.id, "one");
  assert.equal(chooseRandomTrack([{ id: "only" }], "only", () => 0)?.id, "only");
  assert.equal(chooseRandomTrack([], "", () => 0), null);
});
