#!/usr/bin/env bash
# ============================================================================
# reset-accounts.sh — Zera TODAS as contas em 4 etapas:
#   1. backup (pg_dump) — aborta tudo se falhar
#   2. banco  (reset-accounts.sql)
#   3. Supabase Storage (esvazia os 3 buckets)
#   4. Supabase Auth (apaga todos os auth.users)
#
# Lê apps/api/.env sozinho — nenhuma credencial precisa sair da sua máquina.
# psql/pg_dump rodam via docker (não estão instalados localmente).
#
# Uso:
#   ./apps/api/scripts/reset-accounts.sh --dry-run   # só inspeciona, não altera
#   ./apps/api/scripts/reset-accounts.sh             # executa (pede confirmação)
# ============================================================================
set -uo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
# Overridáveis apenas para teste; os defaults são o que você usa na prática.
ENV_FILE="${ENV_FILE:-$REPO_ROOT/apps/api/.env}"
SQL_FILE="${SQL_FILE:-$REPO_ROOT/apps/api/scripts/reset-accounts.sql}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
BUCKETS=(consultation-audio patient-photos nutritionist-logos)

RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'
die()  { echo "${RED}x $*${RST}" >&2; exit 1; }
ok()   { echo "${GRN}ok $*${RST}"; }
warn() { echo "${YEL}!  $*${RST}"; }
step() { echo; echo "${BLD}-- $* --${RST}"; }

# ---------------------------------------------------------------------------
# Parser de .env sem eval de shell: pega o literal depois do primeiro '=' e
# remove aspas externas. Imune a valores com (), $, espacos etc — o `source`
# quebra nesses casos (foi o que aconteceu neste .env: parse error near `()`).
# ---------------------------------------------------------------------------
read_env() {
  sed -n "s/^[[:space:]]*$1=//p" "$ENV_FILE" 2>/dev/null | head -1 \
    | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/" -e 's/[[:space:]]*$//'
}

step "Pre-voo"
[ -f "$ENV_FILE" ] || die "nao achei $ENV_FILE"
[ -f "$SQL_FILE" ] || die "nao achei $SQL_FILE"
command -v docker >/dev/null || die "docker e necessario (psql/pg_dump rodam nele)"
command -v curl   >/dev/null || die "curl e necessario"
command -v jq     >/dev/null || die "jq e necessario"
docker info >/dev/null 2>&1  || die "o daemon do docker nao esta rodando"

DB_URL="$(read_env DATABASE_URL)"
SB_URL="$(read_env SUPABASE_URL)"
SB_KEY="$(read_env SUPABASE_SERVICE_ROLE_KEY)"
[ -n "$DB_URL" ] || die "DATABASE_URL nao encontrada em apps/api/.env"
[ -n "$SB_URL" ] || die "SUPABASE_URL nao encontrada em apps/api/.env"
[ -n "$SB_KEY" ] || die "SUPABASE_SERVICE_ROLE_KEY nao encontrada em apps/api/.env"

# Host e project ref sao identificadores, nao segredos — precisam estar visiveis
# para voce confirmar o alvo antes de algo irreversivel.
DB_HOST="$(printf '%s' "$DB_URL" | sed -E 's|^[a-z]+://[^@]*@||; s|[:/?].*||')"
SB_REF="$(printf '%s' "$SB_URL"  | sed -E 's|^https?://||; s|\..*||')"

# ---------------------------------------------------------------------------
# Detecção de ambiente. O ref do projeto NÃO serve como guard-rail: o mesmo
# projeto Supabase é dev hoje e produção depois, então digitar o ref confirma
# apenas que você sabe o nome dele — não em que ambiente está mexendo.
# A ASAAS_API_URL é o sinal honesto: sandbox => teste; api.asaas.com => produção.
# Fail-closed: qualquer coisa que não seja explicitamente sandbox conta como
# produção e exige ALLOW_ACCOUNT_WIPE=yes.
# ---------------------------------------------------------------------------
ASAAS_URL="$(read_env ASAAS_API_URL)"
case "$ASAAS_URL" in
  "")        ENV_KIND="indefinido (ASAAS_API_URL vazia)"; IS_PROD=0 ;;
  *sandbox*) ENV_KIND="sandbox/dev";                      IS_PROD=0 ;;
  *)         ENV_KIND="${RED}PRODUCAO${RST} ($ASAAS_URL)"; IS_PROD=1 ;;
esac

