-- AlterEnum
ALTER TYPE "AIInteractionType" ADD VALUE 'COLUMN_MAPPING';

-- AlterTable
ALTER TABLE "PatientProfile" ADD COLUMN "name" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- Backfill from User
UPDATE "PatientProfile" AS p
SET
  "name" = u."name",
  "email" = u."email",
  "isDemo" = (u."authProvider" = 'demo')
FROM "User" AS u
WHERE p."userId" = u."id";

ALTER TABLE "PatientProfile" ALTER COLUMN "name" SET NOT NULL;

ALTER TABLE "PatientProfile" ALTER COLUMN "userId" DROP NOT NULL;

CREATE UNIQUE INDEX "PatientProfile_email_key" ON "PatientProfile" ("email") WHERE "email" IS NOT NULL;
