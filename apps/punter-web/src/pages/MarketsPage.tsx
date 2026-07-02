import { useCallback } from 'react';
import { fixtureById, type Market, type Round } from '@arena/contracts';
import { useAuth } from '@arena/web-auth';
import { fetchMarkets } from '../api';
import { PriceButton } from '../components/PriceButton';
import { POLL } from '../config';
import { formatKickoff } from '../format';
import { useFeature } from '../flags';
import { usePoll } from '../hooks';
import { ROUND_LABEL, ROUND_ORDER } from '../rounds';
import { useSlip } from '../slip';
import { flagForSelection } from '../teams';

/** Fixture ids are stable across seed and sim, so round/kickoff come from the static structure. */
function roundOf(market: Market): Round | null {
  const fixture = market.fixtureId ? fixtureById(market.fixtureId) : undefined;
  return fixture?.round ?? null;
}

function MarketCard({ market }: Readonly<{ market: Market }>) {
  const slipOn = useFeature('punter-bet-slip');
  const { openSlip } = useSlip();
  const fixture = market.fixtureId ? fixtureById(market.fixtureId) : undefined;
  const bettable = market.status === 'open' && slipOn;

  return (
    <article className={`market-card market-card--${market.status}`} aria-label={market.name}>
      <header className="market-card-top">
        <h3 className="market-name">{market.name}</h3>
        <span className={`market-status market-status--${market.status}`}>
          {market.status === 'open' && fixture ? formatKickoff(fixture.kickoff) : market.status}
        </span>
      </header>
      <div className="market-prices">
        {market.selections.map((selection) => (
          <PriceButton
            key={selection.id}
            selectionName={selection.name}
            flag={flagForSelection(selection)}
            price={selection.price}
            disabled={!bettable}
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
    </article>
  );
}

/** The odds board: every priced fixture, grouped by round, polling ~5s. */
export function MarketsPage() {
  const { apiFetch, session } = useAuth();
  const load = useCallback(() => fetchMarkets(apiFetch), [apiFetch]);
  const markets = usePoll(load, POLL.markets, session?.token);

  if (markets === null) {
    return (
      <main className="shell">
        <h2 className="page-title">Markets</h2>
        <p className="page-empty">Waiting for the market board…</p>
      </main>
    );
  }

  const sections = ROUND_ORDER.map((round) => ({
    round,
    markets: markets.filter((market) => roundOf(market) === round),
  })).filter((section) => section.markets.length > 0);

  return (
    <main className="shell shell--top">
      <h2 className="page-title">Markets</h2>
      {sections.length === 0 ? (
        <p className="page-empty">No open markets yet — check back soon.</p>
      ) : (
        sections.map((section) => (
          <section
            key={section.round}
            className="round-section"
            aria-label={ROUND_LABEL[section.round]}
          >
            <h3 className="round-title">{ROUND_LABEL[section.round]}</h3>
            <div className="market-grid">
              {section.markets.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