echo "  banco    : $DB_HOST"
echo "  supabase : $SB_REF  ($SB_URL)"
echo "  buckets  : ${BUCKETS[*]}"
echo "  ambiente : $ENV_KIND"
[ "$DRY_RUN" = 1 ] && echo "  modo     : ${BLD}DRY-RUN${RST} (nada sera alterado)"

# SEM `-i` e com stdin fechado: `docker run -i` drena o stdin do script e
# engoliria a resposta da confirmação mais abaixo. Só a Etapa 2 usa `-i`,
# porque de fato alimenta o .sql pelo stdin.
psql_run() {
  docker run --rm -e PGURL="$DB_URL" "$PG_IMAGE" sh -c "psql \"\$PGURL\" $1" </dev/null
}

step "Conectividade"
if ! psql_run '-tAc "select 1"' >/dev/null 2>&1; then
  echo "${RED}x nao consegui conectar em $DB_HOST${RST}" >&2
  case "$DB_HOST" in
    db.*.supabase.co)
      warn "esse host e IPv6-only e o docker no macOS nao alcanca IPv6."
      warn "use a URL do pooler (aws-0-<regiao>.pooler.supabase.com:5432) na DATABASE_URL." ;;
  esac
  exit 1
fi
PG_VER="$(psql_run '-tAc "show server_version"' 2>/dev/null | tr -d ' \r')"
ok "conectado (Postgres $PG_VER)"

SB_CODE="$(curl -s -o /dev/null -w '%{http_code}' \
  -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY" \
  "$SB_URL/auth/v1/admin/users?page=1&per_page=1")"
case "$SB_CODE" in
  200)      ok "Supabase Admin API acessivel" ;;
  000)      die "nao alcancei $SB_URL (sem rede/URL errada) — nada foi feito" ;;
  401|403)  die "Supabase recusou a credencial (HTTP $SB_CODE): confira SUPABASE_SERVICE_ROLE_KEY (precisa ser a service_role, nao a anon)" ;;
  *)        die "Supabase Admin API respondeu HTTP $SB_CODE — nada foi feito" ;;
esac

auth_count() {
  curl -s -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY" \
    "$SB_URL/auth/v1/admin/users?page=1&per_page=1000" | jq '.users | length'
}

