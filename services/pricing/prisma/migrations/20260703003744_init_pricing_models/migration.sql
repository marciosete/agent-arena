-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fixtureId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Selection" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Selection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixtureState" (
    "id" TEXT NOT NULL,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "winnerTeamId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixtureState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepriceEvent" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "winnerTeamId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepriceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Market_fixtureId_key" ON "Market"("fixtureId");

-- CreateIndex
CREATE INDEX "Selection_marketId_idx" ON "Selection"("marketId");

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
