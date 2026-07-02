/** Decimal odds always print with two places: 1.8 → “1.80”. */
export function formatPrice(price: number): string {
  return price.toFixed(2);
}

/** Donut dollars: whole numbers stay whole, fractional stakes keep two places. */
export function formatDonuts(amount: number): string {
  return `🍩 ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** Kickoff timestamps render short and local: “Sat 4 Jul, 17:00”. */
export function formatKickoff(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'TBC';
  }
  const day = date.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${day}, ${time}`;
}
