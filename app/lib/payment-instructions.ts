export const PAYMENT_INSTRUCTIONS_MAX_LENGTH = 4_000;

export function validatePaymentInstructions(value: string): {
  value: string;
  error?: string;
} {
  const trimmed = value.trim();
  if (trimmed.length > PAYMENT_INSTRUCTIONS_MAX_LENGTH) {
    return {
      value: trimmed,
      error: `Payment instructions must be ${PAYMENT_INSTRUCTIONS_MAX_LENGTH.toLocaleString()} characters or fewer.`,
    };
  }
  return { value: trimmed };
}

export function publicPaymentInstructionsPayload(
  settings: { paymentInstructions: string | null } | null,
) {
  return settings?.paymentInstructions ?? null;
}
