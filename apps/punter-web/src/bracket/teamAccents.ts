/**
 * A kit-evocative accent per team, used on node rings and hover glows.
 * Chosen for contrast between rim neighbours (fixture pairs sit adjacent),
 * not for federation accuracy — crests and exact brand colours are off-limits.
 */
export const TEAM_ACCENT: Record<string, string> = {
  CAN: '#ef4444',
  MAR: '#16a34a',
  PAR: '#f472a6',
  FRA: '#4169e1',
  BRA: '#facc15',
  NOR: '#b91c1c',
  MEX: '#047857',
  ENG: '#f8fafc',
  POR: '#dc2626',
  CRO: '#60a5fa',
  ESP: '#e11d48',
  AUT: '#cbd5e1',
  USA: '#1d4ed8',
  BIH: '#fbbf24',
  BEL: '#991b1b',
  SEN: '#34d399',
  ARG: '#7dd3fc',
  CPV: '#2563eb',
  AUS: '#fde047',
  EGY: '#d97706',
  SUI: '#f87171',
  ALG: '#10b981',
  COL: '#f59e0b',
  GHA: '#16803c',
};

export const GOLD = '#d4af37';

export function accentFor(teamId: string | null): string {
  return (teamId && TEAM_ACCENT[teamId]) || GOLD;
}
