-- CreateTable
CREATE TABLE "SimBracket" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimBracket_pkey" PRIMARY KEY ("id")
);
