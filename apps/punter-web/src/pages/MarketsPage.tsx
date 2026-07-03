import { useCallback, useMemo } from 'react';
import { FIXTURES, type Fixture, type Market, type Round } from '@arena/contracts';
import { useApi } from '@arena/web-auth';
import { getMarkets, getSimState } from '../api';
import { POLL_MS } from '../config';
import { FLAGS, useFlagOn } from '../flags';
import {
  formatKickoff,
  formatPrice,
  ROUND_LABEL,
  ROUND_ORDER,
  teamFlag,
  teamName,
} from '../format';
import { usePoll } from '../hooks';
import { selectionForTeam } from '../join';
import { usePriceFlashes, type FlashDirection } from '../prices';
import { toSlipSelection, useSlip, type SlipSelection } from '../slip';

/** `/markets` (flag `punter-markets`): fixtures with odds, grouped by round, ~5s poll. */
export function MarketsPage() {
  const apiFetch = useApi();
  const markets = usePoll(
    useCallback(() => getMarkets(apiFetch), [apiFetch]),
    POLL_MS.markets
  );
  const sim = usePoll(
    useCallback(() => getSimState(apiFetch), [apiFetch]),
    POLL_MS.markets
  );
  const slipOn = useFlagOn(FLAGS.betSlip);
  const { openWith } = useSlip();
  const flashes = usePriceFlashes(markets);

  return (
    <main className="page">
      <h1 className="page-title">Markets</h1>
      <MarketsBoard
        markets={markets}
        fixtures={sim?.fixtures ?? FIXTURES}
        flashes={flashes}
        slipOn={slipOn}
        onPick={openWith}
      />
    </main>
  );
}

export interface MarketsBoardProps {
  markets: Market[] | null;
  fixtures: Fixture[];
  flashes: Map<string, FlashDirection>;
  slipOn: boolean;
  onPick: (selection: SlipSelection) => void;
}

export function MarketsBoard({
  markets,
  fixtures,
  flashes,
  slipOn,
  onPick,
}: Readonly<MarketsBoardProps>) {
  const grouped = useMemo(() => groupByRound(markets ?? [], fixtures), [markets, fixtures]);

  // Judge emptiness by joinable rows, not the raw list — a response holding only
  // the outright (fixtureId null) would otherwise render a silent blank board.
  if (grouped.size === 0) {
    return <p className="page-empty">Markets are being priced — check back shortly.</p>;
  }
  return (
    <div className="rounds">
      {ROUND_ORDER.filter((round) => grouped.has(round)).map((round) => (
        <section key={round} className="round-group" aria-label={ROUND_LABEL[round]}>
          <h2 className="round-title">{ROUND_LABEL[round]}</h2>
          {(grouped.get(round) as MarketRow[]).map((row) => (
            <MarketRowView
              key={row.market.id}
              row={row}
              flashes={flashes}
              slipOn={slipOn}
              onPick={onPick}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

interface MarketRow {
  market: Market;
  fixture: Fixture;
}

function groupByRound(markets: Market[], fixtures: Fixture[]): Map<Round, MarketRow[]> {
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const grouped = new Map<Round, MarketRow[]>();
  for (const market of markets) {
    if (market.fixtureId === null) {
      continue; // the outright lives on the bracket's trophy, not the fixture board
    }
    const fixture = fixturesById.get(market.fixtureId);
    if (!fixture) {
      continue;
    }
    const rows = grouped.get(fixture.round) ?? [];
    rows.push({ market, fixture });
    grouped.set(fixture.round, rows);
  }
  for (const rows of grouped.values()) {
    rows.sort((a, b) => a.fixture.kickoff.localeCompare(b.fixture.kickoff));
  }
  return grouped;
}

interface MarketRowViewProps {
  row: MarketRow;
  flashes: Map<string, FlashDirection>;
  slipOn: boolean;
  onPick: (selection: SlipSelection) => void;
}

function MarketRowView({ row, flashes, slipOn, onPick }: Readonly<MarketRowViewProps>) {
  const { market, fixture } = row;
  const open = market.status === 'open';
  // Align price buttons to home/away via the selection-name ↔ team-name join.
  const home = selectionForTeam(market, fixture.homeTeamId);
  const away = selectionForTeam(market, fixture.awayTeamId);
  const ordered = home && away ? [home, away] : market.selections;

  return (
    <div className={`market-row${open ? '' : ' market-closed'}`}>
      <div className="market-fixture">
        <span className="market-teams">
          {teamFlag(fixture.homeTeamId)} {teamName(fixture.homeTeamId)}
          <span className="market-vs"> v </span>
          {teamName(fixture.awayTeamId)} {teamFlag(fixture.awayTeamId)}
        </span>
        <span className="market-meta">
          {open ? formatKickoff(fixture.kickoff) : market.status.toUpperCase()}
        </span>
      </div>
      <div className="market-prices">
        {ordered.map((selection) => (
          <PriceButton
            key={selection.id}
            label={selection.name}
            price={selection.price}
            flash={flashes.get(selection.id)}
            disabled={!open || !slipOn}
            onClick={() => onPick(toSlipSelection(market, selection))}
          />
        ))}
      </div>
    </div>
  );
}

interface PriceButtonProps {
  label: string;
  price: number;
  flash: FlashDirection | undefined;
  disabled: boolean;
  onClick: () => void;
}

function PriceButton({ label, price, flash, disabled, onClick }: Readonly<PriceButtonProps>) {
  const flashClass = flash ? ` flash-${flash}` : '';
  return (
    <button
      type="button"
      className={`price-btn price-lg${flashClass}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="price-btn-label">{label}</span>
      <span className="price-btn-odds">{formatPrice(price)}</span>
    </button>
  );
}
