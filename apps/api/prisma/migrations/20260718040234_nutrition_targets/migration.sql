-- CreateEnum
CREATE TYPE "TmbFormula" AS ENUM ('MIFFLIN', 'HARRIS_BENEDICT', 'KATCH_MCARDLE');

-- CreateTable
CREATE TABLE "NutritionTarget" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "formula" "TmbFormula" NOT NULL,
    "sex" "Gender" NOT NULL,
    "age" INTEGER,
    "heightCm" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "bodyFatPercentage" DOUBLE PRECISION,
    "activityLevel" "ActivityLevel",
    "activityFactor" DOUBLE PRECISION NOT NULL,
    "tmb" DOUBLE PRECISION NOT NULL,
    "get" DOUBLE PRECISION NOT NULL,
    "targetCalories" DOUBLE PRECISION NOT NULL,
    "proteinGramsPerKg" DOUBLE PRECISION NOT NULL,
    "proteinGrams" DOUBLE PRECISION NOT NULL,
    "fatPercent" DOUBLE PRECISION NOT NULL,
    "fatGrams" DOUBLE PRECISION NOT NULL,
    "carbGrams" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "NutritionTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NutritionTarget_patientId_targetDate_idx" ON "NutritionTarget"("patientId", "targetDate");

-- AddForeignKey
ALTER TABLE "NutritionTarget" ADD CONSTRAINT "NutritionTarget_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
