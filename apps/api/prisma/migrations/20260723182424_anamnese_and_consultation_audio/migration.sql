-- CreateTable
CREATE TABLE "PatientAnamnese" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "mainComplaint" TEXT,
    "medications" TEXT,
    "familyHistory" TEXT,
    "supplements" TEXT,
    "sleepHoursPerNight" DOUBLE PRECISION,
    "waterIntakeLiters" DOUBLE PRECISION,
    "alcoholUse" TEXT,
    "smoking" TEXT,
    "physicalActivity" TEXT,
    "bowelHabit" TEXT,
    "mealsPerDay" INTEGER,
    "eatingHabits" TEXT,
    "foodPreferences" TEXT,
    "clinicalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientAnamnese_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationAudio" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "durationSec" INTEGER,
    "consentConfirmed" BOOLEAN NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationAudio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientAnamnese_patientId_key" ON "PatientAnamnese"("patientId");

-- CreateIndex
CREATE INDEX "ConsultationAudio_patientId_recordedAt_idx" ON "ConsultationAudio"("patientId", "recordedAt");

-- AddForeignKey
ALTER TABLE "PatientAnamnese" ADD CONSTRAINT "PatientAnamnese_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationAudio" ADD CONSTRAINT "ConsultationAudio_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
