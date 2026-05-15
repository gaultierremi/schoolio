# Pipeline B Activation Runbook (2026-05-15)

> **Pré-requis** : PRs #63 → #70 mergées sur main + maia synced (les 7 PRs précédentes : hardening, schema, orchestrator, image extraction, Vision classification, image-aware questions, UI).

## État après merge des 7 PRs

Le code pipeline B est **présent en prod mais inactif** (feature flag `PIPELINE_B_ENABLED` OFF par défaut). L'orchestrateur ne lance que `runTextPipeline` (pipeline A).

## Étape 1 — Activer en preview Vercel pour dogfood QA

```bash
# Set env var preview only
vercel env add PIPELINE_B_ENABLED preview
# Value: true
```

Trigger preview deploy (push sur une branche de test ou recréation manuelle).

### QA dogfood (5 syllabi variés)

Upload chacun de ces syllabi en mode preview et vérifier :

| Matière | Niveau | Attentes |
|---|---|---|
| Chimie | 5e | ≥5 questions text + ≥3 questions image (molécules, schémas) |
| Histoire | 6e | ≥5 questions text + ≥3 questions image (scènes, portraits) |
| Géographie | 4e | ≥5 questions text + ≥3 questions image (cartes) |
| Biologie | 5e | ≥5 questions text + ≥3 questions image (cellules, anatomie) |
| Mathématiques | 6e | ≥5 questions text + ≥2 questions image (formules avec MathML) |

### Métriques à mesurer

```sql
-- Job success rate sur 24h
SELECT
  count(*) FILTER (WHERE status = 'done') AS done,
  count(*) FILTER (WHERE status = 'failed') AS failed,
  count(*) AS total
FROM question_generation_jobs
WHERE created_at > now() - interval '24 hours';

-- Pipeline B activity
SELECT
  count(*) FILTER (WHERE image_batches_total IS NOT NULL) AS pipeline_b_jobs,
  avg(image_batches_total) FILTER (WHERE image_batches_total > 0) AS avg_images_per_syllabus,
  count(*) FILTER (WHERE image_batches_total = 0) AS jobs_no_images
FROM question_generation_jobs
WHERE created_at > now() - interval '24 hours';

-- needs_review distribution
SELECT
  count(*) FILTER (WHERE needs_review = true) AS to_verify,
  count(*) FILTER (WHERE needs_review = false AND image_url IS NOT NULL) AS auto_approved_with_image,
  count(*) AS total_with_image
FROM teacher_questions
WHERE image_url IS NOT NULL
  AND created_at > now() - interval '24 hours';

-- Vision classification coverage
SELECT
  vision_type,
  count(*) AS n,
  avg(confidence) AS avg_conf
FROM pdf_extracted_images
WHERE created_at > now() - interval '24 hours'
GROUP BY vision_type
ORDER BY n DESC;
```

## Étape 2 — Activation production

Une fois la preview QA validée (Alex confirme manuellement la qualité des questions image-aware sur les 5 syllabi) :

```bash
vercel env add PIPELINE_B_ENABLED production
# Value: true
```

Trigger prod deploy via `scripts/deploy.sh` (force-redeploy depuis main).

## Étape 3 — Monitoring 48h

Suivre les mêmes queries SQL ci-dessus sur la période 48h post-activation. Alertes à surveiller :

- **Job success rate < 90%** : investiguer `error_logs` source `image-pipeline.*`
- **Anthropic billing > $200/mois projeté** : option toggle pipeline B OFF temporairement, profiler les call patterns
- **Vision confidence moyenne < 0.7** : recalibrer `REVIEW_CONFIDENCE_THRESHOLD` (actuellement 0.8)
- **% needs_review > 30%** : ajuster le seuil (trop de bruit pour le prof)

## Étape 4 — Cleanup legacy (déploiement N+2, ~2 semaines après)

Une fois la confiance acquise et personne ne consomme plus `worker_count` / `workers_completed`, drop des colonnes legacy :

```sql
-- À créer dans 2 semaines : supabase/migrations/2026-05-29-XXXXXX-drop-legacy-job-tracking.sql
alter table public.question_generation_jobs
  drop column if exists worker_count,
  drop column if exists workers_completed;
```

Et retirer les writes legacy dans `lib/generate-questions/run-text-pipeline.ts` (lignes ~466-470, ~509-512). Cf commentaires `// Dual-write : legacy ... + nouveau ...`.

## Rollback

En cas de problème grave en prod :

```bash
# Désactiver Pipeline B sans redéploiement (effet ~30s)
vercel env rm PIPELINE_B_ENABLED production
vercel env add PIPELINE_B_ENABLED production
# Value: false
```

Le pipeline A continue à fonctionner normalement. Les questions image-aware déjà générées restent en DB (avec `needs_review=true` flag), mais aucune nouvelle ne sera créée.
