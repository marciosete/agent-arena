import { randomUUID } from 'node:crypto';
import type { Account, PlaceBetRequest } from '@arena/contracts';
import type { BotClient, HttpResult } from './http';
import type { IntendedBet, Rng, Strategy } from './strategies';

/**
 * The bot framework: personality + provisioned account + session token +
 * a round of play. Everything here narrates what it does — the logs are
 * part of the show.
 */

export interface Personality {
  name: string;
  emoji: string;
  tagline: string;
  strategy: Strategy;
}

export type Logger = (line: string) => void;

export interface BotDeps {
  client: BotClient;
  log: Logger;
  rng: Rng;
  /** fresh idempotency key per bet attempt */
  uuid: () => string;
}

export interface Bot {
  personality: Personality;
  token: string;
  account: Account;
}

export interface RoundOutcome {
  balance: number;
  openBets: number;
  betsPlaced: number;
  /** the session token was rejected (401) — the runner should re-provision */
  sessionExpired: boolean;
}

export const defaultUuid = (): string => randomUUID();

function tag(personality: Personality): string {
  return `${personality.emoji} ${personality.name}`;
}

/**
 * A bot's first and ONLY auth step: identity-admin-gated POST /accounts, unlocked
 * by an admin service token the client mints off SESSION_SECRET. Bots have no
 * inbox, so there is no OTP — the returned token is its Bearer on every call.
 * Returns null (retry next round) while betting is still coming online.
 *
 * Known limitation: the contract has no idempotent provisioning, so a retry
 * after an ambiguous failure (response lost after the server created the
 * account) mints a duplicate account. Nothing in the frozen surface lets a
 * token-less bot look up or reclaim an existing account.
 */
export async function provisionBot(deps: BotDeps, personality: Personality): Promise<Bot | null> {
  const result = await deps.client.provisionBot(personality.name);
  if (!result.ok) {
    deps.log(
      `${tag(personality)} can't get an account yet (${result.detail}) — retrying next round`
    );
    return null;
  }
  const { token, account } = result.data;
  deps.log(
    `${tag(personality)} checks in with $${account.balance.toFixed(2)} — "${personality.tagline}"`
  );
  return { personality, token, account };
}

/**
 * One round: refresh balance and bet history, read the markets, let the
 * strategy pick, place each pick. Every service hiccup is a logged skip,
 * never a crash — the services may still be under construction.
 */
export async function runRound(deps: BotDeps, bot: Bot): Promise<RoundOutcome> {
  const name = tag(bot.personality);

  const accountResult = await deps.client.getAccount(bot.token, bot.account.id);
  if (accountResult.ok) {
    bot.account = accountResult.data;
  } else {
    deps.log(`${name} couldn't refresh the wallet (${accountResult.detail}) — using last known`);
  }

  const betsResult = await deps.client.getBets(bot.token, bot.account.id);
  if (!betsResult.ok) {
    deps.log(`${name} couldn't read past bets (${betsResult.detail}) — playing memoryless`);
  }
  const bets = betsResult.ok ? betsResult.data : [];
  const history = bets.filter((bet) => bet.status === 'won' || bet.status === 'lost');
  const pending = bets.filter((bet) => bet.status === 'pending');
  const openBets = pending.length;

  const marketsResult = await deps.client.getMarkets(bot.token);
  const sessionExpired = [accountResult, betsResult, marketsResult].some(unauthorized);
  if (sessionExpired) {
    deps.log(`${name} 🔑 session token rejected (401) — will re-provision next round`);
  }
  if (!marketsResult.ok) {
    deps.log(`${name} found the markets dark (${marketsResult.detail}) — skipping the round`);
    return { balance: bot.account.balance, openBets, betsPlaced: 0, sessionExpired };
  }

  const intents = bot.personality.strategy(
    marketsResult.data,
    bot.account.balance,
    history,
    deps.rng
  );
  if (intents.length === 0) {
    deps.log(`${name} sits this round out — nothing worth backing`);
  }

  // One open position per selection: without this, a 10s round loop re-stakes
  // the same unchanged market until the bankroll is gone before the sim runs.
  const held = new Set(pending.map((bet) => `${bet.marketId}:${bet.selectionId}`));

  let placed = 0;
  let staked = 0;
  for (const intent of intents) {
    if (held.has(`${intent.marketId}:${intent.selectionId}`)) {
      deps.log(
        `${name} already has an open bet on ${intent.selectionName} — holding, not doubling up`
      );
      continue;
    }
    const acceptedStake = await placeIntent(deps, bot, intent);
    if (acceptedStake > 0) {
      placed += 1;
      staked += acceptedStake;
    }
  }
  // Reflect this round's accepted stakes immediately (betting already debited
  // the wallet) so the league table doesn't overstate the balance for a round.
  const balance = Math.round((bot.account.balance - staked) * 100) / 100;
  bot.account = { ...bot.account, balance };
  return { balance, openBets: openBets + placed, betsPlaced: placed, sessionExpired };
}

function unauthorized(result: HttpResult<unknown>): boolean {
  return !result.ok && result.status === 401;
}

/** Places one intent; returns the stake betting accepted (0 on any skip). */
async function placeIntent(deps: BotDeps, bot: Bot, intent: IntendedBet): Promise<number> {
  const name = tag(bot.personality);
  deps.log(`${name}: ${intent.reason}`);
  // No accountId in the body — betting derives the wallet from the Bearer token.
  const request: PlaceBetRequest = {
    marketId: intent.marketId,
    selectionId: intent.selectionId,
    stake: intent.stake,
    acceptedPrice: intent.acceptedPrice,
    idempotencyKey: deps.uuid(),
  };
  const result = await deps.client.placeBet(bot.token, request);
  if (result.ok) {
    deps.log(
      `${name} ✅ $${result.data.stake} on ${intent.selectionName} at ${result.data.price.toFixed(2)} — returns $${result.data.potentialReturn.toFixed(2)} if it lands`
    );
    return result.data.stake;
  }
  if (result.kind === 'price-moved') {
    deps.log(`${name} 🏃 price moved on ${intent.selectionName} before the bet landed — skipping`);
    return 0;
  }
  if (result.kind === 'network') {
    // The bet may or may not have landed server-side — don't claim it failed.
    deps.log(
      `${name} 📡 no reply placing the bet on ${intent.selectionName} — outcome unknown, the next wallet refresh will tell`
    );
    return 0;
  }
  deps.log(`${name} ❌ bet on ${intent.selectionName} rejected (${result.detail}) — skipping`);
  return 0;
}
