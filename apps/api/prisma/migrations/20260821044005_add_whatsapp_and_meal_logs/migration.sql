-- CreateEnum
CREATE TYPE "MealLogSource" AS ENUM ('PLAN', 'FREE_TEXT');

-- AlterTable
ALTER TABLE "NutritionistProfile" ADD COLUMN     "whatsappNumber" TEXT;

-- CreateTable
CREATE TABLE "MealLog" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL,
    "source" "MealLogSource" NOT NULL,
    "note" TEXT,
    "freeText" TEXT,
    "mealName" TEXT,
    "mealTimeLabel" TEXT,
    "optionLabel" TEXT,
    "itemsJson" JSONB,
    "mealPlanId" TEXT,
    "mealId" TEXT,
    "mealOptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealLog_patientId_consumedAt_idx" ON "MealLog"("patientId", "consumedAt");

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_mealOptionId_fkey" FOREIGN KEY ("mealOptionId") REFERENCES "MealOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
