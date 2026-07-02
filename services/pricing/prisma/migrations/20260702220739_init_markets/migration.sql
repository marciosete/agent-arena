-- CreateEnum
CREATE TYPE "MarketType" AS ENUM ('MATCH_WINNER', 'OUTRIGHT');

-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('open', 'suspended', 'settled');

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "type" "MarketType" NOT NULL,
    "fixtureId" TEXT,
    "name" TEXT NOT NULL,
    "status" "MarketStatus" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Selection" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Selection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "fixtureId" TEXT NOT NULL,
    "winnerTeamId" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "decidedOnPenalties" BOOLEAN NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("fixtureId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Market_fixtureId_key" ON "Market"("fixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "Selection_marketId_name_key" ON "Selection"("marketId", "name");

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
