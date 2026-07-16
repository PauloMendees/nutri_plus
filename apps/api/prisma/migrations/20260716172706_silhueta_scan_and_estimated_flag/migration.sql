-- AlterEnum
ALTER TYPE "AIInteractionType" ADD VALUE 'SILHUETA_SCAN';

-- AlterTable
ALTER TABLE "BodyAssessment" ADD COLUMN     "estimatedFromPhoto" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SilhuetaScan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "scanDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heightCm" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "waistInput" DOUBLE PRECISION,
    "hipInput" DOUBLE PRECISION,
    "bodyFatPercentage" DOUBLE PRECISION,
    "muscleMassPercentage" DOUBLE PRECISION,
    "leanMassPercentage" DOUBLE PRECISION,
    "fatMass" DOUBLE PRECISION,
    "waistCircumference" DOUBLE PRECISION,
    "hipCircumference" DOUBLE PRECISION,
    "chestCircumference" DOUBLE PRECISION,
    "armCircumference" DOUBLE PRECISION,
    "thighCircumference" DOUBLE PRECISION,
    "abdomenCircumference" DOUBLE PRECISION,
    "contractedArmCircumference" DOUBLE PRECISION,
    "calfCircumference" DOUBLE PRECISION,
    "consentAcceptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SilhuetaScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SilhuetaScan_patientId_scanDate_idx" ON "SilhuetaScan"("patientId", "scanDate");

-- AddForeignKey
ALTER TABLE "SilhuetaScan" ADD CONSTRAINT "SilhuetaScan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
