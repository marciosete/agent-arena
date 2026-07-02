import { teamById, type Fixture, type Market } from '@arena/contracts';
import { PriceButton } from '../components/PriceButton';
import { formatKickoff } from '../format';
import { ROUND_LABEL } from '../rounds';
import { useSlip } from '../slip';
import { flagForSelection } from '../teams';
import { decidedOnPenalties, type FixtureLayout, type Point } from './geometry';

/** SVG-space → CSS-space: the overlay div shares the square container. */
export function pct(value: number): string {
  return `${Math.min(Math.max(value / 10, 6), 94)}%`;
}

function teamLabel(teamId: string | null, fallback: string): string {
  if (!teamId) {
    return fallback;
  }
  const team = teamById(teamId);
  return team ? `${team.flag} ${team.name}` : teamId;
}

function statusLine(fixture: Fixture): string {
  if (fixture.status === 'finished') {
    const pens = decidedOnPenalties(fixture) ? ' · pens' : '';
    return `${fixture.homeScore ?? 0} – ${fixture.awayScore ?? 0}${pens}`;
  }
  if (fixture.status === 'in_play') {
    return 'In play';
  }
  return formatKickoff(fixture.kickoff);
}

function CardPrices({
  market,
  bettable,
}: Readonly<{ market: Market | undefined; bettable: boolean }>) {
  const { openSlip } = useSlip();
  if (!market) {
    return <p className="card-note">No market yet</p>;
  }
  if (market.status === 'settled') {
    return <p className="card-note">Market settled</p>;
  }
  return (
    <div className="card-prices">
      {market.status === 'suspended' ? <p className="card-note">Market suspended</p> : null}
      {market.selections.map((selection) => (
        <PriceButton
          key={selection.id}
          selectionName={selection.name}
          flag={flagForSelection(selection)}
          price={selection.price}
          disabled={market.status !== 'open' || !bettable}
          onPick={() =>
            openSlip({
              marketId: market.id,
              marketName: market.name,
              selectionId: selection.id,
              selectionName: selection.name,
              price: selection.price,
            })
          }
        />
      ))}
    </div>
  );
}

export interface FixtureCardProps {
  layout: FixtureLayout;
  market: Market | undefined;
  /** prices are tappable only when the market is open AND the slip flag is on */
  bettable: boolean;
  onClose: () => void;
}

/** The click-through detail card, anchored near its fixture. */
export function FixtureCard({ layout, market, bettable, onClose }: Readonly<FixtureCardProps>) {
  const { fixture } = layout;
  const anchor: Point =
    layout.home.radius > 200
      ? {
          x: (layout.home.point.x + layout.away.point.x) / 2,
          y: (layout.home.point.y + layout.away.point.y) / 2,
        }
      : layout.winnerPoint;

  return (
    <div
      className="bracket-card"
      role="dialog"
      aria-label={`${fixture.id} details`}
      style={{ left: pct(anchor.x), top: pct(anchor.y) }}
    >
      <button type="button" className="card-close" aria-label="close details" onClick={onClose}>
        ✕
      </button>
      <p className="card-round">{ROUND_LABEL[fixture.round]}</p>
      <p className="card-teams">
        <span>{teamLabel(fixture.homeTeamId, 'TBD')}</span>
        <span className="card-vs">v</span>
        <span>{teamLabel(fixture.awayTeamId, 'TBD')}</span>
      </p>
      <p className="card-status">{statusLine(fixture)}</p>
      <CardPrices market={market} bettable={bettable} />
    </div>
  );
}

export interface OutrightCardProps {
  outright: Market | null;
  bettable: boolean;
  onClose: () => void;
}

/** Trophy click: the tournament-winner market, favourites first. */
export function OutrightCard({ outright, bettable, onClose }: Readonly<OutrightCardProps>) {
  return (
    <div
      className="bracket-card bracket-card--outright"
      role="dialog"
      aria-label="outright market"
      style={{ left: '50%', top: '50%' }}
    >
      <button type="button" className="card-close" aria-label="close details" onClick={onClose}>
        ✕
      </button>
      <p className="card-round">Tournament Winner</p>
      {outright ? (
        <div className="card-prices card-prices--list">
          {outright.status !== 'open' ? (
            <p className="card-note">Market {outright.status}</p>
          ) : null}
          {[...outright.selections]
            .sort((a, b) => a.price - b.price)
            .map((selection) => (
              <OutrightRow
                key={selection.id}
                outright={outright}
                selection={selection}
                bettable={bettable}
              />
            ))}
        </div>
      ) : (
        <p className="card-note">No outright market yet</p>
      )}
    </div>
  );
}

function OutrightRow({
  outright,
  selection,
  bettable,
}: Readonly<{
  outright: Market;
  selection: Market['selections'][number];
  bettable: boolean;
}>) {
  const { openSlip } = useSlip();
  return (
    <PriceButton
      selectionName={selection.name}
      flag={flagForSelection(selection)}
      price={selection.price}
      disabled={outright.status !== 'open' || !bettable}
      onPick={() =>
        openSlip({
          marketId: outright.id,
          marketName: outright.name,
          selectionId: selection.id,
          selectionName: selection.name,
          price: selection.price,
        })
      }
    />
  );
}

export interface TipProps {
  at: Point;
  lines: string[];
}

/** Transient hover tooltip — pure display, pointer-events off. */
export function BracketTip({ at, lines }: Readonly<TipProps>) {
  return (
    <div className="bracket-tip" role="status" style={{ left: pct(at.x), top: pct(at.y) }}>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
