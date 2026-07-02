import { randomUUID } from 'node:crypto';
import { OPENING_BALANCE, type AuthResponse, type PlaceBetRequest } from '@arena/contracts';
import type { ArenaClient } from './client';
import { HTTP_CONFLICT, HTTP_UNAUTHORIZED, type ApiFailure } from './http';
import type { LeagueRow } from './league';
import { round2 } from './strategies/shared';
import type { IntendedBet, Strategy } from './strategies/types';

export interface BotSpec {
  name: string;
  emoji: string;
  strategy: Strategy;
}

export type Logger = (line: string) => void;

/**
 * One autonomous punter: a personality wrapped around a provisioned account.
 * Provisions itself once (admin-keyed — bots have no inbox), then each round
 * refreshes bankroll + history, asks its strategy for bets, and places them
 * with its own bearer token. Every upstream failure is a skipped round, never
 * a crash — the services are being built in parallel. A 401 drops the cached
 * session so the bot re-provisions when its token expires.
 *
 * Known limit: CreateAccountRequest carries no idempotency key, so a
 * provision whose response is lost after the server committed can leave an
 * orphaned account behind. Only betting could dedupe that server-side.
 */
export class Bot {
  private session: AuthResponse | null = null;
  private lastBalance = OPENING_BALANCE;
  private openBets = 0;

  constructor(
    readonly spec: BotSpec,
    private readonly client: ArenaClient,
    private readonly log: Logger
  ) {}

  get token(): string | null {
    return this.session?.token ?? null;
  }

  async playRound(): Promise<void> {
    const session = await this.ensureProvisioned();
    if (!session) return;

    const [account, bets, markets] = await Promise.all([
      this.client.getAccount(session.token, session.account.id),
      this.client.getBets(session.token, session.account.id),
      this.client.getMarkets(session.token),
    ]);
    if (!account.ok) {
      this.skip(account, `sitting this round out — ${account.message}`);
      return;
    }
    this.lastBalance = account.data.balance;
    if (!bets.ok) {
      this.skip(bets, `can't see my bets (${bets.message}) — skipping the round`);
      return;
    }
    this.openBets = bets.data.filter((bet) => bet.status === 'pending').length;
    if (!markets.ok) {
      this.skip(markets, `no prices on the board (${markets.message}) — skipping the round`);
      return;
    }

    const intents = this.spec.strategy(markets.data, account.data.balance, bets.data);
    if (intents.length === 0) {
      this.say('nothing I like this round');
      return;
    }
    for (const intent of intents) {
      await this.placeIntent(session.token, intent);
    }
  }

  snapshot(): LeagueRow {
    return {
      emoji: this.spec.emoji,
      name: this.spec.name,
      provisioned: this.session !== null,
      balance: this.lastBalance,
      openBets: this.openBets,
      pnl: round2(this.lastBalance - OPENING_BALANCE),
    };
  }

  private async ensureProvisioned(): Promise<AuthResponse | null> {
    if (this.session) return this.session;
    const result = await this.client.provisionBot(this.spec.name);
    if (!result.ok) {
      this.say(`can't open an account yet (${result.message}) — waiting for betting`);
      return null;
    }
    this.session = result.data;
    this.lastBalance = result.data.account.balance;
    this.say(`checked in with a $${result.data.account.balance} bankroll`);
    return this.session;
  }

  private async placeIntent(token: string, intent: IntendedBet): Promise<void> {
    const request: PlaceBetRequest = {
      marketId: intent.marketId,
      selectionId: intent.selectionId,
      stake: intent.stake,
      acceptedPrice: intent.price,
      idempotencyKey: randomUUID(),
    };
    const placed = await this.client.placeBet(token, request);
    if (placed.ok) {
      this.lastBalance = round2(this.lastBalance - intent.stake);
      this.openBets += 1;
      this.say(`$${intent.stake} on ${intent.selectionName} @ ${intent.price} — ${intent.reason}`);
    } else if (placed.kind === 'http' && placed.status === HTTP_CONFLICT) {
      this.say(`price moved on ${intent.selectionName} before I got there — letting it go`);
    } else {
      this.skip(placed, `bet on ${intent.selectionName} bounced (${placed.message})`);
    }
  }

  /** Log a skipped step; a 401 additionally drops the session for re-provisioning. */
  private skip(failure: ApiFailure, message: string): void {
    if (failure.kind === 'http' && failure.status === HTTP_UNAUTHORIZED) {
      this.session = null;
      this.say('session expired — checking in for a fresh token next round');
      return;
    }
    this.say(message);
  }

  private say(message: string): void {
    this.log(`${this.spec.emoji} ${this.spec.name}: ${message}`);
  }
}
