-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "PatientObjective" AS ENUM ('WEIGHT_LOSS', 'MUSCLE_GAIN', 'MAINTENANCE', 'RECOMPOSITION');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE');

-- AlterTable
ALTER TABLE "PatientProfile" ADD COLUMN     "activityLevel" "ActivityLevel",
ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "height" DOUBLE PRECISION,
ADD COLUMN     "medicalConditions" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "objective" "PatientObjective",
ADD COLUMN     "restrictions" TEXT,
ADD COLUMN     "targetWeight" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "BodyAssessment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weight" DOUBLE PRECISION,
    "bodyFatPercentage" DOUBLE PRECISION,
    "muscleMass" DOUBLE PRECISION,
    "leanMass" DOUBLE PRECISION,
    "visceralFat" DOUBLE PRECISION,
    "basalMetabolicRate" DOUBLE PRECISION,
    "bodyWaterPercentage" DOUBLE PRECISION,
    "boneMass" DOUBLE PRECISION,
    "metabolicAge" INTEGER,
    "waistCircumference" DOUBLE PRECISION,
    "hipCircumference" DOUBLE PRECISION,
    "chestCircumference" DOUBLE PRECISION,
    "armCircumference" DOUBLE PRECISION,
    "thighCircumference" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BodyAssessment_patientId_assessmentDate_idx" ON "BodyAssessment"("patientId", "assessmentDate");

-- AddForeignKey
ALTER TABLE "BodyAssessment" ADD CONSTRAINT "BodyAssessment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
