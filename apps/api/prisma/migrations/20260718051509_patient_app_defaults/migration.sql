-- AlterTable
ALTER TABLE "NutritionistProfile" ADD COLUMN     "defaultCanLogAssessments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "defaultShowMealTargetToPatient" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PatientProfile" ADD COLUMN     "showMealTargetToPatient" BOOLEAN NOT NULL DEFAULT false;
