import { describe, expect, it } from 'vitest';
import { MarketSchema, TEAMS, type Market } from '@arena/contracts';
import { resolveWinningSelections } from './winning-selections';
import { matchWinnerMarket, outrightMarket, settlementFor } from './testing/markets';

const POR_CRO = 'R32-9';
const ESP_AUT = 'R32-10';

/** What pricing's /reprice realistically returns mid-tournament. */
function repriceResponse(): Market[] {
  return MarketSchema.array().parse([
    matchWinnerMarket(POR_CRO, 'POR', 'CRO'),
    matchWinnerMarket(ESP_AUT, 'ESP', 'AUT', 'open'),
    outrightMarket(TEAMS.map((team) => team.id)),
  ]);
}

describe('resolveWinningSelections', () => {
  it('resolves the winning selectionId BY TEAM NAME from the settled fixture market', () => {
    const markets = repriceResponse();
    const winners = resolveWinningSelections(markets, settlementFor(POR_CRO, 'POR'), false);

    const matchMarket = markets.find((m) => m.fixtureId === POR_CRO) as Market;
    const portugal = matchMarket.selections.find((s) => s.name === 'Portugal');
    expect(winners).toEqual([{ marketId: matchMarket.id, selectionId: portugal?.id }]);
    // The id came from pricing's own opaque format, not a guessed pattern.
    expect(portugal?.id).toMatch(/^px-sel-/);
    expect(portugal?.id).not.toContain('POR');
  });

  it('picks the market whose fixtureId matches the settlement, not another fixture', () => {
    const markets = repriceResponse();
    const winners = resolveWinningSelections(
      markets,
      settlementFor(ESP_AUT, 'AUT', { homeScore: 0 }),
      false
    );

    expect(winners).toHaveLength(1);
    expect(winners[0]?.marketId).toBe(ESP_AUT);
    const austria = markets
      .find((m) => m.fixtureId === ESP_AUT)
      ?.selections.find((s) => s.name === 'Austria');
    expect(winners[0]?.selectionId).toBe(austria?.id);
  });

  it('ALSO resolves the OUTRIGHT champion selection when the final is played', () => {
    const markets = MarketSchema.array().parse([
      matchWinnerMarket('F-1', 'FRA', 'ESP'),
      outrightMarket(TEAMS.map((team) => team.id)),
    ]);
    const winners = resolveWinningSelections(
      markets,
      settlementFor('F-1', 'ESP', { homeScore: 1, awayScore: 1, decidedOnPenalties: true }),
      true
    );

    const outright = markets.find((m) => m.type === 'OUTRIGHT') as Market;
    const spain = outright.selections.find((s) => s.name === 'Spain');
    expect(winners).toEqual([
      { marketId: 'F-1', selectionId: markets[0]?.selections.find((s) => s.name === 'Spain')?.id },
      { marketId: outright.id, selectionId: spain?.id },
    ]);
    expect(outright.id).toBe('outright');
  });

  it('leaves the outright alone when the played fixture is not the final', () => {
    const winners = resolveWinningSelections(
      repriceResponse(),
      settlementFor(POR_CRO, 'CRO'),
      false
    );
    expect(winners).toHaveLength(1);
    expect(winners[0]?.marketId).toBe(POR_CRO);
  });

  it('returns nothing it cannot resolve: missing market', () => {
    const markets = MarketSchema.array().parse([matchWinnerMarket(ESP_AUT, 'ESP', 'AUT')]);
    expect(resolveWinningSelections(markets, settlementFor(POR_CRO, 'POR'), false)).toEqual([]);
  });

  it('returns nothing it cannot resolve: no selection carries the winner name', () => {
    // Pricing returned a market for the fixture but with the wrong teams — a
    // name-based join must refuse rather than settle the wrong selection.
    const markets = MarketSchema.array().parse([matchWinnerMarket(POR_CRO, 'ESP', 'AUT')]);
    expect(resolveWinningSelections(markets, settlementFor(POR_CRO, 'POR'), false)).toEqual([]);
  });

  it('returns nothing for a winner id that is not in TEAMS', () => {
    expect(
      resolveWinningSelections(repriceResponse(), settlementFor(POR_CRO, 'XXX'), true)
    ).toEqual([]);
  });

  it('test double refuses to build selections for a team outside TEAMS', () => {
    // Guards the guard: the real-shaped market builder can only emit names
    // that exist in the contract seed, keeping these specs honest.
    expect(() => matchWinnerMarket(POR_CRO, 'ZZZ', 'CRO')).toThrow(/unknown team/);
  });

  it('test double outright covers every team, so champion resolution is never vacuous', () => {
    expect(outrightMarket(TEAMS.map((team) => team.id)).selections).toHaveLength(TEAMS.length);
  });
});
