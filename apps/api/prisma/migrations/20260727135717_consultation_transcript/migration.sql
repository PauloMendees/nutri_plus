-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('PROCESSING', 'DONE', 'FAILED');

-- AlterEnum
ALTER TYPE "AIInteractionType" ADD VALUE 'CONSULTATION_TRANSCRIPTION';

-- AlterTable
ALTER TABLE "ConsultationAudio" ADD COLUMN     "transcribedAt" TIMESTAMP(3),
ADD COLUMN     "transcript" TEXT,
ADD COLUMN     "transcriptError" TEXT,
ADD COLUMN     "transcriptStatus" "TranscriptStatus";
