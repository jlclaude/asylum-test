import { WHEEL_COUNT_MAX, WHEEL_COUNT_MIN } from "./game-template-validation.ts";
import { formatRaffleCode } from "./raffle-number.ts";
import { REWARD_CHAMBER_VALUES, rewardChamberCanBeRepaired } from "./reward-chamber.ts";
import { MAX_SPIN_DURATION_SECONDS, MIN_SPIN_DURATION_SECONDS } from "./spin-duration.ts";
import { getContainmentLabel, REWARD_CHAMBER_LABEL } from "./wheel-labels.ts";

export type ReadinessSeverity = "PASS" | "WARNING" | "BLOCKING";
export type ReadinessStatus = "PASSED" | "NEEDS_ATTENTION" | "FAILED";
export type ReadinessCategory = "GAME" | "CLAIMS" | "WHEELS" | "RESULTS" |
  "SECOND_CHANCE" | "RAFFLE" | "PAYMENT" | "PRIZE_CLAIM" | "MUSIC" |
  "ARCHIVE" | "SECURITY" | "RECOVERY";

export type ReadinessCheck = {
  id: string;
  category: ReadinessCategory;
  severity: ReadinessSeverity;
  title: string;
  message: string;
  repairIntent?: string;
  affectedId?: string;
  status: ReadinessStatus;
};

export type GameReadinessReport = {
  checkedAt: string;
  isReady: boolean;
  blockingCount: number;
  warningCount: number;
  passedCount: number;
  checks: ReadinessCheck[];
};

export type ReadinessClaim = {
  id: string;
  displayName: string;
  quantity: number;
  status: string;
  externalPayment: boolean;
  createdAt: string;
};

export type ReadinessWheel = {
  id: string;
  roundId: string;
  roundPosition: number;
  position: number;
  type: "NAME" | "VALUE";
  status: "READY" | "SPINNING" | "COMPLETED";
  label: string;
  originalEntriesJson: string;
  shuffledEntriesJson: string;
  spinDurationSeconds: number | null;
  winnerEntryIndex: number | null;
  winnerClaimId: string | null;
  winnerDisplayName: string | null;
  winnerValue: string | null;
  shuffledAt: string | null;
  spunAt: string | null;
  completedAt: string | null;
};

export type ReadinessSnapshot = {
  game: {
    id: string;
    title: string;
    totalSpots: number;
    wheelCount: number;
    secondChanceOffset: number;
    raffleNumber: number;
    status: string;
    archivedAt: string | null;
  };
  claims: ReadinessClaim[];
  run: null | {
    id: string;
    gameId: string;
    completedAt: string | null;
    secondChanceCalculatedAt: string | null;
    secondChanceSourceWheelId: string | null;
    secondChanceBeforeDisplayName: string | null;
    secondChanceBeforeEntryIndex: number | null;
    secondChanceAfterDisplayName: string | null;
    secondChanceAfterEntryIndex: number | null;
    wheels: ReadinessWheel[];
  };
  paymentInstructionsConfigured: boolean;
  music: { idleCount: number; spinCount: number; unsupportedCount: number; readable: boolean };
  prizeClaims: Array<{
    id: string;
    gameId: string;
    gameWheelId: string;
    activeGameWheelId: string | null;
    winnerDisplayName: string;
    tokenHash: string;
  }>;
  now?: string;
};

type Entry = { claimId?: unknown; displayName?: unknown; value?: unknown };
const statusFor = (severity: ReadinessSeverity): ReadinessStatus =>
  severity === "PASS" ? "PASSED" : severity === "WARNING" ? "NEEDS_ATTENTION" : "FAILED";

function check(
  severity: ReadinessSeverity,
  id: string,
  category: ReadinessCategory,
  title: string,
  message: string,
  options: Pick<ReadinessCheck, "repairIntent" | "affectedId"> = {},
): ReadinessCheck {
  return { id, category, severity, title, message, status: statusFor(severity), ...options };
}

