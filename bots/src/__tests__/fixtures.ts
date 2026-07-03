import type { Account, AuthResponse, Bet, Market, Selection } from '@arena/contracts';

/** Contract-valid fixture builders shared by the bot test suites. */

export const BOT_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
export const FIXED_UUID = '99999999-9999-4999-8999-999999999999';
export const PLACED_AT = '2026-07-03T09:00:00.000Z';

export function accountFixture(overrides: Partial<Account> = {}): Account {
  return {
    id: BOT_ACCOUNT_ID,
    email: null,
    name: 'Steady',
    balance: 10_000,
    isBot: true,
    createdAt: PLACED_AT,
    ...overrides,
  };
}

export function authResponseFixture(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return { token: 'bot-session-token', account: accountFixture(), ...overrides };
}

export function selectionFixture(overrides: Partial<Selection> = {}): Selection {
  return { id: 'sel-france', name: 'France', price: 1.8, ...overrides };
}

export function marketFixture(overrides: Partial<Market> = {}): Market {
  return {
    id: 'fixture-qf-1',
    type: 'MATCH_WINNER',
    fixtureId: 'fixture-qf-1',
    name: 'France v Canada',
    status: 'open',
    selections: [
      selectionFixture(),
      selectionFixture({ id: 'sel-canada', name: 'Canada', price: 2.2 }),
    ],
    ...overrides,
  };
}

export function betFixture(overrides: Partial<Bet> = {}): Bet {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    accountId: BOT_ACCOUNT_ID,
    marketId: 'fixture-qf-1',
    selectionId: 'sel-france',
    stake: 100,
    price: 2,
    potentialReturn: 200,
    status: 'pending',
    placedAt: PLACED_AT,
    settledAt: null,
    ...overrides,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
