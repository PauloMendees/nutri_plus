-- CreateTable
CREATE TABLE "OutsideHomeRequest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "aiSuggestion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutsideHomeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutsideHomeRequest_patientId_createdAt_idx" ON "OutsideHomeRequest"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "OutsideHomeRequest" ADD CONSTRAINT "OutsideHomeRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
