-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cardBrand" TEXT,
ADD COLUMN     "cardLast4" TEXT,
ADD COLUMN     "onboardedAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" TEXT;

-- Contas existentes já passaram do onboarding: não devem ver o gate.
UPDATE "Subscription" SET "onboardedAt" = now() WHERE "onboardedAt" IS NULL;
