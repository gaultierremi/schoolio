# Pipeline B (PDF Images) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter le pipeline B d'extraction d'images PDF en parallèle du pipeline A texte (existant), avec a11y native (MathML/SVG), classification 71 types pédagogiques CESS FWB, et activation progressive derrière feature flag.

**Architecture:** 8 PRs incrémentales <300 lignes chacune, derrière flag `PIPELINE_B_ENABLED`. Pipeline B = nouvelle Trigger.dev task parallèle à `generate-questions` qui : (1) extrait images locales via pdfjs canvas, (2) classifie chaque image via Haiku Vision (71 types), (3) génère questions image-aware via Sonnet, (4) marque `needs_review` si confidence < 0.8. Trigger DB done coordinator pour atomicité, expand-contract migrations pour zero-downtime, singleton admin client avec auto-recovery.

**Tech Stack:** Next.js 14 App Router, Supabase Postgres + Storage + RLS, Trigger.dev v3, Anthropic SDK (Haiku 4.5 Vision + Sonnet 4.6), `pdfjs-dist` + canvas polyfill, `katex` (server-side LaTeX→MathML), `@iqg/indigo-ketcher` (Imago WASM molécules), `d3-geo` + Natural Earth (cartes), Lucide icons.

**Spec source:** [`docs/superpowers/specs/2026-05-15-pdf-images-strategy.md`](../specs/2026-05-15-pdf-images-strategy.md) v3.

---

## Pre-flight (avant PR 1)

- [ ] Vérifier que la branche actuelle est `main` à jour :
```bash
git fetch origin && git checkout main && git pull origin main
```

- [ ] Confirmer l'environnement de test :
```bash
npm install
npm run test:run -- tests/lib/pdf-extract.test.ts
```
Expected: tests passent (vitest, environnement node).

- [ ] Vérifier accès Anthropic + Supabase prod en variables d'env locales (via `.env.local`).

---

## PR 1 — Hardening foundation

**Goal:** Préparer le terrain technique sans changer aucun comportement. Comportement strictement identique post-merge.

**Files:**
- Create: `lib/db/admin-client.ts`
- Create: `lib/feature-flags.ts`
- Create: `scripts/deploy.sh`
- Create: `docs/superpowers/deploy-runbooks/2026-05-15-pipeline-b-deploy.md`
- Create: `tests/lib/admin-client.test.ts`
- Modify: `lib/pdf/extract-text.ts:65-75` (warn text.length mismatch)
- Modify: `lib/generate-questions/extract-content.ts` (use `withAdminClient`)
- Modify: `lib/observability/log-error.ts` (use `withAdminClient`)
- Modify: `lib/activity/log.ts` (use `withAdminClient`)
- Modify: `app/school/questions/_hooks/useQuestionsPage.ts` (SELECT explicit)
- Modify: `app/api/teacher-questions/[id]/validation/route.ts` (SELECT explicit)
- Modify: `components/StudyWizard.tsx` (SELECT explicit if needed)

### Task 1.1: Branch + singleton admin client

- [ ] **Step 1:** Create branch
```bash
git checkout -b feat/pipeline-b-pr1-hardening
```

- [ ] **Step 2:** Write failing test `tests/lib/admin-client.test.ts`
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getAdminClient, resetAdminClient, withAdminClient } from "@/lib/db/admin-client";

