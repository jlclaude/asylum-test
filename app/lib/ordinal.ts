export function formatOrdinal(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const integer = Math.trunc(value);
  const absolute = Math.abs(integer);
  const lastTwo = absolute % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${integer}th`;
  switch (absolute % 10) {
    case 1: return `${integer}st`;
    case 2: return `${integer}nd`;
    case 3: return `${integer}rd`;
    default: return `${integer}th`;
  }
}
