export const LIVE_CLAIM_REVALIDATION_INTERVAL_MS = 2_500;

export function shouldPollLiveClaims(input: {
  status: string;
  archivedAt: string | null;
}) {
  return input.status === "OPEN" && !input.archivedAt;
}