step "Inventario atual"
psql_run '-c "
  SELECT (SELECT count(*) FROM \"User\") AS usuarios,
         (SELECT count(*) FROM \"NutritionistProfile\") AS nutris,
         (SELECT count(*) FROM \"PatientProfile\") AS pacientes,
         (SELECT count(*) FROM \"Subscription\") AS assinaturas,
         (SELECT count(*) FROM \"Food\") AS food_taco;"'
AUTH_TOTAL="$(auth_count)"
echo "  auth.users: $AUTH_TOTAL"

if [ "$DRY_RUN" = 1 ]; then
  echo; ok "DRY-RUN concluido. Nada foi alterado."
  exit 0
fi

# ---------------------------------------------------------------------------
if [ "$IS_PROD" = 1 ] && [ "${ALLOW_ACCOUNT_WIPE:-}" != "yes" ]; then
  step "BLOQUEADO"
  echo "ASAAS_API_URL aponta para a Asaas de ${BLD}PRODUCAO${RST}:"
  echo "  $ASAAS_URL"
  echo
  echo "Este ambiente tem clientes reais. Apagar as contas aqui e' irreversivel"
  echo "fora do backup — e o ref do projeto ($SB_REF) e' o mesmo de quando era dev,"
  echo "entao a confirmacao digitada nao protege voce disso."
  echo
  echo "Se e' de fato o que voce quer, seja explicito:"
  echo "  ${BLD}ALLOW_ACCOUNT_WIPE=yes $0${RST}"
  die "abortado — nada foi feito"
fi

step "Confirmacao"
[ "$IS_PROD" = 1 ] && warn "ALLOW_ACCOUNT_WIPE=yes em ambiente de PRODUCAO"
echo "Isto e ${BLD}IRREVERSIVEL${RST}. Serao apagados:"
echo "  - todas as contas do banco $DB_HOST"
echo "  - todos os objetos dos buckets: ${BUCKETS[*]}"
echo "  - todos os $AUTH_TOTAL usuarios do Supabase Auth ($SB_REF)"
echo
printf "Digite o ref do projeto (${BLD}%s${RST}) para confirmar: " "$SB_REF"
read -r TYPED
[ "$TYPED" = "$SB_REF" ] || die "confirmacao nao bateu — nada foi feito"

# ---------------------------------------------------------------------------
step "Etapa 1/4 — Backup"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
[ -d "$BACKUP_DIR" ] && [ -w "$BACKUP_DIR" ] \
  || die "não consigo escrever em $BACKUP_DIR — ABORTADO antes de apagar qualquer coisa"
BACKUP="$BACKUP_DIR/pre-reset-$STAMP.sql"
docker run --rm -e PGURL="$DB_URL" "$PG_IMAGE" \
  sh -c 'pg_dump --no-owner --no-privileges "$PGURL"' > "$BACKUP" 2>"$BACKUP.err"
if [ ! -s "$BACKUP" ]; then
  [ -f "$BACKUP.err" ] && cat "$BACKUP.err" >&2
  die "backup falhou — ABORTADO antes de apagar qualquer coisa"
fi
rm -f "$BACKUP.err"
ok "backup: $BACKUP ($(du -h "$BACKUP" | cut -f1))"

# ---------------------------------------------------------------------------
step "Etapa 2/4 — Banco"
LOG="$BACKUP_DIR/reset-$STAMP.log"
if docker run --rm -i -e PGURL="$DB_URL" "$PG_IMAGE" \
     sh -c 'psql "$PGURL" -v ON_ERROR_STOP=1 -f -' < "$SQL_FILE" 2>&1 | tee "$LOG"
then
  ok "contas zeradas (log + listas de Auth/Storage: $LOG)"
else
  die "o SQL falhou. TRUNCATE e transacional: o banco esta intacto. Veja $LOG"
fi

# ---------------------------------------------------------------------------
step "Etapa 3/4 — Supabase Storage"
for b in "${BUCKETS[@]}"; do
  BODY="$(mktemp)"
  CODE="$(curl -s -o "$BODY" -w '%{http_code}' -X POST \
    -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY" \
    "$SB_URL/storage/v1/bucket/$b/empty")"
  case "$CODE" in
    200) ok "bucket $b esvaziado" ;;
    404) warn "bucket $b nao existe (a API o recria sozinho quando precisar)" ;;
    *)   warn "bucket $b: HTTP $CODE — $(jq -r '.message // .error // "?"' "$BODY" 2>/dev/null)" ;;
  esac
  rm -f "$BODY"
done

# ---------------------------------------------------------------------------
step "Etapa 4/4 — Supabase Auth"
DELETED=0; FAILED=0
while :; do
  IDS="$(curl -s -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY" \
    "$SB_URL/auth/v1/admin/users?page=1&per_page=200" | jq -r '.users[].id')"
  [ -z "$IDS" ] && break
  for id in $IDS; do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE \
      -H "apikey: $SB_KEY" -H "authorization: Bearer $SB_KEY" \
      "$SB_URL/auth/v1/admin/users/$id")"
    if [ "$CODE" = 200 ] || [ "$CODE" = 204 ]; then
      DELETED=$((DELETED+1))
    else
      FAILED=$((FAILED+1)); warn "falha ao apagar $id (HTTP $CODE)"
    fi
  done
  # se algo travou, sai em vez de repaginar para sempre
  [ "$FAILED" -gt 0 ] && break
done
ok "auth.users apagados: $DELETED (falhas: $FAILED)"

# ---------------------------------------------------------------------------
step "Verificacao final"
psql_run '-c "
  SELECT (SELECT count(*) FROM \"User\") AS usuarios,
         (SELECT count(*) FROM \"PatientProfile\") AS pacientes,
         (SELECT count(*) FROM \"Subscription\") AS assinaturas,
         (SELECT count(*) FROM \"Food\") AS food_taco,
         (SELECT count(*) FROM \"_prisma_migrations\") AS migrations;"'
REMAIN="$(auth_count)"
echo "  auth.users restantes: $REMAIN"
echo
if [ "$REMAIN" = 0 ] && [ "$FAILED" = 0 ]; then
  ok "Reset completo. Backup em $BACKUP"
  echo "  Cortesia NAO foi concedida (como voce pediu). Quando quiser:"
  echo "  COMP_NUTRITIONIST_EMAILS=\"paulo@empathmsp.com\" pnpm --filter @nutri-plus/api run seed:subscriptions"
else
  warn "Reset parcial — revise as falhas acima. Backup em $BACKUP"
fi
