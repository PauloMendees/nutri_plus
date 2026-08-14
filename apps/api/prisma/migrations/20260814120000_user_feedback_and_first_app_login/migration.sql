-- CreateEnum
CREATE TYPE "FeedbackSource" AS ENUM ('WEB', 'MOBILE');

-- AlterTable
ALTER TABLE "PatientProfile" ADD COLUMN "firstAppLoginAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UserFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "source" "FeedbackSource",
    "dismissCount" INTEGER NOT NULL DEFAULT 0,
    "snoozedUntil" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserFeedback_userId_key" ON "UserFeedback"("userId");

-- AddForeignKey
ALTER TABLE "UserFeedback" ADD CONSTRAINT "UserFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
