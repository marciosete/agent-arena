import type { Round } from '@arena/contracts';

export const ROUND_ORDER: Round[] = ['R32', 'R16', 'QF', 'SF', 'F'];

export const ROUND_LABEL: Record<Round, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  F: 'The Final',
};
