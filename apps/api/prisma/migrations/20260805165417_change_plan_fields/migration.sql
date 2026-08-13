-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "asaasCardToken" TEXT,
ADD COLUMN     "pendingBillingPeriod" "BillingPeriod",
ADD COLUMN     "pendingChargeAsaasId" TEXT,
ADD COLUMN     "pendingPlan" "PlanTier";
