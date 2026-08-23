-- AlterTable
ALTER TABLE "OnboardingProgress" ADD COLUMN     "demoAppointmentId" TEXT,
ADD COLUMN     "demoTransactionId" TEXT;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_demoAppointmentId_fkey" FOREIGN KEY ("demoAppointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_demoTransactionId_fkey" FOREIGN KEY ("demoTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
