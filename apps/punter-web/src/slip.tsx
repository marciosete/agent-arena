import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { OPENING_BALANCE, type Bet, type Market, type Selection } from '@arena/contracts';
import { useAuth } from '@arena/web-auth';
import { getMarket, placeBet } from './api';
import { FLAGS, useFlagOn } from './flags';
import { formatDonuts, formatPrice } from './format';
import { isBettable } from './join';

/** What a price button hands to the slip. */
export interface SlipSelection {
  marketId: string;
  selectionId: string;
  selectionName: string;
  marketName: string;
  price: number;
}

/** Build the slip payload every price button hands over. */
export function toSlipSelection(market: Market, selection: Selection): SlipSelection {
  return {
    marketId: market.id,
    selectionId: selection.id,
    selectionName: selection.name,
    marketName: market.name,
    price: selection.price,
  };
}

/**
 * Only a plain decimal amount (max 2dp) counts as a stake — `parseFloat` would
 * silently truncate '10,50' or '5x' to a number the punter never typed.
 */
export function parseStake(text: string): number | null {
  const [whole, decimals, ...rest] = text.trim().split('.');
  if (rest.length > 0 || !/^\d+$/.test(whole)) {
    return null;
  }
  if (decimals !== undefined && !/^\d{1,2}$/.test(decimals)) {
    return null;
  }
  return Number(text.trim());
}

interface SlipContextValue {
  selection: SlipSelection | null;
  isOpen: boolean;
  /** Open the drawer pre-filled from a price button. */
  openWith: (selection: SlipSelection) => void;
  /** Open the drawer as-is (the nav item). */
  openEmpty: () => void;
  close: () => void;
  clear: () => void;
}

const SlipContext = createContext<SlipContextValue | null>(null);

export function SlipProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [selection, setSelection] = useState<SlipSelection | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openWith = useCallback((next: SlipSelection) => {
    setSelection(next);
    setIsOpen(true);
  }, []);
  const openEmpty = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const clear = useCallback(() => setSelection(null), []);

  const value = useMemo(
    () => ({ selection, isOpen, openWith, openEmpty, close, clear }),
    [selection, isOpen, openWith, openEmpty, close, clear]
  );
  return <SlipContext.Provider value={value}>{children}</SlipContext.Provider>;
}

export function useSlip(): SlipContextValue {
  const ctx = useContext(SlipContext);
  if (!ctx) {
    throw new Error('useSlip() must be used within a <SlipProvider>.');
  }
  return ctx;
}

type SubmitState =
  | { phase: 'idle' }
  | { phase: 'placing' }
  | { phase: 'conflict'; newPrice: number | null }
  | { phase: 'placed'; bet: Bet }
  | { phase: 'error'; message: string };

/**
 * The bet slip — a right-hand drawer available over any page (flag `punter-bet-slip`).
 * Submits `{ marketId, selectionId, stake, acceptedPrice, idempotencyKey }` — no
 * accountId (betting derives the punter from the Bearer token). The idempotency
 * key is minted once per slip and KEPT across error retries, so a response lost
 * after the server committed can never double-charge; accepting a moved price
 * (409) is a new request and rotates the key. A 409 is always re-offered at the
 * fresh price, never silently accepted.
 */
export function BetSlipDrawer() {
  const enabled = useFlagOn(FLAGS.betSlip);
  const { selection, isOpen, close, clear } = useSlip();

  if (!enabled || !isOpen) {
    return null;
  }
  return (
    <div className="slip-layer">
      <button type="button" className="slip-backdrop" aria-label="Close bet slip" onClick={close} />
      <aside className="slip" aria-label="Bet slip">
        <div className="slip-head">
          <h2 className="slip-title">Bet slip</h2>
          <button type="button" className="slip-close" aria-label="Close" onClick={close}>
            ✕
          </button>
        </div>
        {selection ? (
          // Keyed on the price too: re-picking the same selection after its price
          // moved must remount the form, not keep quoting the stale price.
          <SlipForm
            key={`${selection.marketId}:${selection.selectionId}:${selection.price}`}
            selection={selection}
            onDone={clear}
          />
        ) : (
          <p className="slip-empty">Nothing on the slip yet — tap a price to start a bet.</p>
        )}
      </aside>
    </div>
  );
}

