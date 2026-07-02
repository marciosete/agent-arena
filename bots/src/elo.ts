/**
 * Probability the first team beats the second under the classic Elo logistic
 * curve: 1 / (1 + 10^((opponent − own) / 400)).
 */
export function eloWinProbability(elo: number, opponentElo: number): number {
  return 1 / (1 + 10 ** ((opponentElo - elo) / 400));
}
