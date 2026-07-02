import type { BotSpec } from './bot';
import { chaser } from './strategies/chaser';
import { mug } from './strategies/mug';
import { sharp } from './strategies/sharp';
import { steady } from './strategies/steady';

/**
 * The four personalities. Mug's randomness is injected here so the strategy
 * itself stays pure and deterministic under test.
 */
export function buildRoster(rng: () => number = Math.random): BotSpec[] {
  return [
    { name: 'Sharp', emoji: '📐', strategy: sharp },
    {
      name: 'Mug',
      emoji: '🎲',
      strategy: (markets, bankroll, history) => mug(markets, bankroll, history, rng),
    },
    { name: 'Steady', emoji: '🛡️', strategy: steady },
    { name: 'Chaser', emoji: '🔥', strategy: chaser },
  ];
}
