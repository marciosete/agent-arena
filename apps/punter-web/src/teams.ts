import { TEAMS, type Selection, type Team } from '@arena/contracts';

const byName = new Map<string, Team>(TEAMS.map((team) => [team.name, team]));

/**
 * Selections carry no teamId — `Selection.name` equalling `Team.name` is the
 * load-bearing join from integration.md §3. Resolve teams by name, never by
 * guessing an id format.
 */
export function teamForSelection(selection: Pick<Selection, 'name'>): Team | undefined {
  return byName.get(selection.name);
}

export function flagForSelection(selection: Pick<Selection, 'name'>): string {
  return teamForSelection(selection)?.flag ?? '⚽';
}
