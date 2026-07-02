import type { Account, Bet, Market } from '@arena/contracts';

/** Schema-valid builders shared by the bot tests. */

export const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
export const BET_ID = '22222222-2222-4222-8222-222222222222';
export const NOW = '2026-07-03T12:00:00.000Z';

export function matchMarket(
  id: string,
  home: { name: string; price: number },
  away: { name: string; price: number },
  overrides: Partial<Market> = {}
): Market {
  return {
    id,
    type: 'MATCH_WINNER',
    fixtureId: id,
    name: `${home.name} v ${away.name}`,
    status: 'open',
    selections: [
      { id: `${id}-home`, name: home.name, price: home.price },
      { id: `${id}-away`, name: away.name, price: away.price },
    ],
    ...overrides,
  };
}

export function bet(overrides: Partial<Bet> = {}): Bet {
  return {
    id: BET_ID,
    accountId: ACCOUNT_ID,
    marketId: 'm1',
    selectionId: 'm1-home',
    stake: 100,
    price: 2,
    potentialReturn: 200,
    status: 'pending',
    placedAt: NOW,
    settledAt: null,
    ...overrides,
  };
}

export function account(overrides: Partial<Account> = {}): Account {
  return {
    id: ACCOUNT_ID,
    email: null,
    name: 'Bot',
    balance: 10_000,
    isBot: true,
    createdAt: NOW,
    ...overrides,
  };
}
