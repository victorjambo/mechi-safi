-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MatchOutcome" AS ENUM ('HOME_WIN', 'DRAW', 'AWAY_WIN');

-- CreateEnum
CREATE TYPE "PredictionMode" AS ENUM ('FORWARD', 'BACKTEST', 'DIAGNOSTIC');

-- CreateEnum
CREATE TYPE "PredictionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('QUEUED', 'RUNNING', 'GENERATED', 'SKIPPED', 'FAILED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "PredictionPolicy" AS ENUM ('SKIP', 'NEW_VERSION');

-- CreateEnum
CREATE TYPE "TriggerSource" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "BacktestStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "externalId" INTEGER,
    "name" TEXT NOT NULL,
    "emblem" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "externalId" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "crest" TEXT,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamExternalId" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,

    CONSTRAINT "TeamExternalId_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "seasonId" TEXT,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "resultVersion" INTEGER NOT NULL DEFAULT 0,
    "lastProviderUpdate" TIMESTAMP(3),

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixtureRevision" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "providerPayload" JSONB NOT NULL,

    CONSTRAINT "FixtureRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionConfig" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "featureSetVersion" TEXT NOT NULL,
    "questionVersion" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PredictionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureSnapshot" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "cutoff" TIMESTAMP(3) NOT NULL,
    "featureSetVersion" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "mode" "PredictionMode" NOT NULL,
    "triggerSource" "TriggerSource" NOT NULL,
    "status" "PredictionStatus" NOT NULL DEFAULT 'PENDING',
    "modelIdentifier" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "cutoff" TIMESTAMP(3) NOT NULL,
    "predictedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "predictedOutcome" "MatchOutcome",
    "homeProbability" DOUBLE PRECISION,
    "drawProbability" DOUBLE PRECISION,
    "awayProbability" DOUBLE PRECISION,
    "modelConfidence" DOUBLE PRECISION,
    "rawRequest" JSONB NOT NULL,
    "rawResponse" JSONB,
    "providerRequestId" TEXT,
    "latencyMs" INTEGER,
    "error" TEXT,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionBatch" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT,
    "periodHours" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "competitions" TEXT[],
    "configId" TEXT NOT NULL,
    "existingPredictionPolicy" "PredictionPolicy" NOT NULL,
    "triggerSource" "TriggerSource" NOT NULL DEFAULT 'MANUAL',
    "status" "BatchStatus" NOT NULL DEFAULT 'QUEUED',
    "totalFixtures" INTEGER NOT NULL DEFAULT 0,
    "generatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PredictionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "predictionId" TEXT,
    "status" "ItemStatus" NOT NULL DEFAULT 'QUEUED',
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PredictionBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionEvaluation" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "resultVersion" INTEGER NOT NULL,
    "actualOutcome" "MatchOutcome" NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "brierScore" DOUBLE PRECISION NOT NULL,
    "logLoss" DOUBLE PRECISION NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL,
    "competitions" TEXT[],
    "seasons" INTEGER[],
    "configId" TEXT NOT NULL,
    "cutoffHours" INTEGER NOT NULL,
    "minHistoricalMatches" INTEGER NOT NULL,
    "status" "BacktestStatus" NOT NULL DEFAULT 'QUEUED',
    "totalFixtures" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "excludedCount" INTEGER NOT NULL DEFAULT 0,
    "limitation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestRunFixture" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "predictionId" TEXT,
    "status" "ItemStatus" NOT NULL DEFAULT 'QUEUED',
    "reason" TEXT,

    CONSTRAINT "BacktestRunFixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobExecution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderSyncState" (
    "id" TEXT NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "cursor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    "automaticPredictions" BOOLEAN NOT NULL DEFAULT false,
    "automaticCutoffHours" INTEGER NOT NULL DEFAULT 24,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Competition_externalId_key" ON "Competition"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Season_competitionId_year_key" ON "Season"("competitionId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "TeamExternalId_provider_externalId_key" ON "TeamExternalId"("provider", "externalId");

-- CreateIndex
CREATE INDEX "Fixture_kickoff_status_idx" ON "Fixture"("kickoff", "status");

-- CreateIndex
CREATE INDEX "Fixture_competitionId_kickoff_idx" ON "Fixture"("competitionId", "kickoff");

-- CreateIndex
CREATE UNIQUE INDEX "Fixture_provider_externalId_key" ON "Fixture"("provider", "externalId");

-- CreateIndex
CREATE INDEX "FeatureSnapshot_fixtureId_cutoff_idx" ON "FeatureSnapshot"("fixtureId", "cutoff");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_idempotencyKey_key" ON "Prediction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Prediction_fixtureId_predictedAt_idx" ON "Prediction"("fixtureId", "predictedAt");

-- CreateIndex
CREATE INDEX "Prediction_mode_status_predictedAt_idx" ON "Prediction"("mode", "status", "predictedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionBatch_requestKey_key" ON "PredictionBatch"("requestKey");

-- CreateIndex
CREATE INDEX "PredictionBatch_createdAt_idx" ON "PredictionBatch"("createdAt");

-- CreateIndex
CREATE INDEX "PredictionBatchItem_status_idx" ON "PredictionBatchItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionBatchItem_batchId_fixtureId_key" ON "PredictionBatchItem"("batchId", "fixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionEvaluation_predictionId_key" ON "PredictionEvaluation"("predictionId");

-- CreateIndex
CREATE INDEX "BacktestRun_createdAt_idx" ON "BacktestRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BacktestRunFixture_runId_fixtureId_key" ON "BacktestRunFixture"("runId", "fixtureId");

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamExternalId" ADD CONSTRAINT "TeamExternalId_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixtureRevision" ADD CONSTRAINT "FixtureRevision_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureSnapshot" ADD CONSTRAINT "FeatureSnapshot_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_configId_fkey" FOREIGN KEY ("configId") REFERENCES "PredictionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "FeatureSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionBatch" ADD CONSTRAINT "PredictionBatch_configId_fkey" FOREIGN KEY ("configId") REFERENCES "PredictionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionBatchItem" ADD CONSTRAINT "PredictionBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PredictionBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionBatchItem" ADD CONSTRAINT "PredictionBatchItem_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionBatchItem" ADD CONSTRAINT "PredictionBatchItem_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionEvaluation" ADD CONSTRAINT "PredictionEvaluation_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestRun" ADD CONSTRAINT "BacktestRun_configId_fkey" FOREIGN KEY ("configId") REFERENCES "PredictionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestRunFixture" ADD CONSTRAINT "BacktestRunFixture_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BacktestRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestRunFixture" ADD CONSTRAINT "BacktestRunFixture_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestRunFixture" ADD CONSTRAINT "BacktestRunFixture_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

