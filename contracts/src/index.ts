import { z } from 'zod';
import { FixtureSchema, TeamSchema, type Fixture, type Team } from './schemas';
import teamsJson from './data/teams.json';
import fixturesJson from './data/fixtures.json';

export * from './schemas';
export * from './api';

/**
 * Seed data: the real World Cup 2026 bracket as of 2 July 2026.
 * Validated against the schemas at import time — fail fast, everywhere.
 */
export const TEAMS: Team[] = z.array(TeamSchema).parse(teamsJson);
export const FIXTURES: Fixture[] = z.array(FixtureSchema).parse(fixturesJson);

export function teamById(id: string): Team | undefined {
  return TEAMS.find((team) => team.id === id);
}

export function fixtureById(id: string): Fixture | undefined {
  return FIXTURES.find((fixture) => fixture.id === id);
}
