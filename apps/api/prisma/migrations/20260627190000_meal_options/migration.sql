-- Disposable data: meal plans on the shared dev DB are test data. Wipe the tree so
-- the new NOT NULL MealItem.mealOptionId FK applies to empty tables (no backfill).
DELETE FROM "MealPlan";

-- DropForeignKey
ALTER TABLE "MealItem" DROP CONSTRAINT "MealItem_mealId_fkey";

-- DropIndex
DROP INDEX "MealItem_mealId_idx";

-- AlterTable
ALTER TABLE "MealItem" DROP COLUMN "mealId",
ADD COLUMN "mealOptionId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "MealOption" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "label" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MealOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealOption_mealId_idx" ON "MealOption"("mealId");

-- CreateIndex
CREATE INDEX "MealItem_mealOptionId_idx" ON "MealItem"("mealOptionId");

-- AddForeignKey
ALTER TABLE "MealOption" ADD CONSTRAINT "MealOption_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealItem" ADD CONSTRAINT "MealItem_mealOptionId_fkey" FOREIGN KEY ("mealOptionId") REFERENCES "MealOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
