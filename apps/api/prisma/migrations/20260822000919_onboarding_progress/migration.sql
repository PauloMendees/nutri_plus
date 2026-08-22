-- CreateEnum
CREATE TYPE "OnboardingTourStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OnboardingChapterStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingPromptDismissedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "status" "OnboardingTourStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "demoPatientId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingChapterProgress" (
    "id" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "status" "OnboardingChapterStatus" NOT NULL,
    "furthestStepId" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingChapterProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnboardingProgress_userId_idx" ON "OnboardingProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_userId_tourId_key" ON "OnboardingProgress"("userId", "tourId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingChapterProgress_progressId_chapterId_key" ON "OnboardingChapterProgress"("progressId", "chapterId");

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_demoPatientId_fkey" FOREIGN KEY ("demoPatientId") REFERENCES "PatientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingChapterProgress" ADD CONSTRAINT "OnboardingChapterProgress_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "OnboardingProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
