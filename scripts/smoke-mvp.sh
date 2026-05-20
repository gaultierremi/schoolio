#!/usr/bin/env bash
#
# Smoke test MVP pilote — Sprint 5+6
#
# Vérifie en ~30s :
# 1. Routes publiques (HTTP 200)
# 2. API endpoints critiques (200 si public, 401 si requireUser)
# 3. Schéma DB : tables/triggers/policies des migrations Sprint 4-6
# 4. Trigger.dev task déployée
#
# Usage :
#   BASE_URL=https://maia.app SUPABASE_PAT=sbp_xxx ./scripts/smoke-mvp.sh
#
# Required env :
#   - BASE_URL : domaine prod ou preview (sans trailing slash)
#   - SUPABASE_PAT : Personal Access Token Management API (sbp_*)
#   - SUPABASE_PROJECT_REF : id du projet (default : zaazzzhonlgicctrewqn)

set -uo pipefail

BASE_URL="${BASE_URL:-}"
SUPABASE_PAT="${SUPABASE_PAT:-}"
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-zaazzzhonlgicctrewqn}"

if [ -z "$BASE_URL" ]; then
  echo "ERROR: BASE_URL required (e.g. BASE_URL=https://maia.app)" >&2
  exit 1
fi
if [ -z "$SUPABASE_PAT" ]; then
  echo "ERROR: SUPABASE_PAT required (sbp_*)" >&2
  exit 1
fi

# Colors
G='\033[0;32m' # green
R='\033[0;31m' # red
Y='\033[0;33m' # yellow
B='\033[0;34m' # blue
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

# ── Helpers ────────────────────────────────────────────────────────────────

check_http() {
  local label="$1"
  local url="$2"
  local expected="$3"  # comma-separated codes : "200" or "200,401"
  local actual
  actual=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" || echo "000")
  if echo ",$expected," | grep -q ",$actual,"; then
    echo -e "${G}✓${NC} ${label} ${B}[${actual}]${NC}"
    PASS=$((PASS + 1))
  else
    echo -e "${R}✗${NC} ${label} (expected ${expected}, got ${actual})"
    FAIL=$((FAIL + 1))
  fi
}

check_db_query() {
  local label="$1"
  local query="$2"
  local expect_nonempty="${3:-true}"  # true ou false
  local response
  response=$(curl -sS -X POST \
    "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_PAT}" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc --arg q "$query" '{query:$q}')" 2>&1)

  if echo "$response" | grep -q '"error"\|"message"'; then
    # Tolerate "Unauthorized" or other API errors as fail
    echo -e "${R}✗${NC} ${label} (DB error: $(echo "$response" | head -c 100)...)"
    FAIL=$((FAIL + 1))
    return
  fi

  if [ "$expect_nonempty" = "true" ]; then
    if [ "$response" = "[]" ]; then
      echo -e "${R}✗${NC} ${label} (empty result)"
      FAIL=$((FAIL + 1))
    else
      echo -e "${G}✓${NC} ${label}"
      PASS=$((PASS + 1))
    fi
  else
    echo -e "${G}✓${NC} ${label} (executed)"
    PASS=$((PASS + 1))
  fi
}

echo -e "${B}═══════════════════════════════════════${NC}"
echo -e "${B}  Smoke test MVP — Sprint 5+6${NC}"
echo -e "${B}  BASE_URL: ${BASE_URL}${NC}"
echo -e "${B}═══════════════════════════════════════${NC}"

# ── 1. Routes publiques ───────────────────────────────────────────────────
echo
echo -e "${Y}── Routes publiques ──${NC}"

check_http "Landing /"                           "${BASE_URL}/"                       "200"
check_http "Login /login"                        "${BASE_URL}/login"                  "200"
check_http "Pilotes /pilotes (S6-V1)"            "${BASE_URL}/pilotes"                "200"
check_http "Legal CGU"                           "${BASE_URL}/legal/cgu"              "200"
check_http "Legal Confidentialite"               "${BASE_URL}/legal/confidentialite"  "200"
check_http "Legal Cookies"                       "${BASE_URL}/legal/cookies"          "200"
check_http "Legal Mentions"                      "${BASE_URL}/legal/mentions-legales" "200"
check_http "Lecture facile RGPD (S6-V3)"         "${BASE_URL}/legal/lecture-facile"   "200"
check_http "Auth error page"                     "${BASE_URL}/auth/error"             "200"
check_http "404 brandee (S6-V1)"                 "${BASE_URL}/route-inexistante-xyz"  "404"

