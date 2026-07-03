import { teamById, type Bet, type Round } from '@arena/contracts';
import { prologueTeamById } from './prologue';

/** Contract teams first; prologue (display-only R32 history) nations as fallback. */
function lookupTeam(teamId: string): { name: string; flag: string } | undefined {
  return teamById(teamId) ?? prologueTeamById(teamId);
}

export const ROUND_LABEL: Record<Round, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  F: 'The Final',
};

/** Round order, outermost ring first. */
export const ROUND_ORDER: Round[] = ['R32', 'R16', 'QF', 'SF', 'F'];

export function teamName(teamId: string | null): string {
  if (!teamId) {
    return 'TBD';
  }
  return lookupTeam(teamId)?.name ?? teamId;
}

export function teamFlag(teamId: string | null): string {
  if (!teamId) {
    return '·';
  }
  return lookupTeam(teamId)?.flag ?? '🏳️';
}

/** Rim labels must stay short — long names fall back to the 3-letter id. */
export function teamShortName(teamId: string | null): string {
  if (!teamId) {
    return '';
  }
  const name = lookupTeam(teamId)?.name ?? teamId;
  return name.length <= 12 ? name : teamId;
}

/** Donut dollars — the arena's currency. */
export function formatDonuts(amount: number): string {
  return `🍩 ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** Decimal odds, always two places (2.50). */
export function formatPrice(price: number): string {
  return price.toFixed(2);
}

export function formatKickoff(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * What a bet pays: pending/won show the locked return, lost pays nothing, and a
 * voided bet refunds exactly the stake (standard book semantics).
 */
export function betReturn(bet: Bet): number {
  if (bet.status === 'lost') {
    return 0;
  }
  if (bet.status === 'void') {
    return bet.stake;
  }
  return bet.potentialReturn;
}
