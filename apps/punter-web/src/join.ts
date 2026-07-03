import { teamById, type Market, type Selection } from '@arena/contracts';

/**
 * The bracket ↔ market join (integration.md §3): a MATCH_WINNER market points at
 * its fixture via `fixtureId`, and a selection maps to a team by `name` equality
 * with `Team.name` — selections carry no teamId; never guess id formats.
 */
export function marketsByFixture(markets: Market[] | null): Map<string, Market> {
  const map = new Map<string, Market>();
  for (const market of markets ?? []) {
    if (market.fixtureId !== null) {
      map.set(market.fixtureId, market);
    }
  }
  return map;
}

export function selectionForTeam(
  market: Market | undefined,
  teamId: string | null
): Selection | undefined {
  if (!market || !teamId) {
    return undefined;
  }
  const name = teamById(teamId)?.name;
  return name ? market.selections.find((selection) => selection.name === name) : undefined;
}

export function isBettable(market: Market | undefined): market is Market {
  return market !== undefined && market.status === 'open';
}
