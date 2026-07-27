-- CreateTable
CREATE TABLE "FoodRecall" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recallDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodRecall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecallMeal" (
    "id" TEXT NOT NULL,
    "foodRecallId" TEXT NOT NULL,
    "name" TEXT,
    "timeLabel" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "RecallMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecallItem" (
    "id" TEXT NOT NULL,
    "recallMealId" TEXT NOT NULL,
    "foodId" TEXT,
    "foodName" TEXT,
    "quantity" TEXT,
    "grams" DOUBLE PRECISION,
    "calories" DOUBLE PRECISION,
    "protein" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "fats" DOUBLE PRECISION,
    "fiber" DOUBLE PRECISION,
    "sodium" DOUBLE PRECISION,
    "order" INTEGER NOT NULL,

    CONSTRAINT "RecallItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodRecall_patientId_recallDate_idx" ON "FoodRecall"("patientId", "recallDate");

-- CreateIndex
CREATE INDEX "RecallMeal_foodRecallId_idx" ON "RecallMeal"("foodRecallId");

-- CreateIndex
CREATE INDEX "RecallItem_recallMealId_idx" ON "RecallItem"("recallMealId");

-- AddForeignKey
ALTER TABLE "FoodRecall" ADD CONSTRAINT "FoodRecall_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallMeal" ADD CONSTRAINT "RecallMeal_foodRecallId_fkey" FOREIGN KEY ("foodRecallId") REFERENCES "FoodRecall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallItem" ADD CONSTRAINT "RecallItem_recallMealId_fkey" FOREIGN KEY ("recallMealId") REFERENCES "RecallMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallItem" ADD CONSTRAINT "RecallItem_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE SET NULL ON UPDATE CASCADE;
