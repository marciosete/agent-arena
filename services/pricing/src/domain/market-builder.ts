import type { Fixture, Market, Selection, Team } from '@arena/contracts';
import { winProbability } from './elo';
import { priceFromProbability } from './margin';

/** Hard contract: the single outright market's id (integration.md §3). */
export const OUTRIGHT_MARKET_ID = 'outright';
export const OUTRIGHT_MARKET_NAME = 'Tournament Winner';

/** A selection whose fair probability is always present (we always model it). */
export type PricedSelection = Selection & { probability: number };
export type PricedMarket = Omit<Market, 'selections'> & { selections: PricedSelection[] };

function requireTeam(teams: Team[], teamId: string): Team {
  const team = teams.find((candidate) => candidate.id === teamId);
  if (!team) {
    throw new Error(`Unknown team '${teamId}'`);
  }
  return team;
}

/**
 * Selection ids are deterministic ('<marketId>:<teamId>') so reprices and
 * restarts upsert cleanly; `name` MUST equal Team.name — the platform's only
 * selection join (integration.md §3).
 */
function buildSelection(marketId: string, team: Team, probability: number): PricedSelection {
  return {
    id: `${marketId}:${team.id}`,
    name: team.name,
    price: priceFromProbability(probability),
    probability,
  };
}

/**
 * Two-way match-winner market for a fixture with both teams known.
 * Hard contract: market id == fixtureId; selections named exactly Team.name.
 */
export function buildMatchWinnerMarket(fixture: Fixture, teams: Team[]): PricedMarket {
  if (!fixture.homeTeamId || !fixture.awayTeamId) {
    throw new Error(`Fixture '${fixture.id}' is not priceable: teams undecided`);
  }
  const home = requireTeam(teams, fixture.homeTeamId);
  const away = requireTeam(teams, fixture.awayTeamId);
  const homeWin = winProbability(home.elo, away.elo);
  return {
    id: fixture.id,
    type: 'MATCH_WINNER',
    fixtureId: fixture.id,
    name: `${home.name} v ${away.name}`,
    status: fixture.status === 'finished' ? 'settled' : 'open',
    selections: [
      buildSelection(fixture.id, home, homeWin),
      buildSelection(fixture.id, away, 1 - homeWin),
    ],
  };
}

/** Favourite first; ties broken alphabetically so listings are stable. */
function byPriceThenName(a: PricedSelection, b: PricedSelection): number {
  return a.price - b.price || a.name.localeCompare(b.name);
}

function outrightMarket(selections: PricedSelection[], status: Market['status']): PricedMarket {
  return {
    id: OUTRIGHT_MARKET_ID,
    type: 'OUTRIGHT',
    fixtureId: null,
    name: OUTRIGHT_MARKET_NAME,
    status,
    selections: [...selections].sort(byPriceThenName),
  };
}

/**
 * Tournament-winner market: one selection per team still alive, priced from
 * Monte Carlo champion probabilities, favourite first.
 */
export function buildOutrightMarket(
  championProbabilities: Map<string, number>,
  alive: string[],
  teams: Team[]
): PricedMarket {
  const selections = alive.map((teamId) =>
    buildSelection(
      OUTRIGHT_MARKET_ID,
      requireTeam(teams, teamId),
      championProbabilities.get(teamId) ?? 0
    )
  );
  return outrightMarket(selections, 'open');
}

/**
 * Once the final is played the outright settles. Both finalists stay on the
 * market (the schema requires ≥2 selections, and the simulator resolves the
 * champion's selection by team name), with the result reflected as
 * probability 1 / 0.
 */
export function buildSettledOutrightMarket(final: Fixture, teams: Team[]): PricedMarket {
  if (!final.homeTeamId || !final.awayTeamId || !final.winnerTeamId) {
    throw new Error(`Final '${final.id}' is not settled yet`);
  }
  const selections = [final.homeTeamId, final.awayTeamId].map((teamId) =>
    buildSelection(
      OUTRIGHT_MARKET_ID,
      requireTeam(teams, teamId),
      teamId === final.winnerTeamId ? 1 : 0
    )
  );
  return outrightMarket(selections, 'settled');
}

/** Stable listing order: bracket order (the FIXTURES seed order), outright last. */
export function sortMarkets(markets: Market[], fixtures: Fixture[]): Market[] {
  const order = new Map(fixtures.map((fixture, index) => [fixture.id, index]));
  const rank = (market: Market): number =>
    market.fixtureId === null
      ? fixtures.length + 1
      : (order.get(market.fixtureId) ?? fixtures.length);
  return [...markets].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}
