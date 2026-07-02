/** Whole virtual dollars with thousands separators: 12345.6 → "12,346". */
export function formatMoney(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/**
 * Exact wallet balance — thousands-separated, cents shown only when non-zero.
 * Balances can be fractional (decimal-odds payouts), so this never rounds the
 * way {@link formatMoney} does.
 */
export function formatBalance(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Signed P&L for the leaderboard: +1,200 / -450 / 0. */
export function formatSigned(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${formatMoney(rounded)}` : formatMoney(rounded);
}

/** Decimal odds always at two places: 2 → "2.00". */
export function formatPrice(value: number): string {
  return value.toFixed(2);
}

/** ISO timestamp → local HH:MM:SS for feed rows and "last updated" ticks. */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleTimeString('en-GB', { hour12: false });
}
