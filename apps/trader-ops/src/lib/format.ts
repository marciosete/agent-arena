/** Dense-terminal number formatting: tabular, unambiguous, no trailing noise. */

export function fmtMoney(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function fmtSignedMoney(value: number): string {
  const magnitude = fmtMoney(Math.abs(value));
  if (value > 0) {
    return `+${magnitude}`;
  }
  return value < 0 ? `-${magnitude}` : magnitude;
}

export function fmtOdds(price: number): string {
  return price.toFixed(2);
}

/** Fair probability as a percentage, e.g. 0.415 → "41.5%". */
export function fmtPct(probability: number): string {
  return `${(probability * 100).toFixed(1)}%`;
}

/** Wall-clock HH:MM:SS for "updated at" indicators. */
export function fmtClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', { hour12: false });
}
