import { useCallback, useEffect, useState } from 'react';
import { OPENING_BALANCE, type Bet } from '@arena/contracts';
import { useAuth } from '@arena/web-auth';
import { fetchMarket, placeBet } from '../api';
import { formatDonuts, formatPrice } from '../format';
import { useFeature } from '../flags';
import { useSlip, type SlipSelection } from '../slip';
import { flagForSelection } from '../teams';
import { usePriceFlash } from './PriceButton';

type Phase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'price-moved'; newPrice: number }
  | { kind: 'placed'; bet: Bet }
  | { kind: 'error'; message: string };

const QUICK_STAKES = [25, 100, 500, 1000];

function stakeProblem(stake: number, balance: number): string | null {
  if (!Number.isFinite(stake) || stake <= 0) {
    return null; // nothing typed yet — no nagging, just a disabled button
  }
  if (stake > balance) {
    return 'That’s more than your balance.';
  }
  if (stake > OPENING_BALANCE) {
    return `Max stake is ${formatDonuts(OPENING_BALANCE)}.`;
  }
  return null;
}

function SlipBody({ selection }: Readonly<{ selection: SlipSelection }>) {
  const { apiFetch, session, refreshBalance } = useAuth();
  const { clearSlip } = useSlip();
  const [price, setPrice] = useState(selection.price);
  const [stakeText, setStakeText] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const flash = usePriceFlash(price);

  useEffect(() => {
    setPrice(selection.price);
    setStakeText('');
    setPhase({ kind: 'idle' });
  }, [selection]);

  const balance = session?.account.balance ?? 0;
  const stake = Number(stakeText);
  const problem = stakeProblem(stake, balance);
  const stakeValid = Number.isFinite(stake) && stake > 0 && problem === null;

  const submit = useCallback(
    async (acceptedPrice: number) => {
      setPhase({ kind: 'submitting' });
      const result = await placeBet(apiFetch, {
        marketId: selection.marketId,
        selectionId: selection.selectionId,
        stake,
        acceptedPrice,
        // A fresh key per attempt: a retried 409-acceptance is a NEW bet request.
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.kind === 'placed') {
        await refreshBalance();
        setPhase(result);
        return;
      }
      if (result.kind === 'price-moved') {
        const market = await fetchMarket(apiFetch, selection.marketId);
        const moved = market?.selections.find((entry) => entry.id === selection.selectionId);
        if (market?.status === 'open' && moved) {
          setPhase({ kind: 'price-moved', newPrice: moved.price });
        } else {
          setPhase({ kind: 'error', message: 'That market is no longer open.' });
        }
        return;
      }
      if (result.kind === 'rejected') {
        setPhase({ kind: 'error', message: result.message });
        return;
      }
      setPhase({ kind: 'error', message: 'Betting is unreachable right now — try again shortly.' });
    },
    [apiFetch, refreshBalance, selection, stake]
  );

  const acceptNewPrice = (newPrice: number) => {
    setPrice(newPrice);
    void submit(newPrice);
  };

  if (phase.kind === 'placed') {
    return (
      <div className="slip-confirm" role="status">
        <p className="slip-confirm-mark" aria-hidden="true">
          ✓
        </p>
        <p className="slip-confirm-title">Bet placed</p>
        <p className="slip-confirm-line">
          {selection.selectionName} @ {formatPrice(phase.bet.price)}
        </p>
        <p className="slip-confirm-line">To return {formatDonuts(phase.bet.potentialReturn)}</p>
        <button type="button" className="slip-place" onClick={clearSlip}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="slip-body">
      <p className="slip-market">{selection.marketName}</p>
      <p className="slip-selection">
        <span aria-hidden="true">{flagForSelection({ name: selection.selectionName })}</span>{' '}
        {selection.selectionName}
        <span className={['slip-price', flash ? `slip-price--${flash}` : ''].join(' ').trim()}>
          {formatPrice(price)}
        </span>
      </p>

      <label className="slip-stake-label" htmlFor="slip-stake">
        Stake
      </label>
      <input
        id="slip-stake"
        className="slip-stake"
        type="number"
        inputMode="decimal"
        min="0"
        placeholder="0"
        value={stakeText}
        onChange={(event) => setStakeText(event.target.value)}
      />
      <div className="slip-quick">
        {QUICK_STAKES.map((amount) => (
          <button
            key={amount}
            type="button"
            className="slip-chip"
            onClick={() => setStakeText(String(amount))}
          >
            {amount.toLocaleString('en-US')}
          </button>
        ))}
      </div>

      {problem ? <p className="slip-problem">{problem}</p> : null}
      {stakeValid ? (
        <dl className="slip-math">
          <div className="slip-math-row">
            <dt>To return</dt>
            <dd>{formatDonuts(stake * price)}</dd>
          </div>
          <div className="slip-math-row">
            <dt>Balance after</dt>
            <dd>{formatDonuts(balance - stake)}</dd>
          </div>
        </dl>
      ) : null}

      {phase.kind === 'price-moved' ? (
        <div className="slip-moved" role="alert">
          <p>
            The price moved: {formatPrice(price)} → {formatPrice(phase.newPrice)}
          </p>
          <div className="slip-moved-actions">
            <button
              type="button"
              className="slip-place"
              onClick={() => acceptNewPrice(phase.newPrice)}
            >
              Take {formatPrice(phase.newPrice)}
            </button>
            <button type="button" className="slip-cancel" onClick={clearSlip}>
              No thanks
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="slip-place"
          disabled={!stakeValid || phase.kind === 'submitting'}
          onClick={() => void submit(price)}
        >
          {phase.kind === 'submitting' ? 'Placing…' : 'Place bet'}
        </button>
      )}

      {phase.kind === 'error' ? (
        <p className="slip-problem" role="alert">
          {phase.message}
        </p>
      ) : null}
    </div>
  );
}

/** The bet slip: a right-hand drawer available over any page while its flag is on. */
export function BetSlip() {
  const slipOn = useFeature('punter-bet-slip');
  const { selection, isOpen, closeSlip } = useSlip();

  if (!slipOn || !isOpen) {
    return null;
  }
  return (
    <>
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="close bet slip"
        onClick={closeSlip}
      />
      <aside className="drawer" role="dialog" aria-label="bet slip">
        <header className="drawer-top">
          <h2 className="drawer-title">Bet Slip</h2>
          <button type="button" className="drawer-close" aria-label="close" onClick={closeSlip}>
            ✕
          </button>
        </header>
        {selection ? (
          <SlipBody selection={selection} />
        ) : (
          <p className="slip-empty">Tap a price anywhere to load your slip.</p>
        )}
      </aside>
    </>
  );
}