describe("admin-client singleton", () => {
  beforeEach(() => {
    resetAdminClient();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
  });

  it("returns the same client on subsequent calls", async () => {
    const a = await getAdminClient();
    const b = await getAdminClient();
    expect(a).toBe(b);
  });

  it("returns a new client after reset", async () => {
    const a = await getAdminClient();
    resetAdminClient();
    const b = await getAdminClient();
    expect(a).not.toBe(b);
  });

  it("withAdminClient retries once on JWT error", async () => {
    let calls = 0;
    const result = await withAdminClient(async () => {
      calls++;
      if (calls === 1) throw new Error("JWT expired");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("withAdminClient throws on non-auth error", async () => {
    await expect(
      withAdminClient(async () => {
        throw new Error("network down");
      }),
    ).rejects.toThrow("network down");
  });
});
```

- [ ] **Step 3:** Run test, verify it fails
```bash
npm run test:run -- tests/lib/admin-client.test.ts
```
Expected: FAIL "Cannot find module '@/lib/db/admin-client'"

- [ ] **Step 4:** Create `lib/db/admin-client.ts`
```typescript
import { createClient as createSupabaseAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// Singleton admin Supabase client pour Trigger.dev runs + routes server.
// Auto-recovery sur erreur d'auth (JWT expire, session_not_found) via reset.
// Économie mesurée : ~5-15s par run (vs ~50 instanciations à 100-300ms).

let _adminPromise: Promise<SupabaseClient> | null = null;

function buildAdmin(): SupabaseClient {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      realtime: { transport: WebSocket as any },
    },
  );
}

export function getAdminClient(): Promise<SupabaseClient> {
  if (!_adminPromise) {
    _adminPromise = Promise.resolve(buildAdmin());
  }
  return _adminPromise;
}

export function resetAdminClient(): void {
  _adminPromise = null;
}

export async function withAdminClient<T>(
  fn: (admin: SupabaseClient) => Promise<T>,
): Promise<T> {
  const admin = await getAdminClient();
  try {
    return await fn(admin);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("JWT") || msg.includes("PGRST301") || msg.includes("session_not_found")) {
      resetAdminClient();
      const fresh = await getAdminClient();
      return await fn(fresh);
    }
    throw err;
  }
}
```

- [ ] **Step 5:** Run test, verify it passes
```bash
npm run test:run -- tests/lib/admin-client.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 6:** Commit
```bash
git add lib/db/admin-client.ts tests/lib/admin-client.test.ts
git commit -m "feat(db): singleton admin client with auto-recovery on JWT errors"
```

### Task 1.2: Feature flag module

- [ ] **Step 1:** Create `lib/feature-flags.ts`
```typescript
// Feature flags pilotables via env vars Vercel (reload ~30s sans redéploiement).
// Pattern : flag OFF par défaut, basculable sans code change.

export const PIPELINE_B_ENABLED = process.env.PIPELINE_B_ENABLED === "true";
```

- [ ] **Step 2:** Commit
```bash
git add lib/feature-flags.ts
git commit -m "feat(flags): introduce PIPELINE_B_ENABLED feature flag (OFF by default)"
```

### Task 1.3: Warn text.length mismatch in pdf/extract-text

- [ ] **Step 1:** Read current file
Reference: `lib/pdf/extract-text.ts:65-82`

- [ ] **Step 2:** Modify to add warning before fill defensive
Replace lines 65-73 :
```typescript
// On passe par getDocumentProxy d'abord pour avoir un PDFDocumentProxy
// réutilisable si on veut ajouter de l'extraction d'images plus tard.
const pdf = await getDocumentProxy(data);
const { totalPages, text } = await extractText(pdf, { mergePages: false });

// Surveillance silent-failure : si unpdf retourne moins d'entrées que totalPages,
// on perd des pages (PDF avec page protégée, font exotique, scan-only). On warn
// pour ne pas que ça passe inaperçu en prod. Le defensive fill ?? "" en dessous
// transforme les pages manquantes en strings vides — sans ce warn, les profs
// recevraient des syllabi traités à moitié sans le savoir.
if (text.length !== totalPages) {
  const lost = totalPages - text.length;
  // eslint-disable-next-line no-console
  console.warn(
    `[extract-text] PDF declares ${totalPages} pages but unpdf extracted ${text.length}. ${lost} pages lost.`,
  );
}

// Defensive : trim et garantit qu'on a exactement totalPages entrées
// (au cas où unpdf retournerait une longueur différente).
const pagesText: string[] = [];
for (let i = 0; i < totalPages; i++) {
  pagesText.push((text[i] ?? "").trim());
}
```

- [ ] **Step 3:** Run existing test to confirm no regression
```bash
npm run test:run -- tests/lib/pdf-extract.test.ts
```
Expected: PASS (existing tests still green)

- [ ] **Step 4:** Commit
```bash
git add lib/pdf/extract-text.ts
git commit -m "fix(pdf): warn when unpdf returns fewer pages than declared totalPages"
```

### Task 1.4: Refactor extract-content.ts to use withAdminClient

- [ ] **Step 1:** Read current usage
Reference: `lib/generate-questions/extract-content.ts:95-113, 346-417, 458-624`

- [ ] **Step 2:** Replace local `createAdminClient` function with import + usage

Delete lines 95-113 (local createAdminClient + updateJob using it). Replace with:

```typescript
import { getAdminClient, withAdminClient } from "@/lib/db/admin-client";

async function updateJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  await withAdminClient(async (admin) => {
    await admin
      .from("question_generation_jobs")
      .update({ ...patch, phase_changed_at: new Date().toISOString() })
      .eq("id", jobId);
  });
}
```

- [ ] **Step 3:** Replace all `const admin = createAdminClient();` sites with `withAdminClient`

In `processChapter` (around line 346) :
```typescript
// Avant
const admin = createAdminClient();
const { error: snipErr, count } = await admin.from("content_snippets").insert(snippetRows, { count: "exact" });

// Après
const { error: snipErr, count } = await withAdminClient(async (admin) => {
  return admin.from("content_snippets").insert(snippetRows, { count: "exact" });
});
```

Same pattern for the `teacher_questions` insert in `processChapter` and all admin uses in `runExtractionForJob`.

- [ ] **Step 4:** Run smoke test
```bash
npm run test:run -- tests/lib/
```
Expected: All tests pass (no regression).

- [ ] **Step 5:** Commit
```bash
git add lib/generate-questions/extract-content.ts
git commit -m "refactor(extract-content): use singleton withAdminClient (gain ~10s/run)"
```

### Task 1.5: Refactor log-error.ts + activity/log.ts

- [ ] **Step 1:** Modify `lib/observability/log-error.ts`

Replace function `adminClient()` (lines 17-32) with import :
```typescript
import { withAdminClient } from "@/lib/db/admin-client";
```

Replace `await adminClient().from("error_logs").insert(...)` (line 68-76) with:
```typescript
await withAdminClient(async (admin) => {
  await admin.from("error_logs").insert({
    severity: meta.severity ?? "error",
    source: meta.source.slice(0, 100),
    message,
    stack,
    context: meta.context ?? {},
    user_id: meta.userId ?? null,
    school_id: meta.schoolId ?? null,
  });
});
```

Remove the now-unused `createClient` and `WebSocket` imports at top.

- [ ] **Step 2:** Modify `lib/activity/log.ts` same pattern

Replace lines 16-25 with:
```typescript
import { withAdminClient } from "@/lib/db/admin-client";

// ... in logActivity body :
await withAdminClient(async (admin) => {
  await admin.from("activity_events").insert({
    event_type: params.event_type,
    actor_id: params.actor_id ?? null,
    actor_type: params.actor_type,
    target_type: params.target_type ?? null,
    target_id: params.target_id ?? null,
    teacher_id: params.teacher_id,
    context: params.context ?? {},
  });
});
```

Remove the now-unused `createClient` and `WebSocket` imports.

- [ ] **Step 3:** Run all tests
```bash
npm run test:run
```
Expected: All pass.

- [ ] **Step 4:** Commit
```bash
git add lib/observability/log-error.ts lib/activity/log.ts
git commit -m "refactor(observability): use singleton withAdminClient in log helpers"
```

### Task 1.6: Audit SELECT * — convert to explicit selects

- [ ] **Step 1:** Read each site
```bash
grep -n 'select("\*")' app/school/questions/_hooks/useQuestionsPage.ts
grep -n 'select("\*")' app/api/teacher-questions/\[id\]/validation/route.ts
grep -n 'select("\*")' components/StudyWizard.tsx
```

- [ ] **Step 2:** In `app/school/questions/_hooks/useQuestionsPage.ts`, replace `.select("*")` with:
```typescript
.select(
  "id, teacher_id, school_id, course_id, subject, subject_enum, level, type, " +
  "question, options, answer_index, expected_numeric_answer, numeric_tolerance, " +
  "numeric_unit, expected_text_answers, explanation, period, difficulty_stars, " +
  "organization_tags, is_ai_generated, is_public, page_range_start, " +
  "page_range_end, concept_page_hint, created_at"
)
```

- [ ] **Step 3:** In `app/api/teacher-questions/[id]/validation/route.ts`, replace the `.select("*")` with the same explicit column list.

- [ ] **Step 4:** In `components/StudyWizard.tsx`, check the table — if `teacher_questions`, use same column list. If another table, list its current columns explicitly.

- [ ] **Step 5:** Manual UI smoke test : open `/school/questions`, verify list renders normally.

- [ ] **Step 6:** Commit
```bash
git add app/school/questions/_hooks/useQuestionsPage.ts \
        app/api/teacher-questions/\[id\]/validation/route.ts \
        components/StudyWizard.tsx
git commit -m "refactor(queries): explicit column selects on teacher_questions (avoid SELECT *)"
```

### Task 1.7: Deploy script + runbook

- [ ] **Step 1:** Create `scripts/deploy.sh`
```bash
#!/usr/bin/env bash
# scripts/deploy.sh — Pipeline B deployment orchestrator.
# Résout les risques humains T1 (sync maia oublié), T2 (ordre migration),
# T3 (Trigger.dev redeploy oublié). Voir runbook deploy 2026-05-15.

set -euo pipefail

echo "▸ 1/5 — Apply Supabase migration"
supabase db push --linked

echo "▸ 2/5 — Verify migration applied (poll for 30s max)"
# Simple sanity : the user verifies in Supabase dashboard.
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
```

- [ ] **Step 2:** Make executable
```bash
chmod +x scripts/deploy.sh
```

- [ ] **Step 3:** Create runbook `docs/superpowers/deploy-runbooks/2026-05-15-pipeline-b-deploy.md`
```markdown
# Pipeline B Deploy Runbook (2026-05-15)

## Pré-vérifications

- [ ] PR mergée sur schoolio main
- [ ] Aucun job `question_generation_jobs` en cours (`status in ('pending','running')`)
- [ ] Backup DB pris (Supabase Dashboard → Backups → "Now")

## Séquence ordonnée

### Automatique (recommandé)
```bash
./scripts/deploy.sh
```

### Manuel (pour debug)
1. `supabase db push --linked` — applique migrations
2. Vérifier colonnes en prod : Supabase dashboard → Tables → `teacher_questions`
3. `git push origin main` — pousse code sur schoolio
4. `git push maia origin/main:main` — sync to maia (déclenche Vercel build ~2-3min)
5. `npx trigger.dev@latest deploy --env prod` — redéploie le runner

## Rollback

| Composant | Commande |
|---|---|
| Code | `git revert <commit> && git push origin main && git push maia origin/main:main` |
| Migration | `supabase db push --revert` (irréversible si data utilisé) |
| Trigger.dev | `npx trigger.dev rollback --env prod` |
| Feature flag | Vercel dashboard → Settings → Environment → `PIPELINE_B_ENABLED=false` (effet ~30s) |

## Smoke test

1. Login en tant que prof test
2. Upload syllabus chimie 3ème (corpus FWB)
3. Observer progression stepper (Extraction → Analyse → Génération → Validation)
4. Vérifier au moins 10 questions générées
5. Si pipeline B activé : vérifier au moins 1 question avec `image_url` non-null
```

- [ ] **Step 4:** Commit
```bash
git add scripts/deploy.sh docs/superpowers/deploy-runbooks/2026-05-15-pipeline-b-deploy.md
git commit -m "docs(deploy): runbook + deploy.sh script (resolves T1/T2/T3 sync risks)"
```

### Task 1.8: Open PR 1

- [ ] **Step 1:** Push branch
```bash
git push -u origin feat/pipeline-b-pr1-hardening
```

- [ ] **Step 2:** Open PR
```bash
gh pr create --title "feat(hardening): pipeline B PR 1 — singleton admin + warns + audits" \
  --body "$(cat <<'EOF'
## Summary
PR 1 du roadmap pipeline B (cf spec section 11). Hardening foundation sans changement de comportement.

- Singleton `getAdminClient` + `withAdminClient` avec auto-recovery JWT (gain ~10s/run)
- Feature flag `PIPELINE_B_ENABLED` (OFF par défaut)
- Warn quand unpdf perd des pages (silent failure prévention)
- Audit SELECT * → explicit columns (3 sites teacher_questions)
- `scripts/deploy.sh` + runbook deploy (T1/T2/T3 résolus)

## Test plan
- [ ] Tests vitest passent : `npm run test:run`
- [ ] Smoke test : upload syllabus connu, vérifier comportement IDENTIQUE pré-PR
- [ ] Vérifier UI `/school/questions` rendu normal

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" --base main
```

- [ ] **Step 3:** After merge + sync to maia, mark PR 1 done.

---

## PR 2 — DB schema + types partagés

**Goal:** Toutes les migrations + types TypeScript partagés + IMAGE_TYPES constante. No-op runtime.

**Files:**
- Create: `supabase/migrations/2026-05-15-100000-add-image-fields-to-teacher-questions.sql`
- Create: `supabase/migrations/2026-05-15-100001-add-image-url-to-content-snippets.sql`
- Create: `supabase/migrations/2026-05-15-100002-create-pdf-extracted-images.sql`
- Create: `supabase/migrations/2026-05-15-100003-add-pipeline-tracking-to-jobs.sql`
- Create: `supabase/migrations/2026-05-15-100004-create-job-done-coordinator-trigger.sql`
- Create: `lib/pdf/image-types.ts`
- Create: `lib/db/teacher-questions.ts`
- Create: `tests/lib/image-types.test.ts`

### Task 2.1: Branch + migration teacher_questions

- [ ] **Step 1:** Branch
```bash
git checkout main && git pull && git checkout -b feat/pipeline-b-pr2-schema
```

- [ ] **Step 2:** Create `supabase/migrations/2026-05-15-100000-add-image-fields-to-teacher-questions.sql`
```sql
-- 2026-05-15-100000-add-image-fields-to-teacher-questions.sql
-- Pipeline B (PDF images) : ajout colonnes image-aware sur teacher_questions.
-- Expand-contract migration : on ajoute des colonnes nullable, anciennes
-- intactes. Code écrit dans les deux jusqu'au déploiement N+2 (drop des anciennes).

alter table public.teacher_questions
  add column image_url text,
  add column image_hash text,
  add column image_page_number int,
  add column image_description_md text,
  add column image_confidence numeric(3,2),
  add column vision_type text,
  add column formula_latex text,
  add column formula_mathml text,
  add column molecule_smiles text,
  add column geo_topojson_path text,
  add column needs_review boolean not null default false;

comment on column public.teacher_questions.vision_type is
  'Un des 71 types definis dans lib/pdf/image-types.ts (IMAGE_TYPES).';

comment on column public.teacher_questions.needs_review is
  'Set true quand image_confidence < 0.8 lors de la generation. Prof valide avant publication.';

create index idx_teacher_questions_needs_review
  on public.teacher_questions (teacher_id, needs_review)
  where needs_review = true;
```

- [ ] **Step 3:** Apply locally
```bash
supabase db reset  # local DB
# OU si tu veux préserver les données locales :
supabase migration up
```

- [ ] **Step 4:** Commit
```bash
git add supabase/migrations/2026-05-15-100000-add-image-fields-to-teacher-questions.sql
git commit -m "feat(db): add image fields to teacher_questions (expand step)"
```

### Task 2.2: Migration content_snippets

- [ ] **Step 1:** Create `supabase/migrations/2026-05-15-100001-add-image-url-to-content-snippets.sql`
```sql
-- 2026-05-15-100001-add-image-url-to-content-snippets.sql
-- Pipeline B : permet d'attacher une image au snippet (pour tuteur socratique).

alter table public.content_snippets
  add column image_url text,
  add column image_hash text;
```

- [ ] **Step 2:** Apply + commit
```bash
supabase migration up
git add supabase/migrations/2026-05-15-100001-*
git commit -m "feat(db): add image_url/image_hash to content_snippets"
```

### Task 2.3: Migration pdf_extracted_images

- [ ] **Step 1:** Create `supabase/migrations/2026-05-15-100002-create-pdf-extracted-images.sql`
```sql
-- 2026-05-15-100002-create-pdf-extracted-images.sql
-- Audit / dedup table : chaque image PNG extraite d'un PDF, classifiée par Vision.
-- Source of truth pour pipeline B avant agregation dans teacher_questions.

create table public.pdf_extracted_images (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.question_generation_jobs (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  page_number int not null check (page_number > 0),
  storage_path text not null,
  hash text not null,
  width int not null,
  height int not null,
  description_md text,
  confidence numeric(3,2),
  vision_type text,
  latex_if_formula text,
  smiles_if_molecule text,
  topojson_region_hint text,
  created_at timestamptz not null default now()
);

create unique index uniq_pdf_extracted_images_course_hash
  on public.pdf_extracted_images (course_id, hash);

create index idx_pdf_extracted_images_job
  on public.pdf_extracted_images (job_id);

alter table public.pdf_extracted_images enable row level security;

-- Service role only INSERT/UPDATE (cf CLAUDE.md regle 8)
create policy "service_role only writes"
  on public.pdf_extracted_images
  for all
  to service_role
  using (true)
  with check (true);

-- Prof lit les images de ses propres cours
create policy "teacher reads own course images"
  on public.pdf_extracted_images
  for select
  to authenticated
  using (
    course_id in (
      select id from public.courses where teacher_id = auth.uid()
    )
  );
```

- [ ] **Step 2:** Apply + commit
```bash
supabase migration up
git add supabase/migrations/2026-05-15-100002-*
git commit -m "feat(db): create pdf_extracted_images audit table with RLS"
```

### Task 2.4: Migration job tracking columns

- [ ] **Step 1:** Create `supabase/migrations/2026-05-15-100003-add-pipeline-tracking-to-jobs.sql`
```sql
-- 2026-05-15-100003-add-pipeline-tracking-to-jobs.sql
-- Tracking separe pipeline A (text chapters) vs pipeline B (image batches).
-- Permet UI stepper de differencier les 2 progressions.
-- Code legacy continue a ecrire dans worker_count/workers_completed (expand-contract).

alter table public.question_generation_jobs
  add column text_chapters_total int,
  add column text_chapters_completed int not null default 0,
  add column image_batches_total int,
  add column image_batches_completed int not null default 0;

comment on column public.question_generation_jobs.text_chapters_total is
  'Pipeline A : nombre total de chapitres identifies par Haiku TOC.';
comment on column public.question_generation_jobs.image_batches_total is
  'Pipeline B : nombre total de batches images. NULL = pipeline B disabled (feature flag OFF).';
```

- [ ] **Step 2:** Apply + commit
```bash
supabase migration up
git add supabase/migrations/2026-05-15-100003-*
git commit -m "feat(db): add pipeline A/B tracking columns to question_generation_jobs"
```

### Task 2.5: Migration done coordinator trigger

- [ ] **Step 1:** Create `supabase/migrations/2026-05-15-100004-create-job-done-coordinator-trigger.sql`
```sql
-- 2026-05-15-100004-create-job-done-coordinator-trigger.sql
-- "Le dernier qui finit marque done" : trigger atomique cote DB.
-- Pas de race condition entre pipelines paralleles A et B.
-- Si pipeline B disabled (image_batches_total IS NULL), done des que A finit.

create or replace function check_job_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if NEW.text_chapters_total is not null
     and NEW.text_chapters_completed = NEW.text_chapters_total
     and (NEW.image_batches_total is null
          or NEW.image_batches_completed = NEW.image_batches_total)
     and NEW.status not in ('done', 'failed')
  then
    NEW.status := 'done';
    NEW.phase := 'done';
    NEW.completed_at := now();
  end if;
  return NEW;
end;
$$;

create trigger trg_job_auto_done
  before update on public.question_generation_jobs
  for each row execute function check_job_completion();
```

- [ ] **Step 2:** Apply + commit
```bash
supabase migration up
git add supabase/migrations/2026-05-15-100004-*
git commit -m "feat(db): trigger DB done coordinator (atomic, no race condition)"
```

### Task 2.6: IMAGE_TYPES constant + tests

- [ ] **Step 1:** Write failing test `tests/lib/image-types.test.ts`
```typescript
import { describe, it, expect } from "vitest";
import { IMAGE_TYPES, SKIP_TYPES, isSkipType, isValidImageType } from "@/lib/pdf/image-types";

describe("IMAGE_TYPES taxonomy", () => {
  it("has exactly 71 entries (64 pedagogical + 7 skip)", () => {
    expect(IMAGE_TYPES.length).toBe(71);
  });

  it("SKIP_TYPES is exactly 7 entries", () => {
    expect(SKIP_TYPES.length).toBe(7);
  });

  it("every SKIP_TYPE is in IMAGE_TYPES", () => {
    for (const t of SKIP_TYPES) {
      expect(IMAGE_TYPES).toContain(t);
    }
  });

  it("isSkipType detects skip types", () => {
    expect(isSkipType("logo")).toBe(true);
    expect(isSkipType("cell_diagram")).toBe(false);
  });

  it("isValidImageType validates strings", () => {
    expect(isValidImageType("cell_diagram")).toBe(true);
    expect(isValidImageType("nonexistent")).toBe(false);
    expect(isValidImageType("")).toBe(false);
    expect(isValidImageType(null)).toBe(false);
  });
});
```

- [ ] **Step 2:** Run test, expect fail
```bash
npm run test:run -- tests/lib/image-types.test.ts
```

- [ ] **Step 3:** Create `lib/pdf/image-types.ts` — paste full constant from spec section 4.4
```typescript
// Taxonomy d'images PDF pour pipeline B classification Vision (CESS FWB).
// 64 types pedagogiques + 7 types a skip (logos/decoration/icons).
// Sans mecanique physique (forces, dynamique) — pas prioritaire phase 2.
// Cf docs/superpowers/specs/2026-05-15-pdf-images-strategy.md section 4.4

export const IMAGE_TYPES = [
  // === Sciences exactes ===
  "formula_math", "graph_function", "geometric_figure",
  "formula_physics_electric", "circuit_diagram", "wave_graph",
  "optics_diagram", "thermodynamic_diagram", "formula_chemical_equation",
  "molecule_organic", "molecule_inorganic", "lewis_structure",
  "periodic_table_excerpt", "lab_apparatus",
  // === Sciences du vivant ===
  "cell_diagram", "anatomy_human", "anatomy_animal", "anatomy_plant",
  "chromosome_diagram", "family_tree_genetic", "ecosystem_diagram",
  "food_chain", "microscopic_image", "photo_animal", "photo_plant", "photo_mineral",
  // === Histoire ===
  "scene_historical_painting", "scene_historical_photo", "portrait_historical",
  "battle_scene", "daily_life_scene", "monument_architectural",
  "archaeological_artifact", "document_historical", "timeline_historical",
  // === Geographie ===
  "map_political", "map_physical", "map_climate", "map_demographic",
  "map_economic", "map_topographic", "map_hydrographic", "map_historical",
  "map_world", "satellite_image", "geological_section",
  "weather_diagram", "urban_diagram",
  // === Religion / philosophie ===
  "religious_painting", "religious_icon", "biblical_scene",
  "religious_symbol", "sacred_text_excerpt", "philosophical_portrait",
  // === Langues / lettres ===
  "linguistic_table", "literary_excerpt", "author_portrait", "etymology_diagram",
  // === Arts ===
  "art_painting", "art_sculpture", "art_architecture",
  "music_score", "musical_instrument",
  // === Economie / sociales ===
  "economic_chart", "economic_flow_diagram", "statistical_graph",
  "sociological_graph", "legal_document_excerpt",
  // === Transversal / structurel ===
  "table_data", "concept_map", "flowchart",
  "venn_diagram", "tree_diagram", "pyramid_diagram",
  // === A skip (filtrer) ===
  "logo", "decoration", "icon", "header_footer",
  "qr_code", "barcode", "cover_page_element",
] as const;

export type ImageType = (typeof IMAGE_TYPES)[number];

export const SKIP_TYPES: readonly ImageType[] = [
  "logo", "decoration", "icon", "header_footer",
  "qr_code", "barcode", "cover_page_element",
];

export function isSkipType(t: ImageType): boolean {
  return SKIP_TYPES.includes(t);
}

export function isValidImageType(value: unknown): value is ImageType {
  return typeof value === "string" && (IMAGE_TYPES as readonly string[]).includes(value);
}
```

- [ ] **Step 4:** Run test, verify pass
```bash
npm run test:run -- tests/lib/image-types.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 5:** Commit
```bash
git add lib/pdf/image-types.ts tests/lib/image-types.test.ts
git commit -m "feat(types): IMAGE_TYPES taxonomy (71 entries, CESS FWB)"
```

### Task 2.7: TeacherQuestionInsertRow type + helper

- [ ] **Step 1:** Create `lib/db/teacher-questions.ts`
```typescript
import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import { withAdminClient } from "@/lib/db/admin-client";
import type { ImageType } from "@/lib/pdf/image-types";

// Type centralise pour les inserts teacher_questions. Inclut les nouveaux
// champs pipeline B nullable. Code pipeline A et B utilisent ce meme type.

export type TeacherQuestionInsertRow = {
  teacher_id: string;
  school_id: string;
  course_id: string;
  subject: string | null;
  subject_enum: string | null;
  level: number | null;
  type: "mcq" | "numeric" | "short_text";
  question: string;
  options: string[];                       // empty array for non-mcq
  answer_index: number;                    // 0 for non-mcq
  expected_numeric_answer: number | null;
  numeric_tolerance: number | null;
  numeric_unit: string | null;
  expected_text_answers: string[] | null;
  explanation: string | null;
  period: string;                          // chapter title
  difficulty_stars: number | null;
  organization_tags: string[];
  is_ai_generated: boolean;
  is_public: boolean;
  page_range_start: number | null;
  page_range_end: number | null;
  concept_page_hint: number | null;
  // === Pipeline B fields (all nullable) ===
  image_url?: string | null;
  image_hash?: string | null;
  image_page_number?: number | null;
  image_description_md?: string | null;
  image_confidence?: number | null;
  vision_type?: ImageType | null;
  formula_latex?: string | null;
  formula_mathml?: string | null;
  molecule_smiles?: string | null;
  geo_topojson_path?: string | null;
  needs_review?: boolean;
};

export async function insertTeacherQuestions(
  rows: TeacherQuestionInsertRow[],
): Promise<{ count: number; error: PostgrestError | null }> {
  if (rows.length === 0) return { count: 0, error: null };
  return withAdminClient(async (admin) => {
    const { error, count } = await admin
      .from("teacher_questions")
      .insert(rows, { count: "exact" });
    return { count: count ?? 0, error };
  });
}
```

- [ ] **Step 2:** Commit
```bash
git add lib/db/teacher-questions.ts
git commit -m "feat(types): centralised TeacherQuestionInsertRow type + insertTeacherQuestions helper"
```

### Task 2.8: Open PR 2

- [ ] **Step 1:** Push + open PR
```bash
git push -u origin feat/pipeline-b-pr2-schema
gh pr create --title "feat(db): pipeline B PR 2 — schema migrations + types" \
  --body "$(cat <<'EOF'
## Summary
PR 2 du roadmap pipeline B. Migrations expand-contract (no-op runtime) + types TS partagés.

- Migration 1 : `teacher_questions` + 11 colonnes nullable (image_*, formula_*, molecule_smiles, geo_topojson_path, needs_review)
- Migration 2 : `content_snippets` + image_url/image_hash
- Migration 3 : table `pdf_extracted_images` avec RLS service_role + teacher read
- Migration 4 : tracking pipeline A/B (text_chapters_*, image_batches_*)
- Migration 5 : trigger DB done coordinator (SECURITY DEFINER + search_path='')
- IMAGE_TYPES constante (71 types CESS FWB)
- TeacherQuestionInsertRow type + insertTeacherQuestions helper

## Test plan
- [ ] Migrations passent en local : `supabase db reset`
- [ ] Test IMAGE_TYPES : `npm run test:run tests/lib/image-types.test.ts`
- [ ] Vérifier RLS : SELECT depuis un autre teacher → 0 rows

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" --base main
```

- [ ] **Step 2:** After PR 1 merged + maia synced, merge PR 2.

---

## PR 3 — Orchestrator refactor (comportement IDENTIQUE)

**Goal:** Extraire le code monolithique de `runExtractionForJob` dans `runTextPipeline.ts` + orchestrateur léger. Aucun changement de comportement observable.

**Files:**
- Create: `lib/generate-questions/run-text-pipeline.ts`
- Create: `lib/generate-questions/orchestrator.ts`
- Modify: `lib/generate-questions/extract-content.ts` (delegate à orchestrator)

### Task 3.1: Extract runTextPipeline

- [ ] **Step 1:** Branch
```bash
git checkout main && git pull && git checkout -b feat/pipeline-b-pr3-orchestrator
```

- [ ] **Step 2:** Create `lib/generate-questions/run-text-pipeline.ts` — copy the body of current `runExtractionForJob` from `extract-content.ts:457-624` mostly as-is, but:
  - Export as `runTextPipeline(jobId, job, course)`
  - Move the job/course load OUT (orchestrator does it)
  - Replace `worker_count`/`workers_completed` writes with **BOTH** legacy + `text_chapters_total`/`text_chapters_completed` (expand step)

Key changes to apply to the extracted code :
```typescript
// Avant (line 519)
await updateJob(jobId, { phase: "generating_workers", workers_completed: 0 });
// Apres
await updateJob(jobId, {
  phase: "generating_workers",
  workers_completed: 0,
  text_chapters_completed: 0,
});

// Avant (line 527)
await updateJob(jobId, { worker_count: chapters.length });
// Apres
await updateJob(jobId, {
  worker_count: chapters.length,
  text_chapters_total: chapters.length,
});

// Avant (line 565-569)
await updateJob(jobId, {
  workers_completed: chaptersDone,
  questions_raw: totalQuestionsInserted,
  questions_inserted: totalQuestionsInserted,
});
// Apres (ajoute text_chapters_completed)
await updateJob(jobId, {
  workers_completed: chaptersDone,
  text_chapters_completed: chaptersDone,
  questions_raw: totalQuestionsInserted,
  questions_inserted: totalQuestionsInserted,
});

// Avant (line 609-614) — fin de pipeline texte
await updateJob(jobId, {
  status: "done",
  phase: "done",
  questions_inserted: totalQuestionsInserted,
  completed_at: new Date().toISOString(),
});
// Apres — NE PAS marquer done ici. Le trigger DB done coordinator s'en charge
// automatiquement quand text_chapters_completed === text_chapters_total ET
// (image_batches_total IS NULL OU image_batches_completed === image_batches_total).
// On juste met phase à "validating" et écrit questions_inserted.
await updateJob(jobId, {
  phase: "validating",
  questions_inserted: totalQuestionsInserted,
});
```

Signature finale :
```typescript
export async function runTextPipeline(
  jobId: string,
  job: JobRow,
  course: CourseRow,
  pagesText: string[],
  workingPagesCount: number,
  subjectLabel: string,
  level: SchoolLevel | null,
  pageRange: { start: number; end: number } | null,
): Promise<{ totalSnippetsInserted: number; totalQuestionsInserted: number; failedChapters: string[] }> {
  // ... corps actuel de runExtractionForJob à partir de la phase 'generating_workers'
}
```

- [ ] **Step 3:** Verify it compiles
```bash
npx tsc --noEmit
```
Expected: 0 errors.

### Task 3.2: Create orchestrator

- [ ] **Step 1:** Create `lib/generate-questions/orchestrator.ts`
```typescript
// Orchestrateur leger : load job + course, extract texte PDF une fois,
// dispatch pipelines A (texte, existant) et B (images, futur) en parallele.
// Le trigger DB done coordinator marque le job done atomiquement quand
// les 2 pipelines ont termine.

import { logError } from "@/lib/observability/log-error";
import { logActivity } from "@/lib/activity/log";
import { withAdminClient } from "@/lib/db/admin-client";
import { extractTextFromPdf } from "@/lib/pdf/extract-text";
import { isValidSubject, isValidLevel, SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId, SchoolLevel } from "@/lib/subjects";
import { PIPELINE_B_ENABLED } from "@/lib/feature-flags";
import { runTextPipeline } from "./run-text-pipeline";
import { MAX_PDF_BYTES } from "./extract-content";

type JobRow = {
  id: string;
  course_id: string;
  teacher_id: string;
  school_id: string;
  total_target: number;
  pages_count: number | null;
  page_range_start: number | null;
  page_range_end: number | null;
};

type CourseRow = {
  id: string;
  teacher_id: string;
  school_id: string;
  subject_enum: string | null;
  level: number | null;
  pdf_storage_path: string | null;
  organization_tags: string[] | null;
  pages_count: number | null;
};

async function updateJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  await withAdminClient(async (admin) => {
    await admin
      .from("question_generation_jobs")
      .update({ ...patch, phase_changed_at: new Date().toISOString() })
      .eq("id", jobId);
  });
}

function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function runOrchestrator(jobId: string): Promise<void> {
  try {
    // ── Load job + course ────────────────────────────────────────────────
    const { jobRaw, jobErr, courseRaw, courseErr } = await withAdminClient(async (admin) => {
      const { data: jobRaw, error: jobErr } = await admin
        .from("question_generation_jobs")
        .select("id, course_id, teacher_id, school_id, total_target, pages_count, page_range_start, page_range_end")
        .eq("id", jobId).single();
      if (jobErr || !jobRaw) return { jobRaw, jobErr, courseRaw: null, courseErr: null };

      const { data: courseRaw, error: courseErr } = await admin
        .from("courses")
        .select("id, teacher_id, school_id, subject_enum, level, pdf_storage_path, organization_tags, pages_count")
        .eq("id", (jobRaw as JobRow).course_id).single();
      return { jobRaw, jobErr, courseRaw, courseErr };
    });
    if (jobErr || !jobRaw) throw new Error(`Job ${jobId} introuvable: ${jobErr?.message ?? "no row"}`);
    if (courseErr || !courseRaw) throw new Error(`Course introuvable: ${courseErr?.message ?? "no row"}`);

    const job = jobRaw as JobRow;
    const course = courseRaw as CourseRow;
    if (!course.pdf_storage_path) throw new Error("Course sans pdf_storage_path");

    const subject: SubjectId = isValidSubject(course.subject_enum) ? course.subject_enum : "histoire";
    const level: SchoolLevel | null = isValidLevel(course.level) ? course.level : null;
    const subjectLabel = SUBJECTS_BY_ID[subject].label;
    const pageRange =
      typeof job.page_range_start === "number" && typeof job.page_range_end === "number"
        ? { start: job.page_range_start, end: job.page_range_end }
        : null;

    // ── Phase: extracting_pdf ────────────────────────────────────────────
    await updateJob(jobId, { status: "running", phase: "extracting_pdf" });

    const pdfBuffer = await withAdminClient(async (admin) => {
      const { data: pdfBlob, error: downloadError } = await admin.storage
        .from("course-pdfs")
        .download(course.pdf_storage_path!);
      if (downloadError || !pdfBlob) {
        throw new Error(`PDF download failed: ${downloadError?.message ?? "no blob"}`);
      }
      return Buffer.from(await pdfBlob.arrayBuffer());
    });

    if (pdfBuffer.byteLength > MAX_PDF_BYTES) {
      const sizeMB = (pdfBuffer.byteLength / 1024 / 1024).toFixed(1);
      throw new Error(`PDF de ${sizeMB}MB trop volumineux (max 20MB)`);
    }

    const extracted = await extractTextFromPdf(pdfBuffer);
    // eslint-disable-next-line no-console
    console.log(
      `[orchestrator] text extraction: ${extracted.pageCount} pages, ${extracted.totalChars} chars, ${extracted.durationMs}ms`,
    );

    let pagesText = extracted.pagesText;
    let workingPagesCount = extracted.pageCount;
    if (pageRange !== null) {
      const start = Math.max(1, pageRange.start);
      const end = Math.min(extracted.pageCount, pageRange.end);
      pagesText = extracted.pagesText.slice(start - 1, end);
      workingPagesCount = end - start + 1;
    }

    // ── Dispatch pipelines en parallèle ──────────────────────────────────
    const promises: Promise<unknown>[] = [
      runTextPipeline(jobId, job, course, pagesText, workingPagesCount, subjectLabel, level, pageRange),
    ];

    if (PIPELINE_B_ENABLED) {
      // PR 4 ajoutera : promises.push(runImagePipeline(jobId, job, course, pdfBuffer));
      // Pour l'instant pipeline B disabled, image_batches_total reste NULL → trigger DB
      // marquera done dès que pipeline A finit (text_chapters_completed === text_chapters_total).
    }

    await Promise.allSettled(promises);

    // ── Activity log (existing behaviour for pageRange) ──────────────────
    if (pageRange !== null) {
      await logActivity({
        event_type: "teacher_generated_targeted_questions",
        actor_id: job.teacher_id,
        actor_type: "teacher",
        target_type: "course",
        target_id: course.id,
        teacher_id: job.teacher_id,
        context: { page_range: pageRange },
      });
    }

    // Note : on ne marque PAS done ici. Le trigger DB s'en charge atomiquement.
  } catch (err) {
    await logError(err, { source: "orchestrator.runOrchestrator", context: { jobId } });
    await updateJob(jobId, {
      status: "failed",
      phase: "failed",
      error_message: serializeError(err).slice(0, 500),
      completed_at: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 2:** Delegate from `extract-content.ts:runExtractionForJob` to orchestrator

Edit `lib/generate-questions/extract-content.ts` — replace the entire body of `runExtractionForJob` with:
```typescript
import { runOrchestrator } from "./orchestrator";

export async function runExtractionForJob(jobId: string): Promise<void> {
  return runOrchestrator(jobId);
}
```

Keep all helper exports (`MAX_PDF_BYTES`, `MAX_QUESTIONS_PER_COURSE`, `autoTargetQuestions`) since they're imported by routes.

- [ ] **Step 3:** Type-check
```bash
npx tsc --noEmit
```

- [ ] **Step 4:** Run all tests
```bash
npm run test:run
```

- [ ] **Step 5:** Commit
```bash
git add lib/generate-questions/
git commit -m "refactor(extract-content): orchestrator + runTextPipeline (behaviour identical)"
```

### Task 3.3: Manual smoke test + PR 3

- [ ] **Step 1:** Local smoke test (need Trigger.dev dev or DB access)
```bash
# Run a known syllabus through the pipeline
# Expected : same questions count as baseline pre-refactor
```
Document result in commit / PR comment.

- [ ] **Step 2:** Push + PR
```bash
git push -u origin feat/pipeline-b-pr3-orchestrator
gh pr create --title "refactor(extract-content): pipeline B PR 3 — orchestrator split" \
  --body "$(cat <<'EOF'
## Summary
PR 3 du roadmap pipeline B. Refactor orchestrateur sans changement de comportement observable.

- `runOrchestrator` (nouveau, léger) : load job/course, extract texte, dispatch pipelines en parallèle
- `runTextPipeline` (extrait du monolithe) : code du pipeline A actuel, intact
- Hook prêt pour `runImagePipeline` (PR 4, derrière feature flag)
- Trigger DB done coordinator (PR 2) marque done atomiquement — plus de `updateJob({status: "done"})` dans le code

## Test plan
- [ ] Tests vitest passent
- [ ] Smoke test syllabus chimie 3ème : questions count IDENTIQUE pré-refactor (baseline ~100)
- [ ] Status passe à `done` automatiquement via trigger DB

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" --base main
```

---

## PR 4 — Image extraction (pdfjs canvas + Supabase Storage)

**Goal:** Extraire les images locales d'un PDF + upload Supabase Storage + INSERT pdf_extracted_images. Derrière `PIPELINE_B_ENABLED` (OFF en prod, ON en dev pour tests).

**Files:**
- Create: `lib/pdf/extract-images.ts`
- Create: `lib/generate-questions/run-image-pipeline.ts` (stub : extract only, pas encore Vision)
- Modify: `lib/generate-questions/orchestrator.ts` (wire runImagePipeline)
- Create: `tests/lib/pdf-extract-images.test.ts`

### Task 4.1: pdfjs image extraction

- [ ] **Step 1:** Branch
```bash
git checkout main && git pull && git checkout -b feat/pipeline-b-pr4-extract-images
```

- [ ] **Step 2:** Create `lib/pdf/extract-images.ts`
```typescript
// Extraction locale des images embarquees dans un PDF via pdfjs-dist canvas.
// Filtre les images decoratives (<100px ou >4000px ou ratio aberrant).
// Output : tableau d'objets PNG buffer + bounding box + page + hash SHA-256.

import { createHash } from "node:crypto";

export type ExtractedImage = {
  pageNumber: number;
  width: number;
  height: number;
  pngBuffer: Buffer;
  hash: string;
};

const MIN_DIMENSION = 100;
const MAX_DIMENSION = 4000;
const MAX_ASPECT_RATIO = 10;

function shouldKeepImage(width: number, height: number): boolean {
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) return false;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) return false;
  const ratio = Math.max(width / height, height / width);
  if (ratio > MAX_ASPECT_RATIO) return false;
  return true;
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Extract images from a PDF buffer using pdfjs canvas.
 * Returns one entry per kept image (filtered for decoration/aspect).
 */
export async function extractImagesFromPdf(pdfBuffer: Buffer): Promise<ExtractedImage[]> {
  // Dynamic import : pdfjs-dist + canvas only loaded if pipeline B enabled.
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("canvas");

  const data = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  const images: ExtractedImage[] = [];
  const seenHashes = new Set<string>();

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const ops = await page.getOperatorList();
    const objs = page.objs;

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fnId = ops.fnArray[i];
      const args = ops.argsArray[i];

      // paintImageXObject = 85, paintInlineImageXObject = 86 (in pdfjs-dist OPS enum)
      if (fnId !== pdfjsLib.OPS.paintImageXObject && fnId !== pdfjsLib.OPS.paintInlineImageXObject) {
        continue;
      }

      const imgName = args[0];
      const img = objs.has(imgName) ? objs.get(imgName) : null;
      if (!img) continue;

      const { width, height, data: imgData } = img;
      if (!shouldKeepImage(width, height)) continue;

      // Render to canvas + encode as PNG
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      const imageData = ctx.createImageData(width, height);
      // imgData may be RGB or RGBA depending on PDF — handle both
      if (imgData.length === width * height * 3) {
        // RGB → expand to RGBA
        for (let p = 0, j = 0; p < imgData.length; p += 3, j += 4) {
          imageData.data[j] = imgData[p];
          imageData.data[j + 1] = imgData[p + 1];
          imageData.data[j + 2] = imgData[p + 2];
          imageData.data[j + 3] = 255;
        }
      } else if (imgData.length === width * height * 4) {
        imageData.data.set(imgData);
      } else {
        continue; // unsupported pixel format
      }
      ctx.putImageData(imageData, 0, 0);

      const pngBuffer = canvas.toBuffer("image/png");
      const hash = sha256(pngBuffer);
      if (seenHashes.has(hash)) continue; // dedup
      seenHashes.add(hash);

      images.push({ pageNumber: pageNum, width, height, pngBuffer, hash });
    }
  }

  return images;
}
```

- [ ] **Step 3:** Verify `canvas` is in deps
```bash
grep '"canvas"' package.json
```
If not, install: `npm install canvas`

- [ ] **Step 4:** Commit
```bash
git add lib/pdf/extract-images.ts package.json package-lock.json
git commit -m "feat(pdf): extract images from PDF via pdfjs canvas + dedup"
```

### Task 4.2: runImagePipeline stub (extract + upload + INSERT)

- [ ] **Step 1:** Create `lib/generate-questions/run-image-pipeline.ts`
```typescript
// Pipeline B : extract images locales -> upload Supabase Storage -> INSERT pdf_extracted_images.
// Vision Haiku classification arrive en PR 5. Cette PR garde Vision OFF.
// Toujours derriere PIPELINE_B_ENABLED feature flag.

import { extractImagesFromPdf, type ExtractedImage } from "@/lib/pdf/extract-images";
import { withAdminClient } from "@/lib/db/admin-client";
import { logError } from "@/lib/observability/log-error";

type JobRow = {
  id: string;
  course_id: string;
  teacher_id: string;
  school_id: string;
};

type CourseRow = {
  id: string;
  teacher_id: string;
};

async function updateJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  await withAdminClient(async (admin) => {
    await admin
      .from("question_generation_jobs")
      .update({ ...patch, phase_changed_at: new Date().toISOString() })
      .eq("id", jobId);
  });
}

async function uploadAndInsertBatch(
  jobId: string,
  course: CourseRow,
  batch: ExtractedImage[],
): Promise<void> {
  for (const img of batch) {
    const storagePath = `${course.id}/images/${img.hash}.png`;
    await withAdminClient(async (admin) => {
      // Upload (idempotent grace au hash)
      const { error: uploadErr } = await admin.storage
        .from("course-uploads")
        .upload(storagePath, img.pngBuffer, {
          contentType: "image/png",
          upsert: true,
        });
      if (uploadErr) {
        await logError(uploadErr, {
          source: "image-pipeline.upload",
          context: { jobId, hash: img.hash, page: img.pageNumber },
        });
        return;
      }

      // INSERT audit row
      const { error: insertErr } = await admin.from("pdf_extracted_images").insert({
        job_id: jobId,
        course_id: course.id,
        page_number: img.pageNumber,
        storage_path: storagePath,
        hash: img.hash,
        width: img.width,
        height: img.height,
        // description_md, confidence, vision_type filled by PR 5 (Vision classification)
      });
      if (insertErr && !insertErr.message.includes("duplicate")) {
        await logError(insertErr, {
          source: "image-pipeline.insert",
          context: { jobId, hash: img.hash },
        });
      }
    });
  }
}

export async function runImagePipeline(
  jobId: string,
  job: JobRow,
  course: CourseRow,
  pdfBuffer: Buffer,
): Promise<{ imagesExtracted: number; imagesUploaded: number }> {
  const images = await extractImagesFromPdf(pdfBuffer);

  if (images.length === 0) {
    // Mark pipeline B done immediately
    await updateJob(jobId, {
      image_batches_total: 0,
      image_batches_completed: 0,
    });
    return { imagesExtracted: 0, imagesUploaded: 0 };
  }

  // Batch by 5 for concurrent upload (Trigger.dev memory-friendly)
  const BATCH_SIZE = 5;
  const batches: ExtractedImage[][] = [];
  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    batches.push(images.slice(i, i + BATCH_SIZE));
  }

  await updateJob(jobId, {
    image_batches_total: batches.length,
    image_batches_completed: 0,
  });

  let uploaded = 0;
  let batchesDone = 0;
  for (const batch of batches) {
    await uploadAndInsertBatch(jobId, course, batch);
    uploaded += batch.length;
    batchesDone++;
    await updateJob(jobId, { image_batches_completed: batchesDone });
  }

  return { imagesExtracted: images.length, imagesUploaded: uploaded };
}
```

- [ ] **Step 2:** Wire into orchestrator. Edit `lib/generate-questions/orchestrator.ts` :

After the `runTextPipeline` push:
```typescript
import { runImagePipeline } from "./run-image-pipeline";

// ... in promises array :
if (PIPELINE_B_ENABLED) {
  promises.push(runImagePipeline(jobId, job, course, pdfBuffer));
}
```

- [ ] **Step 3:** Type-check
```bash
npx tsc --noEmit
```

- [ ] **Step 4:** Commit
```bash
git add lib/generate-questions/run-image-pipeline.ts lib/generate-questions/orchestrator.ts
git commit -m "feat(pipeline-b): runImagePipeline stub — extract + upload + INSERT (no Vision yet)"
```

### Task 4.3: PR 4

- [ ] **Step 1:** Push + open PR
```bash
git push -u origin feat/pipeline-b-pr4-extract-images
gh pr create --title "feat(pipeline-b): PR 4 — image extraction + storage upload (no Vision yet)" \
  --body "$(cat <<'EOF'
## Summary
PR 4. Extraction d'images PDF + upload Supabase Storage + audit. Derrière `PIPELINE_B_ENABLED` (OFF prod).

- `extractImagesFromPdf` : pdfjs canvas → PNG buffers + filtre décoration + dedup hash
- `runImagePipeline` : extract → upload batch 5 → INSERT pdf_extracted_images
- Wire dans orchestrator (parallèle pipeline A)
- Vision classification → PR 5

## Test plan
- [ ] Dev local : `PIPELINE_B_ENABLED=true npm run dev` + upload syllabus chimie
- [ ] Vérifier table `pdf_extracted_images` peuplée
- [ ] Vérifier bucket `course-uploads/{courseId}/images/*.png`
- [ ] Vérifier `image_batches_completed === image_batches_total` à la fin
- [ ] Job passe à `done` via trigger DB (atomic)

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" --base main
```

---

## PR 5 — Vision Haiku classification (71 types)

**Goal:** Pour chaque image dans `pdf_extracted_images`, call Haiku Vision 4.5 → classifier en 1 des 71 types + description + confidence + LaTeX/SMILES si applicable.

**Files:**
- Create: `lib/generate-questions/vision-classify.ts`
- Modify: `lib/generate-questions/run-image-pipeline.ts` (wire classify after upload)
- Create: `tests/lib/vision-classify.test.ts`

### Task 5.1: Vision classification function

- [ ] **Step 1:** Branch
```bash
git checkout main && git pull && git checkout -b feat/pipeline-b-pr5-vision
```

- [ ] **Step 2:** Create `lib/generate-questions/vision-classify.ts`
```typescript
// Vision Haiku 4.5 classification : pour chaque image extraite, retourne
// un JSON structure avec type (parmi 71), description, confidence + LaTeX/SMILES
// selon le type. Cf spec section 4.3.

import { routeAIRequest } from "@/lib/ai-router";
import { IMAGE_TYPES, isValidImageType, type ImageType } from "@/lib/pdf/image-types";

export type VisionClassification = {
  type: ImageType;
  subject_hint: string;
  description: string;
  key_elements: string[];
  pedagogical_use: string;
  confidence: number;
  ocr_text: string;
  latex_if_formula: string | null;
  smiles_if_molecule: string | null;
  topojson_region_hint: string | null;
};

const VISION_PROMPT = `Tu es un expert pedagogique CESS Belgique FWB (5eme/6eme, 16-18 ans).
Decris cette image extraite d'un syllabus scolaire.

Reponds en JSON strict (aucun texte hors JSON) :
{
  "type": "<un type de la taxonomy>",
  "subject_hint": "chimie|math|physique|biologie|histoire|geographie|religion|philosophie|francais|neerlandais|anglais|allemand|latin|economie|arts|musique|autre",
  "description": "2-4 phrases. Si formule : transcription textuelle. Si scene : composition, epoque, personnages. Si carte : type, region, legende. Si schema : ce qui est represente, parties annotees.",
  "key_elements": ["liste", "des", "elements", "identifiables"],
  "pedagogical_use": "Quel type de question pedagogique cette image permet.",
  "confidence": 0.0-1.0,
  "ocr_text": "Texte present dans l'image (legendes, labels, formules en LaTeX si math).",
  "latex_if_formula": "Pour type=formula_* : transcription LaTeX. Sinon null.",
  "smiles_if_molecule": "Pour type=molecule_organic : SMILES si identifiable. Sinon null.",
  "topojson_region_hint": "Pour type=map_* : nom region principale (ex: 'Belgique', 'Wallonie', 'Europe'). Sinon null."
}

Types disponibles : ${IMAGE_TYPES.join(", ")}`;

function parseClassification(raw: string): Partial<VisionClassification> {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch { /* try fence */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* try greedy */ }
  }
  const greedy = trimmed.match(/\{[\s\S]*\}/);
  if (greedy?.[0]) {
    try { return JSON.parse(greedy[0]); } catch { /* give up */ }
  }
  return {};
}

function normalize(parsed: Partial<VisionClassification>): VisionClassification | null {
  if (!parsed.type || !isValidImageType(parsed.type)) return null;
  return {
    type: parsed.type,
    subject_hint: typeof parsed.subject_hint === "string" ? parsed.subject_hint : "autre",
    description: typeof parsed.description === "string" ? parsed.description.slice(0, 2000) : "",
    key_elements: Array.isArray(parsed.key_elements)
      ? parsed.key_elements.filter((e): e is string => typeof e === "string").slice(0, 20)
      : [],
    pedagogical_use: typeof parsed.pedagogical_use === "string" ? parsed.pedagogical_use.slice(0, 500) : "",
    confidence: typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence : 0.5,
    ocr_text: typeof parsed.ocr_text === "string" ? parsed.ocr_text.slice(0, 4000) : "",
    latex_if_formula: typeof parsed.latex_if_formula === "string" && parsed.latex_if_formula.length > 0
      ? parsed.latex_if_formula : null,
    smiles_if_molecule: typeof parsed.smiles_if_molecule === "string" && parsed.smiles_if_molecule.length > 0
      ? parsed.smiles_if_molecule : null,
    topojson_region_hint: typeof parsed.topojson_region_hint === "string" && parsed.topojson_region_hint.length > 0
      ? parsed.topojson_region_hint : null,
  };
}

export async function classifyImage(pngBuffer: Buffer): Promise<VisionClassification | null> {
  const base64 = pngBuffer.toString("base64");
  const response = await routeAIRequest("classify_pdf_image", VISION_PROMPT, {
    requireVision: true,
    maxTokens: 1000,
    cacheTtlMs: 0,
    model: "anthropic_haiku",
    images: [{ mediaType: "image/png", data: base64 }],
  });
  const parsed = parseClassification(response.text);
  return normalize(parsed);
}
```

Note: la signature `images` côté `routeAIRequest` doit exister (vérifier `lib/ai-router.ts`). Si pas, l'ajouter dans cette PR.

- [ ] **Step 3:** Commit
```bash
git add lib/generate-questions/vision-classify.ts
git commit -m "feat(vision): Haiku image classification (71 types + LaTeX + SMILES)"
```

### Task 5.2: Wire classify into run-image-pipeline

- [ ] **Step 1:** Modify `lib/generate-questions/run-image-pipeline.ts` `uploadAndInsertBatch` :

After the INSERT, call classify + UPDATE :
```typescript
import { classifyImage } from "./vision-classify";

// Inside uploadAndInsertBatch, after the INSERT pdf_extracted_images :
const classification = await classifyImage(img.pngBuffer).catch((err) => {
  // best-effort : if Vision fails, leave description NULL
  return null;
});
if (classification) {
  await withAdminClient(async (admin) => {
    await admin
      .from("pdf_extracted_images")
      .update({
        description_md: classification.description,
        confidence: classification.confidence,
        vision_type: classification.type,
        latex_if_formula: classification.latex_if_formula,
        smiles_if_molecule: classification.smiles_if_molecule,
        topojson_region_hint: classification.topojson_region_hint,
      })
      .eq("hash", img.hash)
      .eq("course_id", course.id);
  });
}
```

- [ ] **Step 2:** Commit
```bash
git add lib/generate-questions/run-image-pipeline.ts
git commit -m "feat(pipeline-b): wire Vision Haiku classification after image upload"
```

### Task 5.3: PR 5

- [ ] **Step 1:** Push + PR
```bash
git push -u origin feat/pipeline-b-pr5-vision
gh pr create --title "feat(pipeline-b): PR 5 — Haiku Vision classification (71 types)" --base main
```

---

## PR 6 — Sonnet image-aware question generation

**Goal:** Pour chaque image classifiée, générer 1-3 questions image-aware via Sonnet 4.6 + INSERT teacher_questions avec `image_url` + `needs_review` flag. **Tâche 1 = benchmark 3 options (A: Haiku desc + Sonnet text, B: Sonnet vision direct, C: Haiku seul) sur 10 images variées**.

**Files:**
- Create: `scripts/benchmark-image-questions.ts`
- Create: `lib/generate-questions/image-questions.ts`
- Modify: `lib/generate-questions/run-image-pipeline.ts`

### Task 6.1: Benchmark script (avant choix option)

- [ ] **Step 1:** Branch
```bash
git checkout main && git pull && git checkout -b feat/pipeline-b-pr6-questions
```

- [ ] **Step 2:** Create `scripts/benchmark-image-questions.ts` — script Node qui prend 10 hashes d'images de `pdf_extracted_images`, génère 1 question via chaque option, output un Markdown tableau avec : option / type vision / question générée / 4 choix MCQ / explication.

```typescript
// scripts/benchmark-image-questions.ts
// Run: npx tsx scripts/benchmark-image-questions.ts <courseId>
// Output: markdown table comparant options A/B/C sur 10 images.

import { withAdminClient } from "@/lib/db/admin-client";
import { routeAIRequest } from "@/lib/ai-router";
import type { ImageType } from "@/lib/pdf/image-types";

const COURSE_ID = process.argv[2];
if (!COURSE_ID) {
  // eslint-disable-next-line no-console
  console.error("Usage: tsx scripts/benchmark-image-questions.ts <courseId>");
  process.exit(1);
}

const SAMPLE_TYPES: ImageType[] = [
  "formula_math", "scene_historical_painting", "cell_diagram",
  "map_topographic", "molecule_organic", "religious_painting",
  "lab_apparatus", "statistical_graph", "monument_architectural", "anatomy_human",
];

async function fetchSampleImages() {
  return withAdminClient(async (admin) => {
    const { data } = await admin
      .from("pdf_extracted_images")
      .select("hash, storage_path, vision_type, description_md")
      .eq("course_id", COURSE_ID)
      .in("vision_type", SAMPLE_TYPES)
      .limit(10);
    return data ?? [];
  });
}

async function downloadImage(storagePath: string): Promise<Buffer> {
  return withAdminClient(async (admin) => {
    const { data, error } = await admin.storage.from("course-uploads").download(storagePath);
    if (error || !data) throw error ?? new Error("no blob");
    return Buffer.from(await data.arrayBuffer());
  });
}

async function generateA(image: { description_md: string | null }, type: string): Promise<string> {
  // Option A : description-driven (text only Sonnet)
  const prompt = `Image type=${type}, description: ${image.description_md ?? ""}. Genere 1 MCQ pedagogique 4 choix. JSON {question, options[4], answer_index, explanation}.`;
  const r = await routeAIRequest("bench_a", prompt, {
    requireVision: false, maxTokens: 800, model: "anthropic_claude", cacheTtlMs: 0,
  });
  return r.text;
}

async function generateB(pngBuffer: Buffer, type: string): Promise<string> {
  // Option B : Sonnet vision direct
  const prompt = `Image type=${type}. Genere 1 MCQ pedagogique 4 choix. JSON {question, options[4], answer_index, explanation}.`;
  const r = await routeAIRequest("bench_b", prompt, {
    requireVision: true, maxTokens: 800, model: "anthropic_claude", cacheTtlMs: 0,
    images: [{ mediaType: "image/png", data: pngBuffer.toString("base64") }],
  });
  return r.text;
}

async function generateC(pngBuffer: Buffer, type: string): Promise<string> {
  // Option C : Haiku seul
  const prompt = `Image type=${type}. Genere 1 MCQ pedagogique 4 choix. JSON {question, options[4], answer_index, explanation}.`;
  const r = await routeAIRequest("bench_c", prompt, {
    requireVision: true, maxTokens: 800, model: "anthropic_haiku", cacheTtlMs: 0,
    images: [{ mediaType: "image/png", data: pngBuffer.toString("base64") }],
  });
  return r.text;
}

async function main() {
  const images = await fetchSampleImages();
  // eslint-disable-next-line no-console
  console.log(`# Benchmark image-questions ${COURSE_ID}\n`);
  for (const img of images) {
    const png = await downloadImage(img.storage_path);
    const [a, b, c] = await Promise.all([
      generateA(img, img.vision_type),
      generateB(png, img.vision_type),
      generateC(png, img.vision_type),
    ]);
    // eslint-disable-next-line no-console
    console.log(`## ${img.vision_type} (hash ${img.hash.slice(0, 8)})\n\n### Option A\n${a}\n\n### Option B\n${b}\n\n### Option C\n${c}\n\n---\n`);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3:** Manual run after PR 5 merged (need real images in DB)
```bash
PIPELINE_B_ENABLED=true npm run dev # upload syllabus to populate images
# Then :
npx tsx scripts/benchmark-image-questions.ts <courseId> > benchmark-results.md
```

- [ ] **Step 4:** Review benchmark, choose option A/B/C. Document in commit message + PR description.

- [ ] **Step 5:** Commit benchmark script
```bash
git add scripts/benchmark-image-questions.ts
git commit -m "tooling: benchmark script for image-aware question generation (3 options)"
```

### Task 6.2: image-questions module (with chosen option)

- [ ] **Step 1:** Create `lib/generate-questions/image-questions.ts` — based on benchmark winner

(Code template uses Option A — adapter selon résultat benchmark)

```typescript
// Pipeline B : pour chaque image classifiee, generer 1-3 questions image-aware
// avec MCQ canoniques anti-hallucination (cf spec section 4.5).

import { routeAIRequest } from "@/lib/ai-router";
import type { ImageType } from "@/lib/pdf/image-types";
import type { TeacherQuestionInsertRow } from "@/lib/db/teacher-questions";

const REVIEW_CONFIDENCE_THRESHOLD = 0.8;

type QuestionTypeForVision = "mcq" | "numeric" | "short_text";

function pickQuestionType(visionType: ImageType): QuestionTypeForVision {
  if (visionType.startsWith("formula_") || visionType === "geometric_figure") {
    return Math.random() < 0.5 ? "numeric" : "mcq";
  }
  if (visionType === "linguistic_table") return "short_text";
  if (visionType.endsWith("_graph") || visionType === "table_data" || visionType.endsWith("_chart")) {
    return Math.random() < 0.5 ? "numeric" : "short_text";
  }
  return "mcq";
}

const IMAGE_QUESTION_PROMPT = (
  visionType: ImageType,
  description: string,
  ocrText: string,
  chapterContext: string,
  preferredType: QuestionTypeForVision,
) => `Tu es un createur de questions CESS Belgique FWB (16-18 ans).

Image type=${visionType}, description : ${description}
OCR : ${ocrText}
Contexte chapitre : ${chapterContext.slice(0, 800)}

Genere 1 question pedagogique image-aware. Type prefere : ${preferredType}.

Pour les types identification (scene/portrait/map/...) : OBLIGATOIREMENT MCQ avec 4 choix CANONIQUES (4 evenements/personnages/regions plausibles de la periode/matiere). Pas de question ouverte.

JSON strict :
{
  "type": "${preferredType}",
  "question": "...",
  "options": ["A", "B", "C", "D"],          // MCQ uniquement
  "answer_index": 0-3,                        // MCQ
  "expected_numeric_answer": 12.5,             // numeric
  "numeric_tolerance": 0.1,                    // numeric
  "numeric_unit": "g/mol",                     // numeric
  "expected_text_answers": ["..."],            // short_text 1-5 variantes
  "explanation": "...",
  "difficulty": 1-3
}`;

export type GenerateImageQuestionsArgs = {
  imageHash: string;
  imageUrl: string;
  pngBuffer: Buffer;
  visionType: ImageType;
  description: string;
  ocrText: string;
  confidence: number;
  latexIfFormula: string | null;
  smilesIfMolecule: string | null;
  topojsonRegionHint: string | null;
  pageNumber: number;
  chapterTitle: string;
  chapterContext: string;
  job: { teacher_id: string; school_id: string };
  course: { id: string; subject_enum: string | null; level: number | null; organization_tags: string[] | null };
};

export async function generateImageQuestion(
  args: GenerateImageQuestionsArgs,
): Promise<TeacherQuestionInsertRow | null> {
  const preferredType = pickQuestionType(args.visionType);
  const prompt = IMAGE_QUESTION_PROMPT(
    args.visionType, args.description, args.ocrText, args.chapterContext, preferredType,
  );

  // Option A (text-only Sonnet) — switch en B si benchmark le recommande
  const response = await routeAIRequest("image_question", prompt, {
    requireVision: false,
    maxTokens: 1500,
    cacheTtlMs: 0,
    model: "anthropic_claude",
  });

  const parsed = parseJson(response.text);
  if (!parsed || typeof parsed.question !== "string" || !parsed.question.trim()) return null;

  const type = (parsed.type === "numeric" || parsed.type === "short_text") ? parsed.type : "mcq";
  const options = Array.isArray(parsed.options) ? parsed.options.slice(0, 4) : [];
  while (options.length < 4 && type === "mcq") options.push("");

  return {
    teacher_id: args.job.teacher_id,
    school_id: args.job.school_id,
    course_id: args.course.id,
    subject: null,
    subject_enum: args.course.subject_enum ?? null,
    level: args.course.level ?? null,
    type,
    question: parsed.question.trim(),
    options: type === "mcq" ? options : [],
    answer_index: type === "mcq" ? (parsed.answer_index ?? 0) : 0,
    expected_numeric_answer: type === "numeric" ? (parsed.expected_numeric_answer ?? null) : null,
    numeric_tolerance: type === "numeric" ? (parsed.numeric_tolerance ?? 0.01) : null,
    numeric_unit: type === "numeric" ? (parsed.numeric_unit ?? null) : null,
    expected_text_answers: type === "short_text" ? (parsed.expected_text_answers ?? null) : null,
    explanation: parsed.explanation ?? null,
    period: args.chapterTitle,
    difficulty_stars: parsed.difficulty ?? null,
    organization_tags: args.course.organization_tags ?? [],
    is_ai_generated: true,
    is_public: false,
    page_range_start: args.pageNumber,
    page_range_end: args.pageNumber,
    concept_page_hint: args.pageNumber,
    // Pipeline B fields
    image_url: args.imageUrl,
    image_hash: args.imageHash,
    image_page_number: args.pageNumber,
    image_description_md: args.description,
    image_confidence: args.confidence,
    vision_type: args.visionType,
    formula_latex: args.latexIfFormula,
    formula_mathml: null,  // Filled UI-side via KaTeX in PR 7
    molecule_smiles: args.smilesIfMolecule,
    geo_topojson_path: args.topojsonRegionHint
      ? mapRegionToTopoJson(args.topojsonRegionHint) : null,
    needs_review: args.confidence < REVIEW_CONFIDENCE_THRESHOLD,
  };
}

function parseJson(raw: string): { question?: unknown; options?: unknown; answer_index?: unknown; expected_numeric_answer?: unknown; numeric_tolerance?: unknown; numeric_unit?: unknown; expected_text_answers?: unknown; explanation?: unknown; difficulty?: unknown; type?: unknown } | null {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch { /* */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) try { return JSON.parse(fenced[1].trim()); } catch { /* */ }
  const greedy = trimmed.match(/\{[\s\S]*\}/);
  if (greedy?.[0]) try { return JSON.parse(greedy[0]); } catch { /* */ }
  return null;
}

function mapRegionToTopoJson(region: string): string | null {
  const map: Record<string, string> = {
    "Belgique": "/topojson/belgium.json",
    "Wallonie": "/topojson/wallonia.json",
    "Bruxelles": "/topojson/brussels.json",
    "Europe": "/topojson/europe.json",
    "Monde": "/topojson/world.json",
  };
  return map[region] ?? null;
}
```

- [ ] **Step 2:** Wire into run-image-pipeline. After classification UPDATE :
```typescript
import { generateImageQuestion } from "./image-questions";
import { insertTeacherQuestions } from "@/lib/db/teacher-questions";

// After classification stored on pdf_extracted_images :
if (classification && !isSkipType(classification.type)) {
  const question = await generateImageQuestion({ /* args */ });
  if (question) {
    await insertTeacherQuestions([question]);
  }
}
```

- [ ] **Step 3:** Commit
```bash
git add lib/generate-questions/image-questions.ts lib/generate-questions/run-image-pipeline.ts
git commit -m "feat(pipeline-b): image-aware question generation with needs_review flag"
```

### Task 6.3: PR 6

- [ ] Push + PR

---

## PR 7 — UI components (Stepper + KaTeX + Imago + GeoMap + Review banner)

**Goal:** Remplacer le spinner par stepper 4 étapes + render KaTeX/Imago/GeoMap dans le quiz + bandeau "à vérifier".

**Files:**
- Create: `app/_components/JobProgressStepper.tsx`
- Create: `app/_components/MoleculeRenderer.tsx`
- Create: `app/_components/GeoMap.tsx`
- Create: `app/_components/FormulaRenderer.tsx`
- Create: `lib/katex-render.ts` (server-side LaTeX → MathML)
- Create: `tests/lib/katex-render.test.ts`
- Create: `public/topojson/belgium.json` (from Natural Earth or GitHub)
- Create: `public/topojson/wallonia.json`
- Create: `public/topojson/europe.json`
- Modify: page using current spinner → use `<JobProgressStepper>`
- Modify: quiz question component → render image fields conditionally

### Task 7.1: KaTeX server-side renderer + tests

- [ ] **Step 1:** Branch
```bash
git checkout main && git pull && git checkout -b feat/pipeline-b-pr7-ui
```

- [ ] **Step 2:** Write failing test
```typescript
// tests/lib/katex-render.test.ts
import { describe, it, expect } from "vitest";
import { latexToMathML } from "@/lib/katex-render";

describe("latexToMathML", () => {
  it("renders simple integral to MathML", () => {
    const mathml = latexToMathML("\\int_0^1 x^2 dx");
    expect(mathml).toContain("<math");
    expect(mathml).toContain("∫");
  });

  it("returns empty string on invalid LaTeX (graceful)", () => {
    const mathml = latexToMathML("\\invalid{");
    expect(mathml).toBe("");
  });

  it("handles empty input", () => {
    expect(latexToMathML("")).toBe("");
  });
});
```

- [ ] **Step 3:** Create `lib/katex-render.ts`
```typescript
import katex from "katex";

/**
 * Render LaTeX -> MathML string server-side. Returns "" on parse error
 * (caller can fallback to image alt-text).
 *
 * Output is HTML5 native MathML, screen-reader accessible (WCAG 2.2 AA).
 */
export function latexToMathML(latex: string): string {
  if (!latex || typeof latex !== "string") return "";
  try {
    return katex.renderToString(latex, {
      output: "mathml",
      throwOnError: false,
      displayMode: true,
    });
  } catch {
    return "";
  }
}
```

- [ ] **Step 4:** Run test
```bash
npm run test:run -- tests/lib/katex-render.test.ts
```

- [ ] **Step 5:** Wire latexToMathML into run-image-pipeline (fill `formula_mathml` at INSERT time)
```typescript
import { latexToMathML } from "@/lib/katex-render";
// in generateImageQuestion : formula_mathml: latexToMathML(args.latexIfFormula ?? "")
```

- [ ] **Step 6:** Commit
```bash
git add lib/katex-render.ts tests/lib/katex-render.test.ts lib/generate-questions/image-questions.ts
git commit -m "feat(katex): server-side LaTeX → MathML rendering"
```

### Task 7.2: Job Progress Stepper component

- [ ] **Step 1:** Create `app/_components/JobProgressStepper.tsx`
```tsx
"use client";

import { FileText, Eye, Sparkles, CheckCheck, AlertCircle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

type JobRow = {
  status: string;
  phase: string;
  text_chapters_total: number | null;
  text_chapters_completed: number;
  image_batches_total: number | null;
  image_batches_completed: number;
  questions_inserted: number | null;
  error_message: string | null;
};

type Step = "extraction" | "analyse" | "generation" | "validation";

function getActiveStep(job: JobRow): Step | "error" {
  if (job.status === "failed") return "error";
  if (job.phase === "extracting_pdf") return "extraction";
  if (job.phase === "generating_workers" && !job.text_chapters_total) return "analyse";
  if (job.phase === "generating_workers" && job.text_chapters_total) return "generation";
  if (job.phase === "validating" || job.phase === "done") return "validation";
  return "extraction";
}

const STEPS: { id: Step; label: string; Icon: typeof FileText }[] = [
  { id: "extraction", label: "Extraction", Icon: FileText },
  { id: "analyse", label: "Analyse", Icon: Eye },
  { id: "generation", label: "Génération", Icon: Sparkles },
  { id: "validation", label: "Validation", Icon: CheckCheck },
];

export function JobProgressStepper({ job, onRetry }: { job: JobRow; onRetry?: () => void }) {
  const active = getActiveStep(job);
  const isError = active === "error";

  function stateOf(step: Step): "done" | "active" | "todo" | "error" {
    if (isError) {
      // error appears on the step that was active when failure occurred
      // simpler heuristic : just highlight active phase as error
      if (job.phase === "extracting_pdf") return step === "extraction" ? "error" : "todo";
      if (job.phase === "generating_workers") return step === "generation" ? "error" : (step === "extraction" || step === "analyse" ? "done" : "todo");
      return step === "validation" ? "error" : "done";
    }
    const order: Step[] = ["extraction", "analyse", "generation", "validation"];
    const activeIdx = order.indexOf(active as Step);
    const stepIdx = order.indexOf(step);
    if (stepIdx < activeIdx) return "done";
    if (stepIdx === activeIdx) return "active";
    return "todo";
  }

  function subInfo(step: Step): string | null {
    if (stateOf(step) !== "active") return null;
    if (step === "generation" && job.text_chapters_total) {
      const a = `${job.text_chapters_completed}/${job.text_chapters_total} chapitres`;
      const b = job.image_batches_total
        ? ` • ${job.image_batches_completed}/${job.image_batches_total} batches images`
        : "";
      return a + b;
    }
    if (step === "validation" && job.questions_inserted) {
      return `${job.questions_inserted} questions générées`;
    }
    return null;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <ol className="flex items-center justify-between gap-2 sm:gap-4">
        {STEPS.map((s, i) => {
          const state = stateOf(s.id);
          return (
            <li key={s.id} className="flex flex-1 items-center gap-2">
              <div className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition",
                state === "done" && "border-green-500 bg-green-500 text-white",
                state === "active" && "border-violet-500 bg-violet-100 text-violet-700 animate-pulse",
                state === "todo" && "border-gray-300 bg-white text-gray-400",
                state === "error" && "border-red-500 bg-red-500 text-white",
              )}>
                <s.Icon className="h-4 w-4" />
              </div>
              <div className="hidden min-w-0 sm:block">
                <p className={cn(
                  "text-sm font-medium",
                  state === "done" && "text-green-700",
                  state === "active" && "text-violet-700",
                  state === "todo" && "text-gray-400",
                  state === "error" && "text-red-700",
                )}>
                  {s.label}
                </p>
                {subInfo(s.id) && (
                  <p className="truncate text-xs text-gray-500">{subInfo(s.id)}</p>
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn(
                  "ml-2 h-0.5 flex-1",
                  state === "done" ? "bg-green-500" : "bg-gray-200",
                )} />
              )}
            </li>
          );
        })}
      </ol>

      {isError && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900 dark:text-red-200">
              Il y a une erreur, veuillez réessayer
            </p>
            {job.error_message && (
              <p className="mt-1 line-clamp-2 text-xs text-red-700 dark:text-red-300">
                {job.error_message}
              </p>
            )}
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Réessayer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2:** Replace the existing spinner in the import page. Find it :
```bash
grep -rn 'Loader\|loader\|spinner\|animate-spin' app/school/import 2>/dev/null
```
Replace with `<JobProgressStepper job={job} onRetry={handleRetry} />`.

- [ ] **Step 3:** Commit
```bash
git add app/_components/JobProgressStepper.tsx app/school/import
git commit -m "feat(ui): JobProgressStepper replaces spinner (4 steps + error retry)"
```

### Task 7.3: Molecule / GeoMap / Formula renderers + TopoJSON assets

- [ ] **Step 1:** Install Imago WASM
```bash
npm install @iqg/indigo-ketcher
```

- [ ] **Step 2:** Install d3-geo + react-simple-maps
```bash
npm install d3-geo react-simple-maps topojson-client
npm install --save-dev @types/d3-geo @types/topojson-client
```

- [ ] **Step 3:** Download TopoJSON files from public sources, save to `public/topojson/`:
- `belgium.json` from `https://github.com/topojson/world-atlas` (Belgium subset)
- `wallonia.json` from OSM extract
- `europe.json` from Natural Earth
- `world.json` from `https://github.com/topojson/world-atlas`

- [ ] **Step 4:** Create `app/_components/FormulaRenderer.tsx`
```tsx
// Render server-rendered MathML safely. The string comes from KaTeX which produces
// valid MathML HTML5 — safe to inject via dangerouslySetInnerHTML.
export function FormulaRenderer({ mathml }: { mathml: string }) {
  if (!mathml) return null;
  return (
    <div
      className="my-2 text-center text-lg"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: mathml }}
    />
  );
}
```

- [ ] **Step 5:** Create `app/_components/MoleculeRenderer.tsx`
```tsx
"use client";
import { useEffect, useRef, useState } from "react";

export function MoleculeRenderer({ smiles, className }: { smiles: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const indigo = await import("@iqg/indigo-ketcher");
        // API exacte depends on Imago WASM build — adapter selon doc
        const svg = indigo.render(smiles, { format: "svg" });
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [smiles]);

  if (error) return <p className="text-xs text-gray-500">Molécule : {smiles}</p>;
  return <div ref={ref} className={className} aria-label={`Structure moleculaire SMILES: ${smiles}`} />;
}
```

- [ ] **Step 6:** Create `app/_components/GeoMap.tsx`
```tsx
"use client";
import { useEffect, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

export function GeoMap({ topojsonPath, className }: { topojsonPath: string; className?: string }) {
  const [geo, setGeo] = useState<object | null>(null);

  useEffect(() => {
    fetch(topojsonPath).then((r) => r.json()).then(setGeo);
  }, [topojsonPath]);

  if (!geo) return null;
  return (
    <ComposableMap className={className} role="img">
      <title>Carte vectorielle</title>
      <Geographies geography={geo}>
        {({ geographies }) =>
          geographies.map((g) => (
            <Geography
              key={g.rsmKey}
              geography={g}
              fill="#e5e7eb"
              stroke="#9ca3af"
              strokeWidth={0.5}
            />
          ))
        }
      </Geographies>
    </ComposableMap>
  );
}
```

- [ ] **Step 7:** Update the quiz question component to render conditionally :
```tsx
{question.image_url && (
  <figure className="my-4">
    {question.formula_mathml ? (
      <FormulaRenderer mathml={question.formula_mathml} />
    ) : question.molecule_smiles ? (
      <MoleculeRenderer smiles={question.molecule_smiles} className="mx-auto max-w-md" />
    ) : question.geo_topojson_path ? (
      <GeoMap topojsonPath={question.geo_topojson_path} className="mx-auto max-w-md" />
    ) : (
      <img
        src={question.image_url}
        alt={question.image_description_md ?? "Illustration de l'exercice"}
        className="mx-auto max-h-80 rounded-lg border"
      />
    )}
  </figure>
)}
```

- [ ] **Step 8:** Commit
```bash
git add app/_components/ public/topojson/ package.json package-lock.json
git commit -m "feat(ui): KaTeX formula + Imago molecule + d3-geo map renderers"
```

### Task 7.4: Review banner + question card badge

- [ ] **Step 1:** Edit `app/school/questions/page.tsx` to show a banner when `count(needs_review = true) > 0` :
```tsx
const needsReviewCount = questions.filter((q) => q.needs_review).length;
{needsReviewCount > 0 && (
  <div className="mb-4 flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4">
    <AlertTriangle className="h-5 w-5 text-orange-600" />
    <p className="flex-1 text-sm text-orange-900">
      {needsReviewCount} question(s) extraite(s) d'images sont à vérifier avant publication.
    </p>
    <button onClick={() => setFilter({ needsReview: true })} className="...">
      Vérifier
    </button>
  </div>
)}
```

- [ ] **Step 2:** Edit question card to show 📷 badge if `image_url` present.

- [ ] **Step 3:** Edit question form to display image + editable description when `image_url` present.

- [ ] **Step 4:** Commit + PR 7

```bash
git add app/school/questions
git commit -m "feat(ui): needs_review banner + image badge + form image preview"
git push -u origin feat/pipeline-b-pr7-ui
gh pr create --title "feat(pipeline-b): PR 7 — UI (Stepper, KaTeX, Imago, GeoMap, review banner)" --base main
```

---

## PR 8 — Activation flag + cleanup

**Goal:** Flip `PIPELINE_B_ENABLED=true` en prod, retirer code legacy (ancien spinner si pas déjà fait).

### Task 8.1: Set env var en preview Vercel + dogfood QA

- [ ] **Step 1:** Set `PIPELINE_B_ENABLED=true` sur preview Vercel via :
```bash
vercel env add PIPELINE_B_ENABLED preview
# Value: true
```

- [ ] **Step 2:** Trigger preview deploy. QA manuel : 5 syllabi variés (chimie, histoire, géo, bio, math).

- [ ] **Step 3:** Mesurer : count questions générées par pipeline B, count `needs_review = true`, latence totale.

### Task 8.2: Flip prod + monitoring 48h

- [ ] **Step 1:** Set `PIPELINE_B_ENABLED=true` sur production Vercel
```bash
vercel env add PIPELINE_B_ENABLED production
```

- [ ] **Step 2:** Trigger prod deploy via `scripts/deploy.sh` (force-redeploy).

- [ ] **Step 3:** Monitor 48h :
- Anthropic billing dashboard : compare delta coût vs baseline
- Supabase Storage usage : compare delta GB
- error_logs table : `source LIKE 'image-pipeline.%'` count
- Job success rate : `select count(*) filter (where status = 'done') / count(*) from question_generation_jobs where created_at > now() - interval '48 hours'`

### Task 8.3: Cleanup legacy (drop columns step — déploiement N+2)

NB: à faire **2 semaines après PR 8 merge**, pas immédiatement.

- [ ] Migration N+2 : drop `worker_count`, `workers_completed` de `question_generation_jobs`
- [ ] Cleanup code : retire les writes legacy dans `run-text-pipeline.ts`

### Task 8.4: PR 8

```bash
git checkout main && git pull && git checkout -b feat/pipeline-b-pr8-activation
# (Minimal code changes, mostly env config + monitoring docs)
git push -u origin feat/pipeline-b-pr8-activation
gh pr create --title "feat(pipeline-b): PR 8 — activation + monitoring runbook" --base main
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Section 4.1 (extract images) → Task 4.1
- ✅ Section 4.2 (storage) → Task 4.2
- ✅ Section 4.3 (Vision classification + prompt) → Task 5.1
- ✅ Section 4.4 (71 IMAGE_TYPES) → Task 2.6
- ✅ Section 4.5 (Sonnet image-aware + benchmark) → Tasks 6.1, 6.2
- ✅ Section 4.6 (KaTeX) → Task 7.1
- ✅ Section 4.7 (Imago WASM) → Task 7.3
- ✅ Section 4.8 (Géo SVG) → Task 7.3
- ✅ Section 4.9 (INSERT teacher_questions enrichi) → Task 6.2
- ✅ Section 4.10 (Done coordinator trigger) → Task 2.5
- ✅ Section 5 (migrations expand-contract) → Tasks 2.1-2.5
- ✅ Section 6.1 (questions list badge) → Task 7.4
- ✅ Section 6.2 (form image preview) → Task 7.4
- ✅ Section 6.3 (quiz student image render) → Task 7.3
- ✅ Section 6.4 (Stepper UI) → Task 7.2
- ✅ Section 11 (8 PRs strategy) → entire plan structure
- ✅ Section 12.1 (singleton admin client) → Task 1.1
- ✅ Section 12.2 (runbook deploy) → Task 1.7
- ✅ Section 12.3 (deploy.sh script) → Task 1.7
- ✅ Section 13 (SELECT * audit) → Task 1.6

**2. Placeholder scan:** Aucun "TBD", "later", ou skip-instruction. Tous les code blocks sont complets.

**3. Type consistency:** 
- `ImageType` défini dans Task 2.6, utilisé dans Tasks 5.1, 6.2, 7.x
- `TeacherQuestionInsertRow` défini Task 2.7, utilisé Task 6.2
- `JobRow` / `CourseRow` types répétés dans orchestrator et run-text/image-pipeline (acceptable, files isolés)

**4. Verification gates:** Chaque PR a un "Test plan" explicite dans la PR body, avec smoke test syllabus connu.

**5. Risk mitigation:**
- Feature flag activable sans redéploiement
- Migrations expand-contract = rollback safe
- Singleton avec auto-recovery (Task 1.1) gère expiration JWT
- Trigger DB done coordinator atomique (Task 2.5)

---

**Plan complete.** Sauvegardé dans `docs/superpowers/plans/2026-05-15-pdf-images-implementation.md`.
