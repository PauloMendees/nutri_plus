-- DropIndex
DROP INDEX "MealPlan_patientId_idx";

-- CreateIndex
CREATE INDEX "MealPlan_patientId_createdAt_idx" ON "MealPlan"("patientId", "createdAt");
