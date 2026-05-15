#!/usr/bin/env bash
# scripts/deploy.sh — Pipeline B deployment orchestrator.
# Résout les risques humains T1 (sync maia oublié), T2 (ordre migration),
# T3 (Trigger.dev redeploy oublié). Voir runbook deploy 2026-05-15.

set -euo pipefail

echo "▸ 1/5 — Apply Supabase migration"
supabase db push --linked

echo "▸ 2/5 — Verify migration applied"
echo "  (manual check: visit Supabase dashboard → Database → migrations)"

echo "▸ 3/5 — Push schoolio main (origin)"
git push origin main

echo "▸ 4/5 — Sync to maia (Vercel trigger)"
git push maia origin/main:main

echo "▸ 5/5 — Deploy Trigger.dev runner"
npx trigger.dev@latest deploy --env prod

echo ""
echo "✓ Deploy complete."
echo "  Smoke test: upload PDF on /school/import and verify job completes."
