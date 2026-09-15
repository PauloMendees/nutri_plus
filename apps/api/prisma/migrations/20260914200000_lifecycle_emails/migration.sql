-- CreateEnum
CREATE TYPE "LifecycleEmailKind" AS ENUM ('TRIAL_NO_PATIENT', 'CHECKOUT_ABANDONED');

-- CreateTable
CREATE TABLE "LifecycleEmail" (
    "id" TEXT NOT NULL,
    "nutritionistId" TEXT NOT NULL,
    "kind" "LifecycleEmailKind" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LifecycleEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LifecycleEmail_nutritionistId_kind_key" ON "LifecycleEmail"("nutritionistId", "kind");

-- AddForeignKey
ALTER TABLE "LifecycleEmail" ADD CONSTRAINT "LifecycleEmail_nutritionistId_fkey" FOREIGN KEY ("nutritionistId") REFERENCES "NutritionistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
