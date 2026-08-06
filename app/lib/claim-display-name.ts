import type { WheelEntry } from "../models/game-run.server";

export const CLAIM_DISPLAY_NAME_MAX_LENGTH = 100;

export function validateClaimDisplayName(value: string) {
  const displayName = value.trim();

  if (!displayName) {
    return { error: "Enter a display name." } as const;
  }

  if (displayName.length > CLAIM_DISPLAY_NAME_MAX_LENGTH) {
    return {
      error: `Display name must be ${CLAIM_DISPLAY_NAME_MAX_LENGTH} characters or fewer.`,
    } as const;
  }

  if (/\p{Cc}/u.test(displayName)) {
    return { error: "Display name cannot contain control characters." } as const;
  }

  return { displayName } as const;
}

export function replaceClaimDisplayNameInEntries(
  entries: WheelEntry[],
  claimId: string,
  displayName: string,
) {
  let updatedCount = 0;
  const updatedEntries = entries.map((entry) => {
    if (!("claimId" in entry) || entry.claimId !== claimId) return entry;
    updatedCount += 1;
    return { ...entry, displayName };
  });

  return { entries: updatedEntries, updatedCount };
}

type ClaimNameEditWheelState = {
  status: "READY" | "SPINNING" | "COMPLETED";
  winnerEntryIndex: number | null;
  winnerDisplayName: string | null;
  winnerValue: string | null;
  spunAt: Date | string | null;
};

export function claimNameEditBlockReason(
  wheels: ClaimNameEditWheelState[],
  secondChanceCalculatedAt: Date | string | null,
) {
  const resultsBegun = wheels.some((wheel) =>
    wheel.status === "SPINNING" ||
    wheel.status === "COMPLETED" ||
    wheel.winnerEntryIndex !== null ||
    wheel.winnerDisplayName !== null ||
    wheel.winnerValue !== null ||
    wheel.spunAt !== null
  );

  return resultsBegun || secondChanceCalculatedAt
    ? "Names are locked because wheel results have begun."
    : null;
}
