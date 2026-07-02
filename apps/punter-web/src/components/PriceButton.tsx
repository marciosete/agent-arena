import { useEffect, useRef, useState } from 'react';
import { formatPrice } from '../format';

export type FlashDirection = 'up' | 'down' | null;

/** Watch a price across renders and report a brief flash when it drifts. */
export function usePriceFlash(price: number, holdMs = 900): FlashDirection {
  const previous = useRef(price);
  const [flash, setFlash] = useState<FlashDirection>(null);

  useEffect(() => {
    if (price === previous.current) {
      return;
    }
    setFlash(price > previous.current ? 'up' : 'down');
    previous.current = price;
    const timer = setTimeout(() => setFlash(null), holdMs);
    return () => clearTimeout(timer);
  }, [price, holdMs]);

  return flash;
}

export interface PriceButtonProps {
  selectionName: string;
  flag?: string;
  price: number;
  /** Suspended / settled markets (or a dark bet-slip flag) render non-clickable. */
  disabled?: boolean;
  onPick?: () => void;
}

/** The tappable odds unit used on the markets board and the bracket cards. */
export function PriceButton({
  selectionName,
  flag,
  price,
  disabled = false,
  onPick,
}: Readonly<PriceButtonProps>) {
  const flash = usePriceFlash(price);
  const classes = ['price-button'];
  if (flash) {
    classes.push(`price-button--${flash}`);
  }
  return (
    <button
      type="button"
      className={classes.join(' ')}
      disabled={disabled}
      onClick={onPick}
      aria-label={`Back ${selectionName} at ${formatPrice(price)}`}
    >
      <span className="price-team">
        {flag ? (
          <span className="price-flag" aria-hidden="true">
            {flag}
          </span>
        ) : null}
        {selectionName}
      </span>
      <span className="price-odds">{formatPrice(price)}</span>
    </button>
  );
}
