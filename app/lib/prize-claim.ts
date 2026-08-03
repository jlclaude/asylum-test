export const PRIZE_CLAIM_EXPIRATION_DAYS = [0, 7, 14, 30] as const;
export type PrizeClaimExpirationDays = typeof PRIZE_CLAIM_EXPIRATION_DAYS[number];

const SINGLE_LINE_MAX = 200;
const NOTES_MAX = 2000;

function hasControlCharacters(value: string, allowNewlines = false) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    if (allowNewlines && (code === 10 || code === 13)) return false;
    return code < 32 || code === 127;
  });
}

function singleLine(value: FormDataEntryValue | null, label: string, required = false) {
  const normalized = String(value ?? "").trim();
  if (required && !normalized) return { error: `${label} is required.` } as const;
  if (normalized.length > SINGLE_LINE_MAX) return { error: `${label} must be ${SINGLE_LINE_MAX} characters or fewer.` } as const;
  if (hasControlCharacters(normalized)) return { error: `${label} contains invalid characters.` } as const;
  return { value: normalized } as const;
}

function notes(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  if (normalized.length > NOTES_MAX) return { error: `Additional notes must be ${NOTES_MAX} characters or fewer.` } as const;
  if (hasControlCharacters(normalized, true)) return { error: "Additional notes contain invalid characters." } as const;
  return { value: normalized } as const;
}

export type PrizeClaimSubmissionInput = {
  preferredPrize: string;
  recipientName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  winnerNotes: string | null;
};

export function formatPrizeClaimShippingSummary(input: {
  winnerDisplayName: string;
  preferredPrize: string | null;
  recipientName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
  winnerNotes: string | null;
}) {
  return [
    `Winner: ${input.winnerDisplayName}`,
    `Prize Requested: ${input.preferredPrize ?? "—"}`,
    `Full Name: ${input.recipientName ?? "—"}`,
    `Address: ${[input.addressLine1, input.addressLine2].filter(Boolean).join(", ") || "—"}`,
    `City: ${input.city ?? "—"}`,
    `State: ${input.stateProvince ?? "—"}`,
    `Postal Code: ${input.postalCode ?? "—"}`,
    `Country: ${input.country ?? "—"}`,
    ...(input.winnerNotes ? [`Notes: ${input.winnerNotes}`] : []),
  ].join("\n");
}

export function validatePrizeClaimSubmission(formData: FormData):
  | { input: PrizeClaimSubmissionInput; error?: never }
  | { error: string; input?: never } {
  const fields = {
    preferredPrize: singleLine(formData.get("preferredPrize"), "Prize requested", true),
    recipientName: singleLine(formData.get("recipientName"), "Full name", true),
    addressLine1: singleLine(formData.get("addressLine1"), "Address line 1", true),
    addressLine2: singleLine(formData.get("addressLine2"), "Address line 2"),
    city: singleLine(formData.get("city"), "City", true),
    stateProvince: singleLine(formData.get("stateProvince"), "State or province", true),
    postalCode: singleLine(formData.get("postalCode"), "Postal code", true),
    country: singleLine(formData.get("country"), "Country", true),
    winnerNotes: notes(formData.get("winnerNotes")),
  };

  for (const field of Object.values(fields)) {
    if ("error" in field && typeof field.error === "string") {
      return { error: field.error };
    }
  }

  const value = (field: { value?: string }) => field.value?.trim() || null;

  return {
    input: {
      preferredPrize: fields.preferredPrize.value!,
      recipientName: fields.recipientName.value!,
      addressLine1: fields.addressLine1.value!,
      addressLine2: value(fields.addressLine2),
      city: fields.city.value!,
      stateProvince: fields.stateProvince.value!,
      postalCode: fields.postalCode.value!,
      country: fields.country.value!,
      winnerNotes: value(fields.winnerNotes),
    },
  };
}

export function prizeClaimExpirationDate(days: number, now = new Date()) {
  if (!PRIZE_CLAIM_EXPIRATION_DAYS.includes(days as PrizeClaimExpirationDays) || days === 0) return null;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isPrizeClaimExpired(expiresAt: Date | string | null, now = new Date()) {
  return expiresAt !== null && new Date(expiresAt).getTime() <= now.getTime();
}
