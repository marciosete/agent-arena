import {
  MarketSchema,
  SettlementEventSchema,
  teamById,
  type Market,
  type SettlementEvent,
} from '@arena/contracts';

/**
 * Real-shaped test doubles for pricing's /reprice response, parsed through the
 * contract schemas so they can never drift from what pricing actually returns.
 * Selection ids deliberately use an opaque pricing-owned format (`px-sel-*`)
 * that embeds no team id — the §3 join must resolve by name, never by id shape.
 */

let selectionSequence = 0;

function selectionFor(teamId: string, price: number): { id: string; name: string; price: number } {
  selectionSequence += 1;
  const team = teamById(teamId);
  if (!team) {
    throw new Error(`unknown team id in test fixture: ${teamId}`);
  }
  return { id: `px-sel-${selectionSequence.toString(36)}`, name: team.name, price };
}

export function matchWinnerMarket(
  fixtureId: string,
  homeTeamId: string,
  awayTeamId: string,
  status: Market['status'] = 'settled'
): Market {
  return MarketSchema.parse({
    id: fixtureId, // §3: a MATCH_WINNER market's id equals its fixtureId
    type: 'MATCH_WINNER',
    fixtureId,
    name: `${teamById(homeTeamId)?.name} v ${teamById(awayTeamId)?.name}`,
    status,
    selections: [selectionFor(homeTeamId, 1.8), selectionFor(awayTeamId, 2.1)],
  });
}

export function outrightMarket(teamIds: readonly string[]): Market {
  return MarketSchema.parse({
    id: 'outright',
    type: 'OUTRIGHT',
    fixtureId: null,
    name: 'Tournament Winner',
    status: 'open',
    selections: teamIds.map((teamId, index) => selectionFor(teamId, 2 + index)),
  });
}

export function settlementFor(
  fixtureId: string,
  winnerTeamId: string,
  overrides: Partial<SettlementEvent> = {}
): SettlementEvent {
  return SettlementEventSchema.parse({
    fixtureId,
    winnerTeamId,
    homeScore: 2,
    awayScore: 1,
    decidedOnPenalties: false,
    settledAt: '2026-07-03T12:00:00.000Z',
    ...overrides,
  });
}
