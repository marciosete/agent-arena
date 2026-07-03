/**
 * Logistic Elo expectation: the probability that a team rated `elo` beats a
 * team rated `opponentElo` in a knockout tie. Extra time and penalties are
 * baked in — knockout football always produces a winner, so the two-way
 * probabilities sum to exactly 1.
 */
export function winProbability(elo: number, opponentElo: number): number {
  return 1 / (1 + 10 ** ((opponentElo - elo) / 400));
}
