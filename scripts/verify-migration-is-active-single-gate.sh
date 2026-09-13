#!/usr/bin/env bash
# Vérifie la migration 20260913000000_is_active_single_gate.sql sur un Postgres
# jetable, avec l'état de départ RÉEL de la production (is_active DEFAULT TRUE,
# aucun backfill) — que l'on ne peut PAS reproduire en local autrement : sur une
# base fraîche l'autre migration is_active (DEFAULT FALSE) peut gagner, et le
# backfill devient un no-op silencieux.
#
# Populations seedées = celles recensées en prod le 2026-09-13 :
#   986 jamais relues (actives)  -> doivent devenir inactives
#   179 validées + actives       -> doivent rester actives (le stock légitime)
#     4 rejetées restées actives -> doivent devenir inactives (le bloquant de la re-review)
#     1 validée éteinte à la main -> doit rester inactive (intention du prof)
# Puis : une nouvelle ligne naît inactive, et rejouer la migration ne change rien.
#
# Usage : scripts/verify-migration-is-active-single-gate.sh
# Prérequis : binaires PostgreSQL (PG_BIN, défaut /usr/lib/postgresql/16/bin) et
# un utilisateur système `postgres` si on est root. Sortie 0 = toutes les
# assertions passent.
set -euo pipefail

PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$REPO/supabase/migrations/20260913000000_is_active_single_gate.sql"
WORK="$(mktemp -d /tmp/pgverify.XXXXXX)"
DATA="$WORK/data"; SOCK="$WORK/sock"
mkdir -p "$DATA" "$SOCK"

# Postgres refuse de tourner en root : on délègue à l'utilisateur postgres.
if [ "$(id -u)" = "0" ]; then
  RUN="su postgres -c"
  chown -R postgres:postgres "$WORK"
else
  RUN="bash -c"
fi
chmod 700 "$DATA"

cleanup() {
  $RUN "$PG_BIN/pg_ctl -D $DATA -m immediate -w stop" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

$RUN "$PG_BIN/initdb -D $DATA -A trust" >/dev/null 2>&1
$RUN "$PG_BIN/pg_ctl -D $DATA -l $WORK/pg.log -o \"-k $SOCK -c listen_addresses=''\" -w start" >/dev/null 2>&1
PSQL="$PG_BIN/psql -h $SOCK -d postgres -v ON_ERROR_STOP=1 -q"

q() { $RUN "$PSQL -tAc \"$1\""; }
sql() { $RUN "$PSQL" <<<"$1"; }

# ── État de départ : celui de la prod ────────────────────────────────────────
sql "
CREATE TABLE public.teacher_questions (
  id serial PRIMARY KEY,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  validated_at timestamptz,
  rejected_at timestamptz
);
INSERT INTO public.teacher_questions (label, is_active, validated_at, rejected_at)
SELECT 'jamais_relue', true, NULL, NULL FROM generate_series(1,986);
INSERT INTO public.teacher_questions (label, is_active, validated_at, rejected_at)
SELECT 'validee_active', true, now(), NULL FROM generate_series(1,179);
INSERT INTO public.teacher_questions (label, is_active, validated_at, rejected_at)
SELECT 'rejetee_active', true, NULL, now() FROM generate_series(1,4);
INSERT INTO public.teacher_questions (label, is_active, validated_at, rejected_at)
VALUES ('validee_eteinte', false, now(), NULL);
"

fail=0
check() { # check <libellé> <obtenu> <attendu>
  if [ "$2" = "$3" ]; then echo "  ok   $1 = $2"; else echo "  FAIL $1 = $2 (attendu $3)"; fail=1; fi
}

echo "avant migration :"
check "actives" "$(q 'SELECT count(*) FROM public.teacher_questions WHERE is_active')" "1169"

$RUN "$PSQL -f $MIG"
echo "après migration :"
check "jamais_relue actives"   "$(q "SELECT count(*) FROM public.teacher_questions WHERE label='jamais_relue' AND is_active")"   "0"
check "rejetee_active actives" "$(q "SELECT count(*) FROM public.teacher_questions WHERE label='rejetee_active' AND is_active")" "0"
check "validee_active actives" "$(q "SELECT count(*) FROM public.teacher_questions WHERE label='validee_active' AND is_active")" "179"
check "validee_eteinte actives" "$(q "SELECT count(*) FROM public.teacher_questions WHERE label='validee_eteinte' AND is_active")" "0"
check "total assignables"      "$(q 'SELECT count(*) FROM public.teacher_questions WHERE is_active')" "179"
check "default is_active"      "$(q "SELECT column_default FROM information_schema.columns WHERE table_name='teacher_questions' AND column_name='is_active'")" "false"
check "index partiel"          "$(q "SELECT count(*) FROM pg_indexes WHERE indexname='teacher_questions_is_active_idx'")" "1"

sql "INSERT INTO public.teacher_questions (label) VALUES ('nouvelle_ia');"
check "nouvelle ligne active"  "$(q "SELECT is_active FROM public.teacher_questions WHERE label='nouvelle_ia'")" "f"

echo "rejeu :"
$RUN "$PSQL -f $MIG" 2>/dev/null
check "assignables après rejeu" "$(q 'SELECT count(*) FROM public.teacher_questions WHERE is_active')" "179"

[ "$fail" = "0" ] && echo "MIGRATION OK" || { echo "MIGRATION KO"; exit 1; }
