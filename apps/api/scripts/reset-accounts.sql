-- ============================================================================
-- reset-accounts.sql — Zera TODAS as contas para reaproveitar o banco de DEV
--                      como produção.
--
-- APAGA:     usuários, nutricionistas, pacientes, funcionários, planos
--            alimentares, avaliações, agenda, financeiro, assinaturas,
--            interações de IA, onboarding, feedback — 30 tabelas.
-- PRESERVA:  "Food" (catálogo TACO) e "_prisma_migrations" (histórico do
--            Prisma — apagar isso faria o `migrate deploy` tentar recriar
--            tudo e quebrar o deploy).
--
-- ATENÇÃO: isto NÃO remove os usuários do Supabase Auth nem os arquivos do
-- Storage. Veja as etapas 0 e 4 — sem elas o reset fica incompleto de um jeito
-- que passa desapercebido.
--
-- Uso (recomendado, com log):
--   psql "$DATABASE_URL" -f apps/api/scripts/reset-accounts.sql | tee reset.log
--
-- No SQL Editor do Supabase, rode a ETAPA 0 sozinha primeiro e salve o
-- resultado — o editor mostra apenas o último result set.
-- ============================================================================


-- ============================================================================
-- ETAPA 0 — PRÉ-VOO: exporte isto ANTES de apagar. Depois do COMMIT não há
-- como recuperar a lista de quem apagar no Supabase Auth / Storage.
-- ============================================================================

\echo '=== Contagens antes ==='
SELECT
  (SELECT count(*) FROM "User")                AS usuarios,
  (SELECT count(*) FROM "NutritionistProfile") AS nutricionistas,
  (SELECT count(*) FROM "PatientProfile")      AS pacientes,
  (SELECT count(*) FROM "EmployeeProfile")     AS funcionarios,
  (SELECT count(*) FROM "Subscription")        AS assinaturas,
  (SELECT count(*) FROM "Food")                AS food_taco_preservar;

\echo '=== Usuários a remover do Supabase Auth (authProviderId = auth.users.id) ==='
SELECT "authProviderId", email, role, "createdAt"
FROM "User"
ORDER BY role, email;

\echo '=== Objetos a remover do Supabase Storage ==='
SELECT 'consultation-audio' AS bucket, "storagePath" AS path
  FROM "ConsultationAudio"
UNION ALL
SELECT 'patient-photos', "photoUrl"
  FROM "PatientProfile"      WHERE "photoUrl" IS NOT NULL
UNION ALL
SELECT 'nutritionist-logos', "logoUrl"
  FROM "NutritionistProfile" WHERE "logoUrl"  IS NOT NULL;

\echo '=== Assinaturas Asaas que ficarão órfãs na conta de sandbox ==='
SELECT "asaasCustomerId", "asaasSubscriptionId", status, plan
FROM "Subscription"
WHERE "asaasSubscriptionId" IS NOT NULL;


-- ============================================================================
-- ETAPA 1 — DESTRUTIVA. TRUNCATE é transacional no Postgres: se qualquer coisa
-- falhar, o ROLLBACK é automático e nada é perdido.
--
-- Sem CASCADE de propósito: as 30 tabelas abaixo cobrem todas as FKs entre si,
-- então o Postgres aceita o TRUNCATE. Se o schema mudar e faltar uma tabela,
-- o comando FALHA com erro claro em vez de apagar algo em silêncio.
-- ============================================================================

BEGIN;

TRUNCATE TABLE
  "AIInteraction",
  "Appointment",
  "AppointmentCategory",
  "BodyAssessment",
  "ConsultationAudio",
  "EmployeeProfile",
  "FoodRecall",
  "Meal",
  "MealItem",
  "MealLog",
  "MealOption",
  "MealPlan",
  "NutritionTarget",
  "NutritionistProfile",
  "OnboardingChapterProgress",
  "OnboardingProgress",
  "OutsideHomeRequest",
  "PatientAnamnese",
  "PatientConsent",
  "PatientProfile",
  "PatientPushToken",
  "RecallItem",
  "RecallMeal",
  "SilhuetaScan",
  "Subscription",
  "SubscriptionPayment",
  "Transaction",
  "TransactionCategory",
  "User",
  "UserFeedback";

-- ============================================================================
-- ETAPA 2 — VERIFICAÇÃO dentro da transação. Se o catálogo TACO tiver sido
-- atingido, aborta tudo.
-- ============================================================================

DO $$
DECLARE
  restantes bigint;
  foods     bigint;
BEGIN
  SELECT count(*) INTO restantes FROM "User";
  SELECT count(*) INTO foods     FROM "Food";

  IF restantes <> 0 THEN
    RAISE EXCEPTION 'ABORTADO: ainda restam % usuários', restantes;
  END IF;

  IF foods < 500 THEN
    RAISE EXCEPTION 'ABORTADO: catálogo TACO ficou com % alimentos (esperado >= 500)', foods;
  END IF;

  RAISE NOTICE 'OK: contas zeradas, catálogo TACO intacto (% alimentos)', foods;
END $$;

COMMIT;

\echo '=== Contagens depois ==='
SELECT
  (SELECT count(*) FROM "User")                AS usuarios,
  (SELECT count(*) FROM "PatientProfile")      AS pacientes,
  (SELECT count(*) FROM "Subscription")        AS assinaturas,
  (SELECT count(*) FROM "Food")                AS food_taco,
  (SELECT count(*) FROM "_prisma_migrations")  AS migrations;