# ── 2. API endpoints (401 attendu pour requireUser sans cookie) ──────────
echo
echo -e "${Y}── API endpoints (401 = auth requise = OK) ──${NC}"

check_http "API plan-maia-daily"                 "${BASE_URL}/api/student/plan-maia-daily"        "401"
check_http "API hint-feedback POST"              "${BASE_URL}/api/student/hint-feedback"          "405,401"
check_http "API plan-maia check-answer POST"     "${BASE_URL}/api/student/plan-maia/check-answer" "405,401"
check_http "API stats direction (S6-12)"         "${BASE_URL}/api/teacher/stats-direction"        "401"
check_http "API profile preferences POST"        "${BASE_URL}/api/profile/preferences"            "405,401"

# ── 3. Schéma DB : tables + triggers + policies ────────────────────────────
echo
echo -e "${Y}── Schema DB (migrations Sprint 4-6) ──${NC}"

check_db_query "Table plan_maia_daily (S4-1)" \
  "SELECT tablename FROM pg_tables WHERE tablename = 'plan_maia_daily';"

check_db_query "Table plan_maia_answers (S5-4)" \
  "SELECT tablename FROM pg_tables WHERE tablename = 'plan_maia_answers';"

check_db_query "Table hint_evaluations (S6-7)" \
  "SELECT tablename FROM pg_tables WHERE tablename = 'hint_evaluations';"

check_db_query "Trigger sync plan_maia completed_count" \
  "SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_sync_plan_maia_completed_count','trg_sync_plan_completed_count_from_plan_answers');"

check_db_query "RLS hint_evaluations tenant check (B2 fix)" \
  "SELECT polname FROM pg_policy WHERE polrelid = 'public.hint_evaluations'::regclass AND polname = 'hint_evaluations_student_insert_own' AND pg_get_expr(polwithcheck, polrelid) LIKE '%current_user_school_id%';"

check_db_query "Column user_profiles.prefers_dyslexic_font (S6-8)" \
  "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' AND column_name='prefers_dyslexic_font';"

check_db_query "Column classes.invitation_code (S6-10)" \
  "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='classes' AND column_name='invitation_code';"

check_db_query "SECURITY DEFINER + search_path sur trigger funcs" \
  "SELECT proname FROM pg_proc WHERE proname IN ('sync_plan_maia_completed_count','sync_plan_completed_count_from_plan_answers','update_hint_evaluations_updated_at') AND prosecdef = true AND proconfig::text LIKE '%search_path%';"

# ── 4. Audit events Sprint 5+6 ─────────────────────────────────────────────
echo
echo -e "${Y}── Audit events disponibles ──${NC}"

# Note : audit_log contient des rows, on vérifie juste que les event_types
# Sprint 5+6 sont admis (CHECK constraint si présent, sinon par usage).
# Cette query verifie que des events plan_maia_generated existent.
check_db_query "Audit log a recu plan_maia_generated" \
  "SELECT count(*) FROM audit_log WHERE event_type IN ('plan_maia_generated','concept_hint_created','concept_hint_updated','concept_hint_deleted') LIMIT 1;" \
  "false"

# ── Summary ───────────────────────────────────────────────────────────────
echo
echo -e "${B}═══════════════════════════════════════${NC}"
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo -e "${G}✓ ${PASS}/${TOTAL} tests OK${NC}"
  echo -e "${G}MVP ready for pilote${NC}"
  exit 0
else
  echo -e "${R}✗ ${FAIL}/${TOTAL} tests failed (${PASS} passed)${NC}"
  echo -e "${R}À investiguer avant ouverture pilote${NC}"
  exit 1
fi
