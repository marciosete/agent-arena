import { describe, expect, it } from 'vitest';
import { sharp } from '../strategies/sharp';
import { bet, matchMarket } from './fixtures';

// Real TEAMS elo: France 2100, Paraguay 1750 → p(France) ≈ 0.8823, fair ≈ 1.13.
// Canada 1850, Mexico 1850 → p = 0.5, fair = 2.00.
const franceValue = () =>
  matchMarket('f1', { name: 'France', price: 1.3 }, { name: 'Paraguay', price: 6.0 });

describe('sharp', () => {
  it("bets only when his fair price beats the market's", () => {
    // France at 1.10 is below Sharp's ≈1.13 fair price — no bet anywhere.
    const noValue = matchMarket(
      'f1',
      { name: 'France', price: 1.1 },
      { name: 'Paraguay', price: 6.0 }
    );
    expect(sharp([noValue], 10_000, [])).toEqual([]);

    // France at 1.30 clears it — Sharp fires.
    const bets = sharp([franceValue()], 10_000, []);
    expect(bets).toHaveLength(1);
    expect(bets[0].selectionName).toBe('France');
    expect(bets[0].price).toBe(1.3);
    expect(bets[0].reason).toContain('edge');
  });

  it('caps the Kelly stake at 10% of the bankroll', () => {
    // Raw Kelly on France @ 1.30 is ≈49% of bankroll — the cap holds it at 10%.
    const [intent] = sharp([franceValue()], 10_000, []);
    expect(intent.stake).toBe(1_000);
  });

  it('stakes the uncapped Kelly fraction when the edge is small', () => {
    // Equal-elo coin flip priced 2.10: Kelly = (1.1·0.5 − 0.5)/1.1 ≈ 4.5%.
    const coinFlip = matchMarket(
      'c1',
      { name: 'Canada', price: 2.1 },
      { name: 'Mexico', price: 1.7 }
    );
    const [intent] = sharp([coinFlip], 10_000, []);
    expect(intent.selectionName).toBe('Canada');
    expect(intent.stake).toBeCloseTo(454.55, 2);
  });

  it('takes the single best edge when several markets offer value', () => {
    const coinFlip = matchMarket(
      'c1',
      { name: 'Canada', price: 2.1 },
      { name: 'Mexico', price: 1.7 }
    );
    const [intent] = sharp([coinFlip, franceValue()], 10_000, []);
    expect(intent.selectionName).toBe('France'); // 14.7% edge beats 5%
  });

  it('skips selections that do not match a real team by name', () => {
    const fantasy = matchMarket(
      'x1',
      { name: 'Atlantis', price: 9.0 },
      { name: 'El Dorado', price: 9.0 }
    );
    expect(sharp([fantasy], 10_000, [])).toEqual([]);
  });

  it('ignores markets he already has a pending bet on', () => {
    const pending = bet({ marketId: 'f1', status: 'pending' });
    expect(sharp([franceValue()], 10_000, [pending])).toEqual([]);
  });

  it('ignores suspended markets and non match-winner markets', () => {
    const suspended = matchMarket(
      'f1',
      { name: 'France', price: 1.3 },
      { name: 'Paraguay', price: 6.0 },
      { status: 'suspended' }
    );
    const outright = matchMarket(
      'outright',
      { name: 'France', price: 4.0 },
      { name: 'Brazil', price: 5.0 },
      { type: 'OUTRIGHT', fixtureId: null }
    );
    expect(sharp([suspended, outright], 10_000, [])).toEqual([]);
  });

  it('passes when the bankroll cannot fund a meaningful stake', () => {
    expect(sharp([franceValue()], 0.5, [])).toEqual([]);
  });
});
