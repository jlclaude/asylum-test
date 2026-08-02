export type SecondChanceEntry = {
  claimId: string;
  displayName: string;
};

export type SecondChanceDirectionResult = {
  claimId: string;
  displayName: string;
  entryIndex: number;
} | null;

export type SecondChanceSelection = {
  before: SecondChanceDirectionResult;
  after: SecondChanceDirectionResult;
};

export function toPublicSecondChanceResult(result: {
  offset: number;
  beforeDisplayName: string | null;
  afterDisplayName: string | null;
}, formatName: (name: string) => string) {
  return {
    offset: result.offset,
    beforeDisplayName: result.beforeDisplayName ? formatName(result.beforeDisplayName) : null,
    afterDisplayName: result.afterDisplayName ? formatName(result.afterDisplayName) : null,
  };
}

export function secondChanceResultForWheel<T extends { sourceWheelId: string }>(
  result: T | null,
  wheel: { id: string; type: "NAME" | "VALUE" },
): T | null {
  return result && wheel.type === "NAME" && result.sourceWheelId === wheel.id
    ? result
    : null;
}

function normalizedName(value: string) {
  return value.trim().toLowerCase();
}

function findEligibleEntry(
  entries: SecondChanceEntry[],
  winnerIndex: number,
  offset: number,
  direction: -1 | 1,
): SecondChanceDirectionResult {
  const winnerName = normalizedName(entries[winnerIndex].displayName);
  const entryCount = entries.length;

  for (let distance = offset; distance < offset + entryCount; distance += 1) {
    const index = (winnerIndex + direction * distance + entryCount * (distance + 1)) % entryCount;
    const entry = entries[index];
    if (normalizedName(entry.displayName) !== winnerName) {
      return { claimId: entry.claimId, displayName: entry.displayName, entryIndex: index };
    }
  }

  return null;
}

export function selectSecondChanceEntries(
  entries: SecondChanceEntry[],
  winnerIndex: number,
  offset: number,
): SecondChanceSelection {
  if (
    entries.length === 0 ||
    !Number.isInteger(winnerIndex) ||
    winnerIndex < 0 ||
    winnerIndex >= entries.length ||
    !Number.isInteger(offset) ||
    offset < 2 ||
    offset > 10
  ) {
    throw new Error("The saved Second Chance selection inputs are invalid.");
  }

  return {
    before: findEligibleEntry(entries, winnerIndex, offset, -1),
    after: findEligibleEntry(entries, winnerIndex, offset, 1),
  };
}
