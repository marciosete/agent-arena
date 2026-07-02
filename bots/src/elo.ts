/** The textbook Elo logistic divisor: 400 rating points ≈ 10-to-1 odds. */
export const CLASSIC_ELO_DIVISOR = 400;

/**
 * Probability the first team beats the second under an Elo logistic curve:
 * 1 / (1 + 10^((opponent − own) / divisor)). A smaller divisor steepens the
 * curve — the same rating gap converts to a stronger favourite.
 */
export function eloWinProbability(
  elo: number,
  opponentElo: number,
  divisor = CLASSIC_ELO_DIVISOR
): number {
  return 1 / (1 + 10 ** ((opponentElo - elo) / divisor));
}
