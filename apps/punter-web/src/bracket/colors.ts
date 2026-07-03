/**
 * One evocative kit/flag colour per nation — the key art lights each winner's
 * path in the WINNER'S colour (France blue, Brazil yellow, Norway red…), with
 * gold reserved for the trophy, its glow and the champion. The contracts carry
 * no colour field, so this is presentation-only data; the two teams of every
 * seeded fixture were checked to stay distinguishable. Unknown ids fall back
 * to the arena gold.
 */
export const TEAM_COLORS: Record<string, string> = {
  CAN: '#e03131',
  MAR: '#1e9e50',
  PAR: '#d52b1e',
  FRA: '#3b6bff',
  BRA: '#f7d117',
  NOR: '#c8102e',
  MEX: '#0a7a4b',
  ENG: '#e8e8f0',
  POR: '#d81e2c',
  CRO: '#5aa9e6',
  ESP: '#ffb703',
  AUT: '#e63946',
  USA: '#b22234',
  BIH: '#ffcd00',
  BEL: '#fdda25',
  SEN: '#00853f',
  ARG: '#75aadb',
  CPV: '#1d4e89',
  AUS: '#ffb81c',
  EGY: '#ce1126',
  SUI: '#e8112d',
  ALG: '#2ca05a',
  COL: '#ffd100',
  GHA: '#cf2027',
};

const ARENA_GOLD = '#d4af37';

export function teamColor(teamId: string | null): string {
  if (!teamId) {
    return ARENA_GOLD;
  }
  return TEAM_COLORS[teamId] ?? ARENA_GOLD;
}
