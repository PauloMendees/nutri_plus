-- CreateEnum
CREATE TYPE "AIInteractionType" AS ENUM ('MEAL_PLAN_GENERATION', 'OUTSIDE_HOME_SUGGESTION');

-- CreateTable
CREATE TABLE "AIInteraction" (
    "id" TEXT NOT NULL,
    "patientId" TEXT,
    "type" "AIInteractionType" NOT NULL,
    "model" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "response" JSONB,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "latencyMs" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIInteraction_patientId_createdAt_idx" ON "AIInteraction"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "AIInteraction_type_createdAt_idx" ON "AIInteraction"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "AIInteraction" ADD CONSTRAINT "AIInteraction_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
