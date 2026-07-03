import { teamById, type Team } from '@arena/contracts';

/** Look a team up in the contract TEAMS, throwing on an unknown id (data-integrity guard). */
export function requireTeam(teamId: string): Team {
  const team = teamById(teamId);
  if (!team) {
    throw new Error(`Unknown team: ${teamId}`);
  }
  return team;
}
