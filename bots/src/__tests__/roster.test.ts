import { describe, expect, it } from 'vitest';
import { buildRoster } from '../roster';
import { matchMarket } from './fixtures';

describe('buildRoster', () => {
  it('fields the four personalities', () => {
    const names = buildRoster().map((spec) => `${spec.emoji} ${spec.name}`);
    expect(names).toEqual(['📐 Sharp', '🎲 Mug', '🛡️ Steady', '🔥 Chaser']);
  });

  it("wires the injected rng into Mug's strategy", () => {
    const roster = buildRoster(() => 0.99);
    const mugSpec = roster.find((spec) => spec.name === 'Mug');
    const board = [
      matchMarket('m1', { name: 'France', price: 3.2 }, { name: 'Paraguay', price: 4.8 }),
    ];
    const [intent] = mugSpec!.strategy(board, 10_000, []);
    expect(intent.selectionName).toBe('Paraguay'); // rng 0.99 → last longshot
  });
});
