-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "appointmentReminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PatientPushToken" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientPushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientPushToken_token_key" ON "PatientPushToken"("token");

-- CreateIndex
CREATE INDEX "PatientPushToken_patientId_idx" ON "PatientPushToken"("patientId");

-- AddForeignKey
ALTER TABLE "PatientPushToken" ADD CONSTRAINT "PatientPushToken_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
