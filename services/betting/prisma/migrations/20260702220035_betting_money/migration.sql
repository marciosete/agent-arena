-- CreateEnum
CREATE TYPE "BetStatus" AS ENUM ('pending', 'won', 'lost', 'void');

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "marketName" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL,
    "stake" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "potentialReturn" DOUBLE PRECISION NOT NULL,
    "status" "BetStatus" NOT NULL DEFAULT 'pending',
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "refBetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bet_idempotencyKey_key" ON "Bet"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Bet_accountId_idx" ON "Bet"("accountId");

-- CreateIndex
CREATE INDEX "Bet_marketId_status_idx" ON "Bet"("marketId", "status");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_idx" ON "LedgerEntry"("accountId");
