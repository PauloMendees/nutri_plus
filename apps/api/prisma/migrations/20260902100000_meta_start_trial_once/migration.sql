-- AlterTable
-- Guarda de disparo único do evento de conversão StartTrial (Meta CAPI).
ALTER TABLE "Subscription" ADD COLUMN     "startTrialEventoEm" TIMESTAMP(3);
