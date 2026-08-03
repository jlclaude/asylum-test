export const PRIZE_CLAIM_EXPIRATION_DAYS = [0, 7, 14, 30] as const;
export type PrizeClaimExpirationDays = typeof PRIZE_CLAIM_EXPIRATION_DAYS[number];

const SINGLE_LINE_MAX = 200;
const NOTES_MAX = 2000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  backupPrize: string | null;
  sizeOrVariant: string | null;
  recipientName: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
  winnerNotes: string | null;
};

export function validatePrizeClaimSubmission(formData: FormData):
  | { input: PrizeClaimSubmissionInput; error?: never }
  | { error: string; input?: never } {
  const fields = {
    preferredPrize: singleLine(formData.get("preferredPrize"), "Preferred prize", true),
    backupPrize: singleLine(formData.get("backupPrize"), "Backup prize"),
    sizeOrVariant: singleLine(formData.get("sizeOrVariant"), "Size or variant"),
    recipientName: singleLine(formData.get("recipientName"), "Recipient name", true),
    email: singleLine(formData.get("email"), "Email"),
    phone: singleLine(formData.get("phone"), "Phone"),
    addressLine1: singleLine(formData.get("addressLine1"), "Address line 1"),
    addressLine2: singleLine(formData.get("addressLine2"), "Address line 2"),
    city: singleLine(formData.get("city"), "City"),
    stateProvince: singleLine(formData.get("stateProvince"), "State or province"),
    postalCode: singleLine(formData.get("postalCode"), "Postal code"),
    country: singleLine(formData.get("country"), "Country"),
    winnerNotes: notes(formData.get("winnerNotes")),
  };

  for (const field of Object.values(fields)) {
    if ("error" in field && typeof field.error === "string") {
      return { error: field.error };
    }
  }

  const value = (field: { value?: string }) => field.value?.trim() || null;
  const email = value(fields.email);
  const phone = value(fields.phone);
  if (!email && !phone) return { error: "Enter an email address or phone number." };
  if (email && !EMAIL_PATTERN.test(email)) return { error: "Enter a valid email address." };

  return {
    input: {
      preferredPrize: fields.preferredPrize.value!,
      backupPrize: value(fields.backupPrize),
      sizeOrVariant: value(fields.sizeOrVariant),
      recipientName: fields.recipientName.value!,
      email,
      phone,
      addressLine1: value(fields.addressLine1),
      addressLine2: value(fields.addressLine2),
      city: value(fields.city),
      stateProvince: value(fields.stateProvince),
      postalCode: value(fields.postalCode),
      country: value(fields.country),
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
