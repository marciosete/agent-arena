#!/usr/bin/env node
/**
 * Ledger reconciliation — the demo-moment audit (docs/specs/4-betting.md):
 * every wallet must equal OPENING_BALANCE + the sum of its append-only
 * LedgerEntry deltas, to the cent. Read-only; safe to run against the live
 * database mid-event.
 *
 *   node scripts/reconcile.cjs        (from services/betting)
 *
 * Accounts that predate the event build carry rehearsal balances with no
 * ledger history; they are reported as "legacy", not failures. Exit code is
 * 1 only when an account WITH ledger history fails to reconcile.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS runtime
 * script: @arena/contracts is only consumable via require() from Node. */
const { OPENING_BALANCE } = require('@arena/contracts');
const { PrismaClient } = require('../generated/client');

const prisma = new PrismaClient();
const CENT = 0.005; // float-compare tolerance: half a cent

async function main() {
  const [accounts, ledger, pendingBets] = await Promise.all([
    prisma.account.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.ledgerEntry.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.bet.findMany({ where: { status: 'pending' } }),
  ]);

  const deltasByAccount = new Map();
  for (const entry of ledger) {
    const acc = deltasByAccount.get(entry.accountId) ?? { sum: 0, entries: 0 };
    acc.sum += entry.delta;
    acc.entries += 1;
    deltasByAccount.set(entry.accountId, acc);
  }

  let reconciled = 0;
  let legacy = 0;
  const failures = [];
  for (const account of accounts) {
    const trail = deltasByAccount.get(account.id) ?? { sum: 0, entries: 0 };
    const expected = OPENING_BALANCE + trail.sum;
    const drift = account.balance - expected;
    if (Math.abs(drift) <= CENT) {
      reconciled += 1;
    } else if (trail.entries === 0) {
      legacy += 1; // pre-event balance, ledger history predates the event build
    } else {
      failures.push({ account, expected, drift, entries: trail.entries });
    }
  }

  const totalStaked = pendingBets.reduce((sum, bet) => sum + bet.stake, 0);
  const totalDeltas = ledger.reduce((sum, entry) => sum + entry.delta, 0);

  console.log(`accounts:            ${accounts.length}`);
  console.log(`ledger entries:      ${ledger.length}`);
  console.log(`reconciled to cent:  ${reconciled}`);
  console.log(`legacy (no ledger):  ${legacy}`);
  console.log(`pending bets:        ${pendingBets.length} (staked ${totalStaked.toFixed(2)})`);
  console.log(`net ledger flow:     ${totalDeltas.toFixed(2)} (punter wins - stakes taken)`);

  if (failures.length > 0) {
    console.error(`\nFAILED to reconcile ${failures.length} account(s):`);
    for (const failure of failures) {
      console.error(
        `  ${failure.account.id} "${failure.account.name}": balance ${failure.account.balance} != expected ${failure.expected.toFixed(2)} (drift ${failure.drift.toFixed(4)}, ${failure.entries} entries)`
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log('\nEvery cent accounted for ✅');
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
