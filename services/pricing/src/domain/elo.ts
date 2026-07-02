/**
 * Logistic Elo expectation: the probability that a team rated `rating` beats
 * one rated `opponent`. Knockout football always produces a winner (extra time
 * and penalties are baked into the number), so a two-way market's
 * probabilities sum to exactly 1.
 */
export function winProbability(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}
