import { TEAMS, type Bet, type BetStatus } from '@arena/contracts';
import { describe, expect, it } from 'vitest';
import { kellyStake } from '../staking';
import {
  CHASER_BASE_STAKE,
  KELLY_CAP,
  MUG_STAKE,
  STEADY_FRACTION,
  chaserStrategy,
  consecutiveLosses,
  eloWinProbability,
  mugStrategy,
  sharpStrategy,
  steadyStrategy,
} from '../strategies';
import { betFixture, marketFixture, selectionFixture } from './fixtures';

const rngZero = () => 0;

function eloOf(name: string): number {
  const team = TEAMS.find((candidate) => candidate.name === name);
  if (!team) {
    throw new Error(`team ${name} missing from TEAMS`);
  }
  return team.elo;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function settledBet(status: BetStatus, settledAt: string): Bet {
  return betFixture({ status, settledAt });
}

describe('eloWinProbability', () => {
  it('gives evenly-rated teams a coin flip', () => {
    expect(eloWinProbability(1800, 1800)).toBeCloseTo(0.5);
  });

  it('gives a +400 elo favourite ~90.9%', () => {
    expect(eloWinProbability(2200, 1800)).toBeCloseTo(1 / 1.1, 3);
  });
});

describe('sharpStrategy', () => {
  const pFrance = eloWinProbability(eloOf('France'), eloOf('Canada'));
  const fairFrance = 1 / pFrance;
  const fairCanada = 1 / (1 - pFrance);

  it('bets only when the market price beats his Elo fair price, staking capped Kelly', () => {
    const francePrice = round2(fairFrance * 1.15);
    const market = marketFixture({
      selections: [
        selectionFixture({ id: 'sel-france', name: 'France', price: francePrice }),
        selectionFixture({ id: 'sel-canada', name: 'Canada', price: round2(fairCanada * 0.9) }),
      ],
    });

    const intents = sharpStrategy([market], 10_000, [], rngZero);

    expect(intents).toHaveLength(1);
    expect(intents[0].selectionId).toBe('sel-france');
    expect(intents[0].acceptedPrice).toBe(francePrice);
    expect(intents[0].stake).toBe(kellyStake(pFrance, francePrice, 10_000, KELLY_CAP));
    expect(intents[0].stake).toBeGreaterThan(0);
    expect(intents[0].stake).toBeLessThanOrEqual(10_000 * KELLY_CAP);
    expect(intents[0].reason).toContain('edge');
  });

  it('caps the stake at 10% of bankroll however juicy the price', () => {
    const market = marketFixture({
      selections: [
        selectionFixture({ id: 'sel-france', name: 'France', price: round2(fairFrance * 2) }),
        selectionFixture({ id: 'sel-canada', name: 'Canada', price: 1.01 }),
      ],
    });

    const intents = sharpStrategy([market], 10_000, [], rngZero);

    expect(intents).toHaveLength(1);
    expect(intents[0].stake).toBe(1000);
  });

  it('sits out when every price is at or below fair — no edge, no bet', () => {
    const market = marketFixture({
      selections: [
        selectionFixture({ id: 'sel-france', name: 'France', price: round2(fairFrance * 0.95) }),
        selectionFixture({ id: 'sel-canada', name: 'Canada', price: round2(fairCanada * 0.95) }),
      ],
    });

    expect(sharpStrategy([market], 10_000, [], rngZero)).toEqual([]);
  });

  it('ignores suspended markets, outrights and selections that are not teams', () => {
    const juicy = [
      selectionFixture({ id: 'sel-france', name: 'France', price: 50 }),
      selectionFixture({ id: 'sel-canada', name: 'Canada', price: 50 }),
    ];
    const suspended = marketFixture({ status: 'suspended', selections: juicy });
    const outright = marketFixture({
      id: 'outright',
      type: 'OUTRIGHT',
      fixtureId: null,
      selections: juicy,
    });
    const unknownTeams = marketFixture({
      selections: [
        selectionFixture({ id: 'sel-a', name: 'Atlantis', price: 50 }),
        selectionFixture({ id: 'sel-b', name: 'El Dorado', price: 50 }),
      ],
    });

    expect(sharpStrategy([suspended, outright, unknownTeams], 10_000, [], rngZero)).toEqual([]);
  });

  it('skips markets that are not two-runner matches and stakes below a dollar', () => {
    const threeRunner = marketFixture({
      selections: [
        selectionFixture({ id: 'sel-france', name: 'France', price: 50 }),
        selectionFixture({ id: 'sel-canada', name: 'Canada', price: 50 }),
        selectionFixture({ id: 'sel-england', name: 'England', price: 50 }),
      ],
    });
    expect(sharpStrategy([threeRunner], 10_000, [], rngZero)).toEqual([]);

    const juicyMarket = marketFixture({
      selections: [
        selectionFixture({ id: 'sel-france', name: 'France', price: round2(fairFrance * 2) }),
        selectionFixture({ id: 'sel-canada', name: 'Canada', price: 1.01 }),
      ],
    });
    // 10% cap on a $5 bankroll can never reach the $1 minimum — dust, no bet.
    expect(sharpStrategy([juicyMarket], 5, [], rngZero)).toEqual([]);
  });
});

describe('mugStrategy', () => {
  const board = marketFixture({
    selections: [
      selectionFixture({ id: 'sel-fav', name: 'France', price: 1.5 }),
      selectionFixture({ id: 'sel-long-1', name: 'Canada', price: 3.5 }),
      selectionFixture({ id: 'sel-long-2', name: 'Morocco', price: 8 }),
    ],
  });

  it('lumps a flat $200 on a random longshot priced above 3.0', () => {
    const intents = mugStrategy([board], 10_000, [], rngZero);

    expect(intents).toHaveLength(1);
    expect(intents[0].selectionId).toBe('sel-long-1');
    expect(intents[0].stake).toBe(MUG_STAKE);
    expect(intents[0].acceptedPrice).toBe(3.5);
  });

  it('uses the rng to pick among longshots', () => {
    const intents = mugStrategy([board], 10_000, [], () => 0.99);
    expect(intents[0].selectionId).toBe('sel-long-2');
  });

  it('punts on anything when the board has no longshots', () => {
    const shortBoard = marketFixture({
      selections: [
        selectionFixture({ id: 'sel-fav', name: 'France', price: 1.5 }),
        selectionFixture({ id: 'sel-dog', name: 'Canada', price: 2.4 }),
      ],
    });
    const intents = mugStrategy([shortBoard], 10_000, [], rngZero);

    expect(intents).toHaveLength(1);
    expect(intents[0].stake).toBe(MUG_STAKE);
  });

  it('sits out when the bankroll cannot cover the flat stake or the board is empty', () => {
    expect(mugStrategy([board], MUG_STAKE - 1, [], rngZero)).toEqual([]);
    expect(mugStrategy([], 10_000, [], rngZero)).toEqual([]);
    expect(mugStrategy([marketFixture({ status: 'settled' })], 10_000, [], rngZero)).toEqual([]);
  });
});

describe('steadyStrategy', () => {
  it('backs the shortest price on the board with a flat 5% of bankroll', () => {
    const markets = [
      marketFixture({
        selections: [
          selectionFixture({ id: 'sel-fav', name: 'France', price: 1.44 }),
          selectionFixture({ id: 'sel-dog', name: 'Canada', price: 2.9 }),
        ],
      }),
      marketFixture({
        id: 'fixture-qf-2',
        fixtureId: 'fixture-qf-2',
        selections: [
          selectionFixture({ id: 'sel-other', name: 'England', price: 1.6 }),
          selectionFixture({ id: 'sel-other-dog', name: 'Mexico', price: 2.5 }),
        ],
      }),
    ];

    const intents = steadyStrategy(markets, 8_000, [], rngZero);

    expect(intents).toHaveLength(1);
    expect(intents[0].selectionId).toBe('sel-fav');
    expect(intents[0].stake).toBe(8_000 * STEADY_FRACTION);
    expect(intents[0].acceptedPrice).toBe(1.44);
  });

  it('sits out on an empty board or a dust bankroll', () => {
    expect(steadyStrategy([], 10_000, [], rngZero)).toEqual([]);
    expect(steadyStrategy([marketFixture()], 10, [], rngZero)).toEqual([]);
  });
});

describe('chaserStrategy', () => {
  const board = marketFixture({
    selections: [
      selectionFixture({ id: 'sel-fav', name: 'France', price: 1.5 }),
      selectionFixture({ id: 'sel-evens', name: 'Canada', price: 2.05 }),
    ],
  });

  it('opens at the base stake on the selection nearest evens', () => {
    const intents = chaserStrategy([board], 10_000, [], rngZero);

    expect(intents).toHaveLength(1);
    expect(intents[0].selectionId).toBe('sel-evens');
    expect(intents[0].stake).toBe(CHASER_BASE_STAKE);
    expect(intents[0].reason).toContain('fresh start');
  });

  it('doubles the stake after each loss', () => {
    const oneLoss = [settledBet('lost', '2026-07-03T10:00:00.000Z')];
    const twoLosses = [
      settledBet('lost', '2026-07-03T10:00:00.000Z'),
      settledBet('lost', '2026-07-03T11:00:00.000Z'),
    ];

    expect(chaserStrategy([board], 10_000, oneLoss, rngZero)[0].stake).toBe(200);
    expect(chaserStrategy([board], 10_000, twoLosses, rngZero)[0].stake).toBe(400);
  });

  it('resets to the base stake after a win, even with older losses on record', () => {
    const history = [
      settledBet('lost', '2026-07-03T09:00:00.000Z'),
      settledBet('lost', '2026-07-03T10:00:00.000Z'),
      settledBet('won', '2026-07-03T11:00:00.000Z'),
    ];

    expect(chaserStrategy([board], 10_000, history, rngZero)[0].stake).toBe(CHASER_BASE_STAKE);
  });

  it('goes all-in when the double exceeds the bankroll — the flame-out', () => {
    const threeLosses = [
      settledBet('lost', '2026-07-03T09:00:00.000Z'),
      settledBet('lost', '2026-07-03T10:00:00.000Z'),
      settledBet('lost', '2026-07-03T11:00:00.000Z'),
    ];

    expect(chaserStrategy([board], 550.5, threeLosses, rngZero)[0].stake).toBe(550.5);
  });

  it('sits out with no open board or nothing left to chase with', () => {
    expect(chaserStrategy([], 10_000, [], rngZero)).toEqual([]);
    expect(chaserStrategy([board], 0.4, [], rngZero)).toEqual([]);
  });
});

describe('consecutiveLosses', () => {
  it('counts settled losses since the most recent win, sorting by settledAt', () => {
    const history = [
      settledBet('lost', '2026-07-03T12:00:00.000Z'),
      settledBet('won', '2026-07-03T10:00:00.000Z'),
      settledBet('lost', '2026-07-03T11:00:00.000Z'),
      settledBet('lost', '2026-07-03T09:00:00.000Z'),
    ];
    expect(consecutiveLosses(history)).toBe(2);
  });

  it('ignores pending and void bets entirely', () => {
    const history = [
      betFixture({ status: 'pending', settledAt: null }),
      settledBet('void', '2026-07-03T12:00:00.000Z'),
      settledBet('lost', '2026-07-03T11:00:00.000Z'),
    ];
    expect(consecutiveLosses(history)).toBe(1);
  });
});