function parseEntries(value: string): { entries?: Entry[]; error?: string } {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return { error: "Saved entries are not an array." };
    return { entries: parsed as Entry[] };
  } catch {
    return { error: "Saved entries contain malformed JSON." };
  }
}

const normalizedName = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const sameEntries = (left: Entry[], right: Entry[]) => JSON.stringify(left) === JSON.stringify(right);
const entryKey = (entry: Entry) => "claimId" in entry
  ? `name:${String(entry.claimId)}:${String(entry.displayName)}`
  : `value:${String(entry.value)}`;
const sameEntryMultiset = (left: Entry[], right: Entry[]) =>
  JSON.stringify(left.map(entryKey).sort()) === JSON.stringify(right.map(entryKey).sort());

export function evaluateGameReadiness(snapshot: ReadinessSnapshot): GameReadinessReport {
  const checks: ReadinessCheck[] = [];
  const { game, claims, run } = snapshot;
  const validGameStatuses = new Set(["CLOSED", "READY", "IN_PROGRESS", "COMPLETED"]);

  checks.push(check("PASS", "security.shop", "SECURITY", "Shop ownership verified", "The game was loaded through the authenticated shop scope."));
  checks.push(game.archivedAt
    ? check("BLOCKING", "archive.active", "ARCHIVE", "Game is archived", "Restore this game before opening wheel operations.")
    : check("PASS", "archive.active", "ARCHIVE", "Game is active", "The game is not archived."));
  checks.push(game.title.trim()
    ? check("PASS", "game.title", "GAME", "Game title is present", "The game has a display title.")
    : check("BLOCKING", "game.title", "GAME", "Game title is missing", "Add a title before opening wheels."));
  checks.push(Number.isInteger(game.totalSpots) && game.totalSpots > 0
    ? check("PASS", "game.spots", "GAME", "Total spots are valid", `${game.totalSpots} spots are configured.`)
    : check("BLOCKING", "game.spots", "GAME", "Total spots are invalid", "Total spots must be a positive whole number."));
  checks.push(Number.isInteger(game.wheelCount) && game.wheelCount >= WHEEL_COUNT_MIN && game.wheelCount <= WHEEL_COUNT_MAX
    ? check("PASS", "game.wheel-count", "GAME", "Name-wheel count is valid", `${game.wheelCount} name wheels are configured.`)
    : check("BLOCKING", "game.wheel-count", "GAME", "Name-wheel count is invalid", `Name-wheel count must be ${WHEEL_COUNT_MIN}–${WHEEL_COUNT_MAX}.`));
  checks.push(validGameStatuses.has(game.status)
    ? check("PASS", "game.status", "GAME", "Game status supports wheel operations", `Current status is ${game.status}.`)
    : check("BLOCKING", "game.status", "GAME", "Game must be closed first", "Close the game before initializing wheels."));
  try {
    const code = formatRaffleCode(game.raffleNumber);
    checks.push(check("PASS", "raffle.valid", "RAFFLE", "Raffle identity is valid", code));
  } catch {
    checks.push(check("BLOCKING", "raffle.valid", "RAFFLE", "Raffle identity is invalid", "The persisted raffle number is missing or outside the valid range."));
  }
  checks.push(Number.isInteger(game.secondChanceOffset) && game.secondChanceOffset >= 2 && game.secondChanceOffset <= 10
    ? check("PASS", "second-chance.offset", "SECOND_CHANCE", "Second Chance offset is valid", `${game.secondChanceOffset} is within the saved 2–10 range.`)
    : check("BLOCKING", "second-chance.offset", "SECOND_CHANCE", "Second Chance offset is invalid", "The saved offset must be a whole number from 2 through 10."));

  const orderedClaims = [...claims].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  checks.push(orderedClaims.every((claim, index) => claim.id === claims[index]?.id)
    ? check("PASS", "claims.order", "CLAIMS", "Claim order is deterministic", "Claims are ordered by creation time and ID.")
    : check("BLOCKING", "claims.order", "CLAIMS", "Claim order is not deterministic", "Claims must be read in chronological order with ID as the tie-breaker."));
  checks.push(new Set(claims.map((claim) => claim.id)).size === claims.length
    ? check("PASS", "claims.identity", "CLAIMS", "Claim identities are unique", "Every loaded claim belongs to this game through its database relation.")
    : check("BLOCKING", "claims.identity", "CLAIMS", "Claim identities conflict", "Duplicate claim IDs cannot be used to build wheel entries."));
  const activeClaims = claims.filter((claim) => claim.status === "PENDING" || claim.status === "CONFIRMED");
  const reservedQuantity = activeClaims.reduce((sum, claim) => sum + claim.quantity, 0);
  checks.push(reservedQuantity <= game.totalSpots
    ? check("PASS", "claims.capacity", "CLAIMS", "Claim quantities fit capacity", `${reservedQuantity} of ${game.totalSpots} spots are reserved.`)
    : check("BLOCKING", "claims.capacity", "CLAIMS", "Claims exceed total spots", `${reservedQuantity} active spots exceed the configured ${game.totalSpots}.`));
  const invalidConfirmed = claims.filter((claim) => claim.status === "CONFIRMED" && (!Number.isInteger(claim.quantity) || claim.quantity < 1));
  checks.push(invalidConfirmed.length
    ? check("BLOCKING", "claims.quantity", "CLAIMS", "Confirmed claim quantity is invalid", `${invalidConfirmed.length} confirmed claims have invalid quantities.`)
    : check("PASS", "claims.quantity", "CLAIMS", "Confirmed quantities are valid", "Every confirmed claim has at least one whole spot."));
  const eligibleClaims = claims.filter((claim) => claim.status === "CONFIRMED" && claim.externalPayment);
  const eligibleQuantity = eligibleClaims.reduce((sum, claim) => sum + claim.quantity, 0);
  checks.push(eligibleQuantity > 0
    ? check("PASS", "claims.eligible", "CLAIMS", "Paid wheel entries are available", `${eligibleQuantity} confirmed paid spots are eligible.`)
    : check("BLOCKING", "claims.eligible", "CLAIMS", "No confirmed paid entries", "At least one confirmed paid spot is required before wheels can open."));
  const blankNames = eligibleClaims.filter((claim) => !claim.displayName.trim());
  checks.push(blankNames.length
    ? check("BLOCKING", "claims.names", "CLAIMS", "Eligible display names are missing", `${blankNames.length} eligible claims have blank display names.`)
    : check("PASS", "claims.names", "CLAIMS", "Eligible display names are present", "Duplicate names are allowed and retained."));
  const excluded = claims.filter((claim) => claim.status === "PENDING" || (claim.status === "CONFIRMED" && !claim.externalPayment));
  checks.push(excluded.length
    ? check("WARNING", "claims.excluded", "CLAIMS", "Claims are excluded from wheels", `${excluded.length} pending or unpaid claims will not appear on name wheels.`)
    : check("PASS", "claims.excluded", "CLAIMS", "No pending or unpaid claims", "All active claims intended for wheels are confirmed and paid."));

  checks.push(snapshot.paymentInstructionsConfigured
    ? check("PASS", "payment.instructions", "PAYMENT", "Payment instructions configured", "Global payment instructions are available.")
    : check("WARNING", "payment.instructions", "PAYMENT", "Payment instructions are missing", "This does not block Game Mode."));
  checks.push(snapshot.music.readable && snapshot.music.idleCount > 0
    ? check("PASS", "music.idle", "MUSIC", "Pre-spin music is available", `${snapshot.music.idleCount} supported tracks were found.`)
    : check("WARNING", "music.idle", "MUSIC", "Pre-spin music is unavailable", "Game Mode remains usable without pre-spin music."));
  checks.push(snapshot.music.readable && snapshot.music.spinCount > 0
    ? check("PASS", "music.spin", "MUSIC", "Spin music is available", `${snapshot.music.spinCount} supported tracks were found.`)
    : check("WARNING", "music.spin", "MUSIC", "Spin music is unavailable", "Game Mode remains usable without spin music."));
  if (snapshot.music.unsupportedCount > 0) checks.push(check("WARNING", "music.unsupported", "MUSIC", "Unsupported music files ignored", `${snapshot.music.unsupportedCount} unsupported files were ignored.`));

  if (!run) {
    checks.push(game.status === "CLOSED"
      ? check("PASS", "run.initialize", "RECOVERY", "Ready to initialize wheels", "No GameRun exists and the closed game can be initialized.")
      : check("BLOCKING", "run.missing", "RECOVERY", "GameRun is missing", `A game in ${game.status} status must already have a run.`));
  } else {
    checks.push(run.gameId === game.id
      ? check("PASS", "run.owner", "WHEELS", "GameRun belongs to this game", "The persisted run relationship is valid.")
      : check("BLOCKING", "run.owner", "WHEELS", "GameRun relationship is invalid", "The run does not belong to this game."));
    const wheels = [...run.wheels].sort((a, b) => a.roundPosition - b.roundPosition || a.position - b.position);
    const nameWheels = wheels.filter((wheel) => wheel.type === "NAME");
    const valueWheels = wheels.filter((wheel) => wheel.type === "VALUE");
    const allReadyAndUnspun = wheels.every((wheel) => wheel.status === "READY" && wheel.winnerEntryIndex === null && !wheel.spunAt && !wheel.completedAt);
    const roundPositions = [...new Set(wheels.map((wheel) => wheel.roundPosition))];
    checks.push(roundPositions.length === 1 && roundPositions[0] === 1
      ? check("PASS", "wheels.rounds", "WHEELS", "Round topology is valid", "All required wheels belong to Round 1.")
      : check("BLOCKING", "wheels.rounds", "WHEELS", "Round topology is invalid", "The current product requires exactly one configured round at position 1."));
    checks.push(nameWheels.length === game.wheelCount
      ? check("PASS", "wheels.name-count", "WHEELS", "Name-wheel count matches", `${nameWheels.length} required name wheels exist.`)
      : check("BLOCKING", "wheels.name-count", "WHEELS", "Name-wheel count mismatch", `Expected ${game.wheelCount}, found ${nameWheels.length}.`, allReadyAndUnspun ? { repairIntent: "repair-name-snapshots" } : {}));
    checks.push(valueWheels.length === 1
      ? check("PASS", "wheels.value-count", "WHEELS", "Reward Chamber exists", "Exactly one value wheel exists.")
      : check("BLOCKING", "wheels.value-count", "WHEELS", "Reward Chamber count is invalid", `Expected exactly one, found ${valueWheels.length}.`));
    const positions = wheels.map((wheel) => `${wheel.roundPosition}:${wheel.position}`);
    checks.push(new Set(positions).size === positions.length
      ? check("PASS", "wheels.positions", "WHEELS", "Wheel positions are unique", "Round and wheel ordering is deterministic.")
      : check("BLOCKING", "wheels.positions", "WHEELS", "Wheel positions conflict", "Two or more wheels share the same configured position."));

    const badLabels = wheels.filter((wheel) => wheel.label !== (wheel.type === "VALUE" ? REWARD_CHAMBER_LABEL : getContainmentLabel(wheel.position)));
    checks.push(badLabels.length
      ? check("BLOCKING", "wheels.labels", "WHEELS", "Wheel labels are incorrect", `${badLabels.length} labels differ from their deterministic positions.`, allReadyAndUnspun ? { repairIntent: "repair-wheel-labels" } : {})
      : check("PASS", "wheels.labels", "WHEELS", "Wheel labels are correct", "Containment and Reward Chamber labels match configured positions."));

    const parsed = new Map<string, { original?: Entry[]; shuffled?: Entry[]; error?: string }>();
    for (const wheel of wheels) {
      const original = parseEntries(wheel.originalEntriesJson);
      const shuffled = parseEntries(wheel.shuffledEntriesJson);
      parsed.set(wheel.id, { original: original.entries, shuffled: shuffled.entries, error: original.error ?? shuffled.error });
    }
    const malformed = wheels.filter((wheel) => parsed.get(wheel.id)?.error);
    checks.push(malformed.length
      ? check("BLOCKING", "wheels.json", "WHEELS", "Wheel entries are malformed", `${malformed.length} wheels contain invalid saved entry JSON.`)
      : check("PASS", "wheels.json", "WHEELS", "Wheel entries deserialize", "All original and shuffled entry arrays are readable."));
    const emptyReady = wheels.filter((wheel) => wheel.status === "READY" && (parsed.get(wheel.id)?.shuffled?.length ?? 0) === 0);
    if (emptyReady.length) checks.push(check("BLOCKING", "wheels.empty", "WHEELS", "Ready wheel has no entries", `${emptyReady.length} ready wheels are empty.`));

    const sourceSnapshots = nameWheels.map((wheel) => parsed.get(wheel.id)?.original).filter((value): value is Entry[] => Boolean(value));
    const expectedNameEntries = eligibleClaims.flatMap((claim) => Array.from({ length: Math.max(0, claim.quantity) }, () => ({ claimId: claim.id, displayName: claim.displayName })));
    const sourcesMatch = sourceSnapshots.length === nameWheels.length && sourceSnapshots.every((entries) => sameEntries(entries, expectedNameEntries));
    checks.push(sourcesMatch
      ? check("PASS", "wheels.snapshots", "WHEELS", "Frozen name snapshots match", `${expectedNameEntries.length} chronological entries are preserved on every name wheel.`)
      : check("BLOCKING", "wheels.snapshots", "WHEELS", "Name-wheel snapshots mismatch", `${nameWheels.length} name wheels must each preserve ${expectedNameEntries.length} confirmed-paid chronological entries.`, allReadyAndUnspun && !run.secondChanceCalculatedAt ? { repairIntent: "repair-name-snapshots" } : {}));
    const shuffledLengthsMatch = nameWheels.every((wheel) => {
      const value = parsed.get(wheel.id);
      return value?.original && value.shuffled && value.original.length === value.shuffled.length;
    });
    checks.push(shuffledLengthsMatch
      ? check("PASS", "wheels.shuffle-length", "WHEELS", "Shuffles preserve entry counts", "Original and shuffled arrays have equal lengths.")
      : check("BLOCKING", "wheels.shuffle-length", "WHEELS", "Shuffled entry count changed", "A shuffle must never add or remove an entry.", allReadyAndUnspun && !run.secondChanceCalculatedAt ? { repairIntent: "repair-name-snapshots" } : {}));
    const shufflesPreserveEntries = wheels.every((wheel) => {
      const value = parsed.get(wheel.id);
      return value?.original && value.shuffled && sameEntryMultiset(value.original, value.shuffled);
    });
    checks.push(shufflesPreserveEntries
      ? check("PASS", "wheels.shuffle-members", "WHEELS", "Shuffles preserve every entry", "Duplicate names and weighted values remain represented exactly.")
      : check("BLOCKING", "wheels.shuffle-members", "WHEELS", "Shuffled entries changed", "A shuffled wheel must contain the exact original entries, including duplicates.", allReadyAndUnspun && !run.secondChanceCalculatedAt ? { repairIntent: "repair-name-snapshots" } : {}));

    const valueWheel = valueWheels[0];
    if (valueWheel) {
      const valueEntries = parsed.get(valueWheel.id)?.original;
      const actualValues = valueEntries?.map((entry) => entry.value);
      const rewardValid = Boolean(actualValues && JSON.stringify(actualValues) === JSON.stringify(REWARD_CHAMBER_VALUES));
      checks.push(rewardValid
        ? check("PASS", "wheels.reward-values", "WHEELS", "Reward Chamber weighting is exact", "All 20 persisted values and duplicates are preserved in order.")
        : check("BLOCKING", "wheels.reward-values", "WHEELS", "Reward Chamber values are invalid", "The exact 20-entry weighted sequence must be restored.", rewardChamberCanBeRepaired(valueWheel) ? { repairIntent: "repair-reward-chamber", affectedId: valueWheel.id } : {}));
    }

    for (const wheel of wheels) {
      const entries = parsed.get(wheel.id)?.shuffled ?? [];
      const durationValid = wheel.spinDurationSeconds === null ||
        (Number.isInteger(wheel.spinDurationSeconds) && wheel.spinDurationSeconds >= MIN_SPIN_DURATION_SECONDS && wheel.spinDurationSeconds <= MAX_SPIN_DURATION_SECONDS);
      if (!durationValid) checks.push(check("BLOCKING", `wheel.duration.${wheel.id}`, "WHEELS", "Spin duration is invalid", `${wheel.label} must use ${MIN_SPIN_DURATION_SECONDS}–${MAX_SPIN_DURATION_SECONDS} seconds.`, { affectedId: wheel.id }));
      if (wheel.status === "READY" && (wheel.winnerEntryIndex !== null || wheel.winnerClaimId || wheel.winnerDisplayName || wheel.winnerValue || wheel.spunAt || wheel.completedAt)) {
        checks.push(check("BLOCKING", `wheel.ready-result.${wheel.id}`, "RESULTS", "Ready wheel contains stale result data", `${wheel.label} has result fields before spinning.`, { affectedId: wheel.id }));
      }
      if (wheel.status === "SPINNING") {
        if (!wheel.spunAt || !wheel.spinDurationSeconds || wheel.winnerEntryIndex === null) {
          checks.push(check("BLOCKING", `wheel.spinning.${wheel.id}`, "RECOVERY", "Spinning wheel cannot recover", `${wheel.label} is missing persisted spin recovery data.`, { affectedId: wheel.id }));
        } else {
          const elapsed = (Date.parse(snapshot.now ?? new Date().toISOString()) - Date.parse(wheel.spunAt)) / 1000;
          if (Number.isFinite(elapsed) && elapsed >= wheel.spinDurationSeconds) {
            checks.push(check("WARNING", `wheel.elapsed.${wheel.id}`, "RECOVERY", "Elapsed spin can be reconciled", `${wheel.label} has elapsed and can be completed using its persisted winner.`, { repairIntent: "reconcile-elapsed-spin", affectedId: wheel.id }));
          }
        }
      }
      if (wheel.status === "COMPLETED") {
        const indexValid = wheel.winnerEntryIndex !== null && wheel.winnerEntryIndex >= 0 && wheel.winnerEntryIndex < entries.length;
        const resultFieldsValid = Boolean(wheel.spunAt && wheel.spinDurationSeconds &&
          (wheel.type === "NAME" ? wheel.winnerClaimId && wheel.winnerDisplayName : wheel.winnerValue));
        if (!indexValid || !wheel.completedAt || !resultFieldsValid) {
          checks.push(check("BLOCKING", `wheel.completed.${wheel.id}`, "RESULTS", "Completed result is malformed", `${wheel.label} lacks a valid persisted winner index or completion time.`, { affectedId: wheel.id }));
        } else {
          const selected = entries[wheel.winnerEntryIndex as number];
          const snapshotMatches = wheel.type === "NAME"
            ? selected?.claimId === wheel.winnerClaimId && selected?.displayName === wheel.winnerDisplayName
            : selected?.value === wheel.winnerValue;
          if (!snapshotMatches) checks.push(check("BLOCKING", `wheel.winner.${wheel.id}`, "RESULTS", "Winner snapshot mismatch", `${wheel.label}'s saved winner does not match its persisted shuffled entry.`, { affectedId: wheel.id }));
        }
      }
    }

    const spinning = wheels.some((wheel) => wheel.status === "SPINNING");
    const completed = wheels.filter((wheel) => wheel.status === "COMPLETED");
    const expectedGameStatus = completed.length === wheels.length && wheels.length > 0 ? "COMPLETED" : spinning || completed.length > 0 ? "IN_PROGRESS" : "READY";
    checks.push(game.status === expectedGameStatus
      ? check("PASS", "run.status", "RECOVERY", "Game and wheel statuses agree", `Both represent ${expectedGameStatus}.`)
      : check("BLOCKING", "run.status", "RECOVERY", "Game and wheel statuses contradict", `Wheel state indicates ${expectedGameStatus}, but the game is ${game.status}.`));
    checks.push((expectedGameStatus === "COMPLETED") === Boolean(run.completedAt)
      ? check("PASS", "run.completion", "RESULTS", "Run completion timestamp agrees", "Run completion matches the required wheel states.")
      : check("BLOCKING", "run.completion", "RESULTS", "Run completion timestamp contradicts wheels", "A completed run must have all required wheels completed, and an unfinished run must not be marked complete."));

    if (run.secondChanceCalculatedAt) {
      const source = wheels.find((wheel) => wheel.id === run.secondChanceSourceWheelId);
      const firstName = nameWheels[0];
      const sourceEntries = source ? parsed.get(source.id)?.shuffled ?? [] : [];
      const pairs = [
        { name: run.secondChanceBeforeDisplayName, index: run.secondChanceBeforeEntryIndex },
        { name: run.secondChanceAfterDisplayName, index: run.secondChanceAfterEntryIndex },
      ];
      const valid = source?.id === firstName?.id && pairs.every((pair) => {
        if (pair.name === null || pair.index === null) return pair.name === null && pair.index === null;
        if (pair.index < 0 || pair.index >= sourceEntries.length) return false;
        return sourceEntries[pair.index]?.displayName === pair.name &&
          (!firstName?.winnerDisplayName || normalizedName(pair.name) !== normalizedName(firstName.winnerDisplayName));
      });
      checks.push(valid
        ? check("PASS", "second-chance.saved", "SECOND_CHANCE", "Second Chance results are valid", "Saved results remain tied to Containment A and valid source indexes.")
        : check("BLOCKING", "second-chance.saved", "SECOND_CHANCE", "Second Chance results are malformed", "Saved Second Chance results will not be recalculated or overwritten."));
    } else if (nameWheels[0]?.status === "COMPLETED") {
      checks.push(check("WARNING", "second-chance.recover", "SECOND_CHANCE", "Second Chance persistence is recoverable", "Containment A is complete; the existing idempotent recovery path can persist missing results."));
    } else {
      checks.push(check("PASS", "second-chance.pending", "SECOND_CHANCE", "Second Chance has not started", "Results will be calculated from Containment A after completion."));
    }

    const wheelById = new Map(wheels.map((wheel) => [wheel.id, wheel]));
    const badPrizeClaims = snapshot.prizeClaims.filter((claim) => {
      const wheel = wheelById.get(claim.gameWheelId);
      return claim.gameId !== game.id || !wheel || wheel.type !== "NAME" || wheel.status !== "COMPLETED" || wheel.winnerDisplayName !== claim.winnerDisplayName || !claim.tokenHash;
    });
    checks.push(badPrizeClaims.length
      ? check("BLOCKING", "prize.integrity", "PRIZE_CLAIM", "Prize-claim integrity issue", `${badPrizeClaims.length} prize claims do not reference a persisted completed name-wheel winner.`)
      : check("PASS", "prize.integrity", "PRIZE_CLAIM", "Prize claims reference saved winners", "No value-wheel or unrelated winner claims were found."));
    const activeWheelIds = snapshot.prizeClaims.map((claim) => claim.activeGameWheelId).filter((value): value is string => Boolean(value));
    checks.push(new Set(activeWheelIds).size === activeWheelIds.length
      ? check("PASS", "prize.active-unique", "PRIZE_CLAIM", "Active prize claims are unique", "At most one active prize claim exists for each eligible winning wheel.")
      : check("BLOCKING", "prize.active-unique", "PRIZE_CLAIM", "Duplicate active prize claims", "A winning wheel has more than one active prize claim."));
  }

  const blockingCount = checks.filter((item) => item.severity === "BLOCKING").length;
  const warningCount = checks.filter((item) => item.severity === "WARNING").length;
  const passedCount = checks.filter((item) => item.severity === "PASS").length;
  return {
    checkedAt: snapshot.now ?? new Date().toISOString(),
    isReady: blockingCount === 0,
    blockingCount,
    warningCount,
    passedCount,
    checks,
  };
}
