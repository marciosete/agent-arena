import { FIXTURES, type Market, type Selection, type Team } from '@arena/contracts';
import { winProbability } from './elo';
import { priceFromProbability } from './margin';

/** Integration.md §3: the OUTRIGHT market's id is the fixed string 'outright'. */
export const OUTRIGHT_MARKET_ID = 'outright';
export const OUTRIGHT_MARKET_NAME = 'Tournament Winner';

/**
 * Selections carry no teamId in the contract (consumers join by name);
 * we keep it internally so repricing and pruning stay exact.
 */
export interface PricedSelection extends Selection {
  teamId: string;
  probability: number;
}

export interface PricedMarket extends Omit<Market, 'selections'> {
  selections: PricedSelection[];
}

/** Deterministic + stable, so seeding and repricing are idempotent upserts. */
export function selectionId(marketId: string, teamId: string): string {
  return `${marketId}:${teamId}`;
}

function buildSelection(marketId: string, team: Team, probability: number): PricedSelection {
  return {
    id: selectionId(marketId, team.id),
    teamId: team.id,
    // The load-bearing §3 join: Selection.name MUST equal Team.name exactly.
    name: team.name,
    price: priceFromProbability(probability),
    probability,
  };
}

/** A MATCH_WINNER market's id equals its fixtureId (derivable ids, §3). */
export function buildMatchWinnerMarket(fixtureId: string, home: Team, away: Team): PricedMarket {
  const homeWinProbability = winProbability(home.elo, away.elo);
  return {
    id: fixtureId,
    type: 'MATCH_WINNER',
    fixtureId,
    name: `${home.name} v ${away.name}`,
    status: 'open',
    selections: [
      buildSelection(fixtureId, home, homeWinProbability),
      buildSelection(fixtureId, away, 1 - homeWinProbability),
    ],
  };
}

export function buildOutrightMarket(
  probabilities: ReadonlyMap<string, number>,
  alive: Team[]
): PricedMarket {
  return {
    id: OUTRIGHT_MARKET_ID,
    type: 'OUTRIGHT',
    fixtureId: null,
    name: OUTRIGHT_MARKET_NAME,
    status: 'open',
    selections: alive.map((team) =>
      buildSelection(OUTRIGHT_MARKET_ID, team, probabilities.get(team.id) ?? 0)
    ),
  };
}

/** Favourites first; name as a deterministic tiebreak. */
function sortSelections(selections: PricedSelection[]): PricedSelection[] {
  return [...selections].sort(
    (a, b) => b.probability - a.probability || a.name.localeCompare(b.name)
  );
}

const fixtureRank = new Map(FIXTURES.map((fixture, index) => [fixture.id, index]));

/** Bracket order for match markets, the outright last. */
export function sortMarkets(markets: PricedMarket[]): PricedMarket[] {
  const rank = (market: PricedMarket): number =>
    market.type === 'OUTRIGHT'
      ? Number.MAX_SAFE_INTEGER
      : (fixtureRank.get(market.fixtureId ?? '') ?? Number.MAX_SAFE_INTEGER - 1);
  return [...markets].sort((a, b) => rank(a) - rank(b));
}

/** Exact contract shape out the door: strip the internal teamId. */
export function toContractMarket(market: PricedMarket): Market {
  return {
    id: market.id,
    type: market.type,
    fixtureId: market.fixtureId,
    name: market.name,
    status: market.status,
    selections: sortSelections(market.selections).map((selection) => ({
      id: selection.id,
      name: selection.name,
      price: selection.price,
      probability: selection.probability,
    })),
  };
}
