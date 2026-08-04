export type RaffleIdentity = { year: number; number: number };

export function getCurrentRaffleYear(now = new Date()) {
  return now.getUTCFullYear();
}

export function isValidRaffleYear(year: number) {
  return Number.isInteger(year) && year >= 1000 && year <= 9999;
}

export function formatRaffleCode({ year, number }: RaffleIdentity) {
  if (!isValidRaffleYear(year)) throw new Error("Raffle year must be a four-digit year.");
  if (!Number.isInteger(number) || number < 1 || number > 999999) {
    throw new Error("Raffle number must be an integer between 1 and 999999.");
  }
  return `ASY-${year}-${String(number).padStart(6, "0")}`;
}

export function parseRaffleSearch(value: string) {
  const normalized = value.trim().toUpperCase();
  const candidate = normalized.startsWith("ASY-") ? normalized.slice(4) : normalized;
  const full = /^(\d{4})-(\d{1,6})$/.exec(candidate);
  if (full) {
    const year = Number(full[1]);
    const number = Number(full[2]);
    return isValidRaffleYear(year) && number >= 1 && number <= 999999 ? { year, number } : null;
  }
  if (!/^\d{1,6}$/.test(candidate)) return null;
  const number = Number(candidate);
  return number >= 1 && number <= 999999 ? { year: null, number } : null;
}
