-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "categoryId" TEXT;

-- CreateTable
CREATE TABLE "AppointmentCategory" (
    "id" TEXT NOT NULL,
    "nutritionistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentCategory_nutritionistId_idx" ON "AppointmentCategory"("nutritionistId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AppointmentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentCategory" ADD CONSTRAINT "AppointmentCategory_nutritionistId_fkey" FOREIGN KEY ("nutritionistId") REFERENCES "NutritionistProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
