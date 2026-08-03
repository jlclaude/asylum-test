export function formatRaffleCode(raffleNumber: number) {
  if (!Number.isInteger(raffleNumber) || raffleNumber < 1 || raffleNumber > 999999) {
    throw new Error("Raffle number must be an integer between 1 and 999999.");
  }
  return `ASY-${String(raffleNumber).padStart(6, "0")}`;
}

export function parseRaffleSearch(value: string) {
  const normalized = value.trim().toUpperCase();
  const numeric = normalized.startsWith("ASY-") ? normalized.slice(4) : normalized;
  if (!/^\d{1,6}$/.test(numeric)) return null;
  const raffleNumber = Number(numeric);
  return raffleNumber >= 1 && raffleNumber <= 999999 ? raffleNumber : null;
}