function SlipForm({
  selection,
  onDone,
}: Readonly<{ selection: SlipSelection; onDone: () => void }>) {
  const { session, apiFetch, refreshBalance } = useAuth();
  const [price, setPrice] = useState(selection.price);
  const [stakeText, setStakeText] = useState('');
  const [state, setState] = useState<SubmitState>({ phase: 'idle' });
  // One key per slip: retrying after a lost/failed response replays the SAME
  // request, so the betting service can dedupe instead of double-charging.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const balance = session?.account.balance ?? 0;
  // The contract caps a single stake at OPENING_BALANCE even for richer punters.
  const maxStake = Math.min(balance, OPENING_BALANCE);
  const stake = parseStake(stakeText);
  const stakeValid = stake !== null && stake > 0 && stake <= maxStake;
  const overMax = stake !== null && stake > maxStake;
  const malformed = stakeText.trim() !== '' && stake === null;

  const submit = async (acceptedPrice: number, key: string): Promise<void> => {
    if (stake === null) {
      return;
    }
    setState({ phase: 'placing' });
    const result = await placeBet(apiFetch, {
      marketId: selection.marketId,
      selectionId: selection.selectionId,
      stake,
      acceptedPrice,
      idempotencyKey: key,
    });
    if (result.kind === 'placed') {
      // The bet is committed — a failed balance re-read must not resurrect the
      // form (a retry would double-place); the header poll catches up shortly.
      await refreshBalance().catch(() => undefined);
      setState({ phase: 'placed', bet: result.bet });
      return;
    }
    if (result.kind === 'price-moved') {
      const market = (await getMarket(apiFetch, selection.marketId)) ?? undefined;
      // Only re-offer a price the punter could actually take: a market that
      // suspended or settled since is not a conflict to accept, it's gone.
      const moved = isBettable(market)
        ? market.selections.find((s) => s.id === selection.selectionId)
        : undefined;
      setState({ phase: 'conflict', newPrice: moved?.price ?? null });
      return;
    }
    setState({ phase: 'error', message: result.message });
  };

  if (state.phase === 'placed') {
    return (
      <div className="slip-done" role="status">
        <p className="slip-done-mark">✓</p>
        <p>
          Bet placed — {formatDonuts(state.bet.stake)} on {selection.selectionName} at{' '}
          {formatPrice(state.bet.price)}. Returns {formatDonuts(state.bet.potentialReturn)} if it
          lands.
        </p>
        <button type="button" className="btn-gold" onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="slip-body">
      <div className="slip-pick">
        <span className="slip-pick-name">{selection.selectionName}</span>
        <span className="slip-pick-price">{formatPrice(price)}</span>
      </div>
      <p className="slip-pick-market">{selection.marketName}</p>

      <label className="slip-label" htmlFor="slip-stake">
        Stake
      </label>
      <input
        id="slip-stake"
        className="slip-stake"
        inputMode="decimal"
        placeholder="0"
        value={stakeText}
        onChange={(event) => {
          setStakeText(event.target.value);
          if (state.phase === 'error') {
            setState({ phase: 'idle' });
          }
        }}
        disabled={state.phase === 'placing'}
      />
      {overMax ? (
        <p className="slip-warn" role="alert">
          {stake > balance
            ? `Your balance is ${formatDonuts(balance)} — that stake is too high.`
            : `The maximum stake is ${formatDonuts(OPENING_BALANCE)}.`}
        </p>
      ) : null}
      {malformed ? (
        <p className="slip-warn" role="alert">
          Enter a stake like 25 or 12.50.
        </p>
      ) : null}

      <dl className="slip-math">
        <div>
          <dt>Potential return</dt>
          <dd>{stakeValid ? formatDonuts(stake * price) : '—'}</dd>
        </div>
        <div>
          <dt>Balance after</dt>
          <dd>{stakeValid ? formatDonuts(balance - stake) : formatDonuts(balance)}</dd>
        </div>
      </dl>

      {state.phase === 'conflict' ? (
        <ConflictPanel
          newPrice={state.newPrice}
          canAccept={stakeValid}
          onAccept={(accepted) => {
            // Taking a moved price is a NEW bet request, so it gets a new key.
            const freshKey = crypto.randomUUID();
            setIdempotencyKey(freshKey);
            setPrice(accepted);
            void submit(accepted, freshKey);
          }}
          onCancel={onDone}
        />
      ) : (
        <button
          type="button"
          className="btn-gold slip-place"
          disabled={!stakeValid || state.phase === 'placing'}
          onClick={() => void submit(price, idempotencyKey)}
        >
          {state.phase === 'placing' ? 'Placing…' : 'Place bet'}
        </button>
      )}

      {state.phase === 'error' ? (
        <p className="slip-warn" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

/** A 409 means the price moved: show the fresh price and ask again — never silently re-place. */
function ConflictPanel({
  newPrice,
  canAccept,
  onAccept,
  onCancel,
}: Readonly<{
  newPrice: number | null;
  canAccept: boolean;
  onAccept: (price: number) => void;
  onCancel: () => void;
}>) {
  return (
    <div className="slip-conflict" role="alert">
      {newPrice !== null ? (
        <>
          <p>The price moved — it is now {formatPrice(newPrice)}.</p>
          <div className="slip-conflict-actions">
            <button
              type="button"
              className="btn-gold"
              disabled={!canAccept}
              onClick={() => onAccept(newPrice)}
            >
              Accept {formatPrice(newPrice)}
            </button>
            <button type="button" className="btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p>The price moved and the market can’t be re-offered — pick it again from the board.</p>
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
