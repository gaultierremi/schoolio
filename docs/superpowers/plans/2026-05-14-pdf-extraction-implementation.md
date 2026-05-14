# PDF Extraction Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire un pipeline d'extraction PDF qui produit snippets de théorie + questions variées via Haiku TOC + Sonnet chapter-by-chapter, INSERT incrémental pour partial success, budget ~6min sur PDF 200p.

**Architecture:** Pipeline structure-first en 2 phases dans une Trigger.dev task : (1) extraction TOC via Haiku 4.5, (2) pool de 3 workers Sonnet 4.6 traitent chacun un chapitre et produisent JSON `{ snippets[], questions[] }` qui s'insèrent immédiatement en DB. Plus de batch final = partial success préservé en cas de timeout.

**Tech Stack:** TypeScript, Next.js, Supabase Postgres + RLS, Trigger.dev v3 cloud, Anthropic Claude (Haiku 4.5 + Sonnet 4.6) via PDF Vision, ai-router avec model override.

**Spec source:** [docs/superpowers/specs/2026-05-14-pdf-extraction-design.md](../specs/2026-05-14-pdf-extraction-design.md)

**Validation strategy:** Pas de TDD automated (dépendance Anthropic API + PDF Vision = pas testable en CI). Validation par :
1. Type-check après chaque tâche : `npx tsc --noEmit`
2. Smoke test après deploy : trigger un vrai run sur PDF chimie test, observer DB + Trigger.dev dashboard
3. Critères succès finaux dans le spec section "Critères de succès"

---

## File Structure

**Création** :
- `supabase/migrations/20260514290000_content_snippets_syllabus_extraction.sql` — migration source_kind + nullable concept_id
- `lib/generate-questions/extract-content.ts` — nouveau runner remplaçant l'ancien (1 fichier, ~400 lignes)
- `lib/ai-providers/anthropic-haiku.ts` — nouveau provider Haiku 4.5

**Modification** :
- `lib/ai-router.ts:18-38` — ajouter `model?: string` override dans RouteOptions
- `lib/generate-questions/extract-chapters.ts` — switch vers Haiku via model override
- `app/api/courses/generate-questions/route.ts` — point d'entrée inchangé (placeholder worker_count=1 conservé)
- `trigger/generate-questions.ts` — appelle nouveau extract-content au lieu de runner
- `app/school/import/_components/GenerationProgress.tsx:51-70` — label inclure snippets count

**Suppression** :
- `lib/generate-questions/runner.ts` — remplacé par `extract-content.ts` (delete pour éviter dead code)

**Inchangé** :
- `lib/pdf/extract-pages.ts` — utilisé tel quel
- `lib/observability/log-error.ts` — utilisé tel quel
- `lib/activity/log.ts` — utilisé tel quel
- `supabase/migrations/20260514250000_question_generation_jobs.sql` — table jobs réutilisée tel quel

---

## Task 1: Migration content_snippets pour syllabus_extraction

**Files:**
- Create: `supabase/migrations/20260514290000_content_snippets_syllabus_extraction.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Side Sprint Prof B — Extend content_snippets for syllabus extraction pipeline
--
-- Why : nouveau pipeline d'extraction PDF (cf docs/superpowers/specs/
-- 2026-05-14-pdf-extraction-design.md) produit des snippets de théorie
-- ET des questions en 1 appel Anthropic Sonnet par chapitre. Pour stocker
-- ces snippets sans avoir à créer des `concepts` riches au préalable,
-- on étend la CHECK source_kind avec 'syllabus_extraction' et on rend
-- concept_id nullable (les snippets syllabus_extraction sont attachés
-- à un course + chapter title, pas à un concept formel).

BEGIN;

-- 1) Drop puis recreate la CHECK constraint source_kind avec la nouvelle valeur
ALTER TABLE public.content_snippets DROP CONSTRAINT IF EXISTS content_snippets_source_kind_check;
ALTER TABLE public.content_snippets ADD CONSTRAINT content_snippets_source_kind_check
  CHECK (source_kind IN ('concept_definition', 'theory_block', 'manual_teacher', 'syllabus_extraction'));

-- 2) Rendre concept_id nullable (pour syllabus_extraction qui n'a pas de concept formel)
ALTER TABLE public.content_snippets ALTER COLUMN concept_id DROP NOT NULL;

-- 3) Ajouter une colonne course_id pour le scoping des snippets syllabus_extraction
-- (les autres source_kind sont liés via concept_id → curriculum_program → course implicite)
ALTER TABLE public.content_snippets ADD COLUMN IF NOT EXISTS course_id UUID
  REFERENCES public.courses(id) ON DELETE CASCADE;

-- 4) Index pour les queries du tuteur "donne-moi les snippets de ce cours" 
CREATE INDEX IF NOT EXISTS idx_content_snippets_course
  ON public.content_snippets(course_id) WHERE course_id IS NOT NULL;

-- 5) Contrainte cohérence : syllabus_extraction DOIT avoir course_id, les autres NON
ALTER TABLE public.content_snippets ADD CONSTRAINT content_snippets_source_kind_scope
  CHECK (
    (source_kind = 'syllabus_extraction' AND course_id IS NOT NULL AND concept_id IS NULL)
    OR
    (source_kind != 'syllabus_extraction' AND concept_id IS NOT NULL)
  );

-- 6) Index dedup pour syllabus_extraction : pas de doublon course + chapter + text hash partiel
-- (text peut être 4000 chars, on hash avec md5 pour index OK)
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_snippets_syllabus_extraction
  ON public.content_snippets(course_id, md5(text))
  WHERE source_kind = 'syllabus_extraction';

COMMIT;
```

- [ ] **Step 2: Apply migration locally (or via Supabase MCP/CLI)**

Lance la migration sur le projet Supabase de prod (Alex utilisera Supabase Studio ou CLI).

- [ ] **Step 3: Verify schema**

Query sanity check via service_role :
```sql
SELECT column_name, is_nullable, data_type 
FROM information_schema.columns 
WHERE table_name = 'content_snippets' 
ORDER BY ordinal_position;
```
Attendu : `concept_id` nullable=YES, `course_id` présent.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260514290000_content_snippets_syllabus_extraction.sql
git commit -m "feat(schema): extend content_snippets for syllabus_extraction source_kind

Ajoute 'syllabus_extraction' à la CHECK source_kind, rend concept_id nullable, ajoute course_id FK. Permet au nouveau pipeline d'extraction PDF (cf docs/superpowers/specs/2026-05-14-pdf-extraction-design.md) d'insérer des snippets de théorie sans concept formel préalable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Ajouter model override dans RouteOptions

**Files:**
- Modify: `lib/ai-router.ts:18-38`

- [ ] **Step 1: Lire la définition RouteOptions actuelle**

Ouvrir `lib/ai-router.ts` lignes 18-38. Vérifier que `RouteOptions` existe et contient les champs : `systemPrompt`, `pdfBase64`, `mimeType`, `responseSchema`, `maxTokens`, `temperature`, `jsonMode`, `requireVision`, `requireEuCompliant`, `cacheTtlMs`.

- [ ] **Step 2: Ajouter le champ `model` à RouteOptions**

```typescript
export interface RouteOptions {
  systemPrompt?: string;
  pdfBase64?: string;
  mimeType?: string;
  responseSchema?: unknown;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  requireVision?: boolean;
  requireEuCompliant?: boolean;
  /** Cache TTL in ms. Default 24h. Set to 0 to disable cache. Vision tasks are never cached. */
  cacheTtlMs?: number;
  /** Force a specific provider by its id. Bypass automatic selection. */
  model?: string;
}
```

- [ ] **Step 3: Implémenter le filter dans routeAIRequest**

Localiser la boucle qui parcourt `ALL_PROVIDERS` dans `routeAIRequest`. Avant le filtre `requireVision/euCompliant`, ajouter un filtre par `model` si défini :

```typescript
async function routeAIRequest(...) {
  // ... existant
  
  const candidateProviders = ALL_PROVIDERS.filter((p) => {
    if (options.model && p.id !== options.model) return false;
    if (options.requireVision && !p.supportsVision) return false;
    if (options.requireEuCompliant && !p.euCompliant) return false;
    return true;
  });

  if (candidateProviders.length === 0) {
    throw new GracefulAIError(
      options.model 
        ? `Provider '${options.model}' indisponible ou ne match pas les critères`
        : "Aucun provider compatible",
      taskType,
      []
    );
  }

  // ... le reste de la boucle utilise candidateProviders au lieu de ALL_PROVIDERS
}
```

(Note : si la struct du code diffère, adapter en gardant le sens : `model` filtre les candidats.)

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```
Expected : 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/ai-router.ts
git commit -m "feat(ai-router): add model override in RouteOptions

Permet de forcer un provider spécifique (ex: 'anthropic_haiku' pour la TOC extraction qui demande de la vitesse, pas de la qualité fine). Backward-compatible : option absente = sélection auto comme avant.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Provider Anthropic Haiku 4.5

**Files:**
- Create: `lib/ai-providers/anthropic-haiku.ts`
- Modify: `lib/ai-router.ts` (ajouter au registry ALL_PROVIDERS)

- [ ] **Step 1: Lire le provider Sonnet existant pour cloner le pattern**

```bash
cat lib/ai-providers/anthropic.ts
```
Repérer la structure : export `AnthropicClaudeProvider`, modèle hardcodé, supportsVision=true, euCompliant=false.

- [ ] **Step 2: Créer le provider Haiku**

```typescript
// lib/ai-providers/anthropic-haiku.ts
//
// Anthropic Claude Haiku 4.5 provider — modèle rapide + low-cost.
// Utilisé pour les tâches simples (extraction TOC d'un PDF) où la qualité
// Sonnet est overkill. ~3-5x plus rapide que Sonnet, ~10x moins cher.

import type { AIProvider, AIRequest, AIResponse } from "./types";

function makeAnthropicHaikuProvider(modelName: string, id: string): AIProvider {
  return {
    id,
    supportsVision: true,
    euCompliant: false,
    async generateText(req: AIRequest): Promise<AIResponse> {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY not configured");
      }
      const t0 = Date.now();

      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic();

      const userContent: Array<Record<string, unknown>> = [];
      if (req.pdfBase64) {
        userContent.push({
          type: "document",
          source: {
            type: "base64",
            media_type: req.mimeType ?? "application/pdf",
            data: req.pdfBase64,
          },
        });
      }

      let finalPrompt = req.prompt;
      if (req.responseSchema || req.jsonMode) {
        finalPrompt = `${req.prompt}\n\nRESPOND WITH VALID JSON ONLY. No prose, no markdown fences, just the JSON object.`;
      }
      userContent.push({ type: "text", text: finalPrompt });

      const stream = client.messages.stream({
        model: modelName,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0.7,
        ...(req.systemPrompt ? { system: req.systemPrompt } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: [{ role: "user", content: userContent as any }],
      });
      const completion = await stream.finalMessage();

      const firstBlock = completion.content[0];
      const text = firstBlock && firstBlock.type === "text" ? firstBlock.text : "";

      return {
        text,
        provider: id,
        latencyMs: Date.now() - t0,
        tokensUsed:
          (completion.usage?.input_tokens ?? 0) +
          (completion.usage?.output_tokens ?? 0),
      };
    },
  };
}

export const AnthropicHaikuProvider = (): AIProvider =>
  makeAnthropicHaikuProvider("claude-haiku-4-5-20251001", "anthropic_haiku");
```

- [ ] **Step 3: Enregistrer le provider dans le router**

Dans `lib/ai-router.ts`, importer + ajouter à `ALL_PROVIDERS`. Le placer **après** `AnthropicClaudeProvider` (donc priorité fallback plus basse pour les tâches générales — Haiku ne sera sélectionné que via `model: "anthropic_haiku"` override).

```typescript
import { AnthropicHaikuProvider } from "./ai-providers/anthropic-haiku";

const ALL_PROVIDERS: AIProvider[] = [
  AnthropicClaudeProvider(),
  AnthropicHaikuProvider(),  // ← nouveau
  // ... reste inchangé
];
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```
Expected : 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/ai-providers/anthropic-haiku.ts lib/ai-router.ts
git commit -m "feat(ai-router): add Anthropic Haiku 4.5 provider

Haiku 4.5 (claude-haiku-4-5-20251001) pour les tâches rapides ne nécessitant pas la qualité Sonnet : extraction TOC d'un PDF, classification, tri. ~3-5x plus rapide que Sonnet, ~10x moins cher. Activable via RouteOptions.model='anthropic_haiku'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Switch extract-chapters.ts vers Haiku

**Files:**
- Modify: `lib/generate-questions/extract-chapters.ts`

- [ ] **Step 1: Lire le fichier actuel**

```bash
cat lib/generate-questions/extract-chapters.ts
```
Vérifier l'appel `routeAIRequest("extract_chapters", prompt, { ... })`.

- [ ] **Step 2: Ajouter `model: "anthropic_haiku"` dans l'appel**

Localiser le bloc :
```typescript
const response = await routeAIRequest("extract_chapters", prompt, {
  pdfBase64,
  requireVision: true,
  responseSchema: CHAPTERS_SCHEMA,
  maxTokens: 4096,
  cacheTtlMs: 0,
});
```

Remplacer par :
```typescript
const response = await routeAIRequest("extract_chapters", prompt, {
  pdfBase64,
  requireVision: true,
  responseSchema: CHAPTERS_SCHEMA,
  maxTokens: 4096,
  cacheTtlMs: 0,
  model: "anthropic_haiku", // ← Haiku pour la vitesse, TOC est tâche simple
});
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/generate-questions/extract-chapters.ts
git commit -m "feat(extract-chapters): switch TOC extraction to Haiku 4.5

Tâche simple (lister chapitres + pages), Haiku suffit. Réduit le temps de la phase pre-pass de ~200s → ~40s sur PDF 176p (estimation, à valider empiriquement).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Nouveau extract-content.ts (snippets + questions par chapter)

**Files:**
- Create: `lib/generate-questions/extract-content.ts`
- Delete: `lib/generate-questions/runner.ts` (à la fin de la tâche)

C'est la tâche centrale. On crée le nouveau pipeline complet.

- [ ] **Step 1: Créer le squelette du fichier avec les types**

```typescript
// lib/generate-questions/extract-content.ts
//
// Pipeline d'extraction structurée d'un syllabus PDF.
// Cf design spec : docs/superpowers/specs/2026-05-14-pdf-extraction-design.md
//
// Flow :
//   1. TOC extraction (Haiku 4.5) → chapters[]
//   2. Pool de 3 workers Sonnet 4.6 traitent chapter-by-chapter
//   3. Chaque worker INSERT immédiatement ses snippets + questions
//   4. Update workers_completed après chaque insert (partial success)

import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { routeAIRequest } from "@/lib/ai-router";
import { isValidSubject, isValidLevel, SUBJECTS_BY_ID } from "@/lib/subjects";
import type { SubjectId, SchoolLevel } from "@/lib/subjects";
import { extractPagesFromPdf } from "@/lib/pdf/extract-pages";
import { logActivity } from "@/lib/activity/log";
import { logError } from "@/lib/observability/log-error";
import { extractChapters, type Chapter } from "./extract-chapters";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_QUESTIONS_PER_COURSE = 600;

// Concurrence Anthropic Tier 1 sustained = 3 sans throttle observable.
const ANTHROPIC_CONCURRENCY = 3;

// Budget interne pour les workers : laisse 60s de marge sous le maxDuration
// Trigger.dev (600s) pour les inserts finaux + status update.
const WORKERS_DEADLINE_MS = 540_000;

// Cible questions/chapter (laissé au prompt à Sonnet, on cap entre min/max)
const MIN_QUESTIONS_PER_CHAPTER = 5;
const MAX_QUESTIONS_PER_CHAPTER = 25;

export function autoTargetQuestions(pagesCount: number | null): number {
  if (!pagesCount || pagesCount < 1) return 30;
  return Math.min(300, Math.ceil(pagesCount * 3));
}

type QuestionType = "mcq" | "numeric" | "short_text";

type ExtractedSnippet = {
  concept_name: string;
  text: string;
  source_page: number;
};

type ExtractedQuestion = {
  type: QuestionType;
  question: string;
  concept_name?: string;
  concept_page?: number;
  options?: string[];
  answer_index?: number;
  expected_numeric_answer?: number;
  numeric_tolerance?: number;
  numeric_unit?: string;
  expected_text_answers?: string[];
  explanation: string;
  difficulty?: number;
};

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

function createAdminClient() {
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

async function updateJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("question_generation_jobs")
    .update({ ...patch, phase_changed_at: new Date().toISOString() })
    .eq("id", jobId);
}

function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof e.message === "string") parts.push(e.message);
    if (typeof e.code === "string" || typeof e.code === "number") parts.push(`code=${e.code}`);
    if (typeof e.details === "string") parts.push(`details=${e.details}`);
    if (typeof e.hint === "string") parts.push(`hint=${e.hint}`);
    if (parts.length > 0) return parts.join(" ");
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err);
}
```

- [ ] **Step 2: Ajouter les prompts + schema**

```typescript
const TYPE_DISTRIBUTION: Record<string, string> = {
  mathematiques: "~50% numeric (calculs précis), ~30% mcq (concepts), ~20% short_text (définitions)",
  chimie: "~50% numeric (calculs de mole, concentration, masses), ~30% mcq, ~20% short_text (formules, noms)",
  physique: "~50% numeric (forces, énergies, vitesses), ~30% mcq, ~20% short_text",
  histoire: "~70% mcq (dates, événements), ~30% short_text (personnages, lieux)",
  geographie: "~70% mcq (pays, capitales), ~30% short_text",
  francais: "~50% short_text (définitions, completions), ~50% mcq",
  anglais: "~50% short_text (traductions, completions), ~50% mcq",
  neerlandais: "~50% short_text (traductions, completions), ~50% mcq",
  langues: "~50% short_text, ~50% mcq",
  litterature: "~50% short_text (titres, auteurs), ~50% mcq",
  biologie: "~60% mcq (processus, anatomie), ~30% short_text (noms de structures), ~10% numeric",
  sciences: "~60% mcq, ~30% short_text, ~10% numeric",
};

function getLevelHint(level: SchoolLevel | null): string {
  if (!level) return "";
  if (level <= 2) return "élèves 12-14 ans, vocabulaire de base et questions directes";
  if (level <= 4) return "élèves 14-16 ans, compréhension et applications";
  return "élèves 16-18 ans, analyse et raisonnement";
}

const CHAPTER_EXTRACTION_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    chapter_summary: { type: SchemaType.STRING },
    snippets: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          concept_name: { type: SchemaType.STRING },
          text: { type: SchemaType.STRING },
          source_page: { type: SchemaType.INTEGER },
        },
        required: ["concept_name", "text", "source_page"],
      },
    },
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING, format: "enum", enum: ["mcq", "numeric", "short_text"] },
          question: { type: SchemaType.STRING },
          concept_name: { type: SchemaType.STRING },
          concept_page: { type: SchemaType.INTEGER },
          options: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          answer_index: { type: SchemaType.INTEGER },
          expected_numeric_answer: { type: SchemaType.NUMBER },
          numeric_tolerance: { type: SchemaType.NUMBER },
          numeric_unit: { type: SchemaType.STRING },
          expected_text_answers: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          explanation: { type: SchemaType.STRING },
          difficulty: { type: SchemaType.INTEGER },
        },
        required: ["type", "question", "explanation", "difficulty"],
      },
    },
  },
  required: ["chapter_summary", "snippets", "questions"],
};

function buildChapterPrompt(
  subjectLabel: string,
  level: SchoolLevel | null,
  chapter: Chapter,
  targetQuestions: number,
): string {
  const levelHint = getLevelHint(level);
  const typeDist = TYPE_DISTRIBUTION[subjectLabel.toLowerCase()] ?? "~60% mcq, ~25% short_text, ~15% numeric";
  return (
    `Tu reçois un sous-PDF contenant UN chapitre de cours de ${subjectLabel}` +
    (levelHint ? ` (${levelHint})` : "") +
    `. Chapitre : "${chapter.title}" (pages ${chapter.pageStart}-${chapter.pageEnd}).` +
    `\n\nProduis un JSON avec EXACTEMENT cette structure :` +
    ` {"chapter_summary": "...", "snippets": [...], "questions": [...]}` +
    `\n\n**chapter_summary** : 1-2 phrases résumant le chapitre.` +
    `\n\n**snippets** (5-15 éléments) : passages de THÉORIE PRINCIPALE du chapitre. Chaque snippet :` +
    ` { "concept_name": "nom court du concept (ex: 'Loi de Lavoisier')", "text": "extrait ou reformulation du PDF, 20-2000 caractères, EN MAJORITÉ extrait littéral du PDF — pas de paraphrase libre", "source_page": page absolue du PDF complet }.` +
    ` Couvre les concepts CLÉS du chapitre (définitions, formules, propositions, exemples canoniques).` +
    `\n\n**questions** (${targetQuestions} questions) : variées et pédagogiques. Distribution : ${typeDist}.` +
    ` Chaque question : { "type": "mcq|numeric|short_text", "question": "...", "concept_name": "matche un snippet", "concept_page": page du concept testé, "explanation": "...", "difficulty": 1-3, + champs type-specific }.` +
    ` Pour mcq : "options" (4 entrées) + "answer_index" (0-3).` +
    ` Pour numeric : "expected_numeric_answer" (nombre) + "numeric_tolerance" (défaut 0.01) + "numeric_unit" (optionnel).` +
    ` Pour short_text : "expected_text_answers" (tableau 1-5 réponses acceptables avec variantes).` +
    `\n\nRègles strictes : pages = numéros absolus du PDF complet, pas relatifs au sous-PDF. snippets et questions DOIVENT référencer du contenu PRÉSENT dans le PDF (pas d'hallucination). Pas de doublons entre questions.`
  );
}
```

- [ ] **Step 3: Helper de parse résilient**

```typescript
function parseChapterResponse(raw: string): {
  chapter_summary?: string;
  snippets?: ExtractedSnippet[];
  questions?: ExtractedQuestion[];
} {
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
```

- [ ] **Step 4: Fonctions de normalisation**

```typescript
function normalizeSnippet(s: ExtractedSnippet): ExtractedSnippet | null {
  if (typeof s.concept_name !== "string" || !s.concept_name.trim()) return null;
  if (typeof s.text !== "string") return null;
  const text = s.text.trim();
  if (text.length < 20 || text.length > 4000) return null;
  const page = Number.isInteger(s.source_page) && s.source_page >= 1 ? s.source_page : 1;
  return { concept_name: s.concept_name.trim(), text, source_page: page };
}

function normalizeQuestion(q: ExtractedQuestion): ExtractedQuestion | null {
  if (typeof q.question !== "string" || !q.question.trim()) return null;
  const difficulty =
    typeof q.difficulty === "number" && Number.isInteger(q.difficulty) && q.difficulty >= 1 && q.difficulty <= 3
      ? q.difficulty
      : undefined;
  const explanation = typeof q.explanation === "string" ? q.explanation : "";
  const base = { ...q, question: q.question.trim(), explanation, difficulty };

  if (q.type === "mcq") {
    const options = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
    while (options.length < 4) options.push("");
    if (!options.every(Boolean)) return null;
    const answer_index =
      Number.isInteger(q.answer_index) && q.answer_index! >= 0 && q.answer_index! <= 3 ? q.answer_index! : 0;
    return { ...base, type: "mcq", options, answer_index };
  }
  if (q.type === "numeric") {
    if (typeof q.expected_numeric_answer !== "number" || !Number.isFinite(q.expected_numeric_answer)) return null;
    const tolerance =
      typeof q.numeric_tolerance === "number" && Number.isFinite(q.numeric_tolerance) ? q.numeric_tolerance : 0.01;
    const unit = typeof q.numeric_unit === "string" && q.numeric_unit.length > 0 ? q.numeric_unit : undefined;
    return { ...base, type: "numeric", expected_numeric_answer: q.expected_numeric_answer, numeric_tolerance: tolerance, numeric_unit: unit };
  }
  if (q.type === "short_text") {
    const answers = Array.isArray(q.expected_text_answers)
      ? q.expected_text_answers.filter((a) => typeof a === "string" && a.trim().length > 0).slice(0, 5)
      : [];
    if (answers.length === 0) return null;
    return { ...base, type: "short_text", expected_text_answers: answers };
  }
  return null;
}
```

- [ ] **Step 5: Fonction processChapter (extract + insert immédiat)**

```typescript
/**
 * Traite UN chapitre : extract sub-PDF, appel Sonnet, parse, normalize,
 * INSERT immédiatement snippets + questions en DB.
 * Returns { snippetsCount, questionsCount } pour le tracking.
 * Throws si tout échoue (parse impossible, AI down, etc.).
 */
async function processChapter(
  jobId: string,
  job: JobRow,
  course: CourseRow,
  fullPdfBuffer: Buffer,
  chapter: Chapter,
  targetQuestions: number,
  subjectLabel: string,
  level: SchoolLevel | null,
): Promise<{ snippetsInserted: number; questionsInserted: number }> {
  const subBuffer = await extractPagesFromPdf({
    pdfBuffer: fullPdfBuffer,
    startPage: chapter.pageStart,
    endPage: chapter.pageEnd,
  });
  const subBase64 = Buffer.from(subBuffer).toString("base64");

  const prompt = buildChapterPrompt(subjectLabel, level, chapter, targetQuestions);

  const response = await routeAIRequest("extract_chapter_content", prompt, {
    pdfBase64: subBase64,
    requireVision: true,
    responseSchema: CHAPTER_EXTRACTION_SCHEMA,
    maxTokens: 16384, // 15 snippets + 15 questions ~ 12-15K tokens, marge
    cacheTtlMs: 0,
    model: "anthropic_claude", // Sonnet 4.6 pour qualité
  });

  const parsed = parseChapterResponse(response.text);

  const rawSnippets = Array.isArray(parsed.snippets) ? parsed.snippets : [];
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];

  const validSnippets = rawSnippets
    .map(normalizeSnippet)
    .filter((s): s is ExtractedSnippet => s !== null);

  const validQuestions = rawQuestions
    .map(normalizeQuestion)
    .filter((q): q is ExtractedQuestion => q !== null);

  if (validSnippets.length === 0 && validQuestions.length === 0) {
    throw new Error(
      `Chapter '${chapter.title}' : aucun snippet ni question valide (raw: ${rawSnippets.length}s, ${rawQuestions.length}q)`,
    );
  }

  const admin = createAdminClient();

  // INSERT snippets (best-effort, on continue si fail pour ne pas perdre les questions)
  let snippetsInserted = 0;
  if (validSnippets.length > 0) {
    const snippetRows = validSnippets.map((s) => ({
      course_id: course.id,
      concept_id: null,
      school_id: course.school_id,
      text: s.text,
      source_kind: "syllabus_extraction" as const,
      source_ref: {
        chapter_title: chapter.title,
        concept_name: s.concept_name,
        source_page: s.source_page,
      },
    }));
    const { error: snipErr, count } = await admin
      .from("content_snippets")
      .insert(snippetRows, { count: "exact" });
    if (snipErr) {
      await logError(new Error(`Snippet insert failed for chapter '${chapter.title}': ${snipErr.message ?? ""}`), {
        source: "extract-content.processChapter.snippets",
        context: { jobId, chapter: chapter.title, attemptedCount: validSnippets.length },
      });
    } else {
      snippetsInserted = count ?? validSnippets.length;
    }
  }

  // INSERT questions (idem best-effort)
  let questionsInserted = 0;
  if (validQuestions.length > 0) {
    const questionRows = validQuestions.map((q) => ({
      teacher_id: job.teacher_id,
      school_id: course.school_id,
      course_id: course.id,
      subject: null,
      subject_enum: course.subject_enum ?? null,
      level: course.level ?? null,
      type: q.type,
      question: q.question,
      options: q.type === "mcq" ? q.options ?? null : null,
      answer_index: q.type === "mcq" ? q.answer_index ?? null : null,
      expected_numeric_answer: q.type === "numeric" ? q.expected_numeric_answer ?? null : null,
      numeric_tolerance: q.type === "numeric" ? q.numeric_tolerance ?? 0.01 : null,
      numeric_unit: q.type === "numeric" ? q.numeric_unit ?? null : null,
      expected_text_answers: q.type === "short_text" ? q.expected_text_answers ?? null : null,
      explanation: q.explanation || null,
      period: chapter.title,
      difficulty_stars: q.difficulty ?? null,
      organization_tags: course.organization_tags ?? [],
      is_ai_generated: true,
      is_public: false,
      page_range_start: chapter.pageStart,
      page_range_end: chapter.pageEnd,
      concept_page_hint: q.concept_page ?? chapter.pageStart,
    }));
    const { error: qErr, count } = await admin
      .from("teacher_questions")
      .insert(questionRows, { count: "exact" });
    if (qErr) {
      await logError(new Error(`Question insert failed for chapter '${chapter.title}': ${qErr.message ?? ""}`), {
        source: "extract-content.processChapter.questions",
        context: { jobId, chapter: chapter.title, attemptedCount: validQuestions.length },
      });
    } else {
      questionsInserted = count ?? validQuestions.length;
    }
  }

  return { snippetsInserted, questionsInserted };
}
```

- [ ] **Step 6: Pool de concurrence**

```typescript
async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  async function pump(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      try {
        await worker(items[i], i);
      } catch {
        // Erreurs catched DANS le worker (chaque worker fait son INSERT + log).
        // Si throw remonte ici, c'est une erreur infra → on log + continue.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, pump));
}
```

- [ ] **Step 7: Entry point runExtractionForJob**

```typescript
/**
 * Exécute la pipeline d'extraction pour un job déjà créé en DB.
 * Source de vérité = la row `question_generation_jobs` identifiée par jobId.
 * Met à jour `status/phase` au fur et à mesure.
 * INSERT chapter-by-chapter : partial success préservé en cas de timeout.
 * Ne THROW jamais — le statut DB est le seul source of truth côté UI.
 */
export async function runExtractionForJob(jobId: string): Promise<void> {
  const admin = createAdminClient();

  try {
    // Load job + course
    const { data: jobRaw, error: jobErr } = await admin
      .from("question_generation_jobs")
      .select("id, course_id, teacher_id, school_id, total_target, pages_count, page_range_start, page_range_end")
      .eq("id", jobId)
      .single();
    if (jobErr || !jobRaw) throw new Error(`Job ${jobId} introuvable: ${jobErr?.message ?? "no row"}`);
    const job = jobRaw as JobRow;

    const { data: courseRaw, error: courseErr } = await admin
      .from("courses")
      .select("id, teacher_id, school_id, subject_enum, level, pdf_storage_path, organization_tags, pages_count")
      .eq("id", job.course_id)
      .single();
    if (courseErr || !courseRaw) throw new Error(`Course ${job.course_id} introuvable`);
    const course = courseRaw as CourseRow;
    if (!course.pdf_storage_path) throw new Error("Course sans pdf_storage_path");

    const subject: SubjectId = isValidSubject(course.subject_enum) ? course.subject_enum : "histoire";
    const level: SchoolLevel | null = isValidLevel(course.level) ? course.level : null;
    const subjectLabel = SUBJECTS_BY_ID[subject].label;
    const pageRange =
      typeof job.page_range_start === "number" && typeof job.page_range_end === "number"
        ? { start: job.page_range_start, end: job.page_range_end }
        : null;

    // Phase: extracting_pdf
    await updateJob(jobId, { status: "running", phase: "extracting_pdf" });

    const { data: pdfBlob, error: downloadError } = await admin.storage
      .from("course-pdfs")
      .download(course.pdf_storage_path);
    if (downloadError || !pdfBlob) {
      throw new Error(`PDF download failed: ${downloadError?.message ?? "no blob"}`);
    }

    const fullPdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());
    if (fullPdfBuffer.byteLength > MAX_PDF_BYTES) {
      const sizeMB = (fullPdfBuffer.byteLength / 1024 / 1024).toFixed(1);
      throw new Error(`PDF de ${sizeMB}MB trop volumineux (max 20MB)`);
    }

    let workingBuffer: Buffer = fullPdfBuffer;
    let workingPagesCount = course.pages_count ?? null;
    if (pageRange !== null) {
      try {
        const extracted = await extractPagesFromPdf({
          pdfBuffer: fullPdfBuffer,
          startPage: pageRange.start,
          endPage: pageRange.end,
        });
        workingBuffer = Buffer.from(extracted);
        workingPagesCount = pageRange.end - pageRange.start + 1;
      } catch (err) {
        console.warn("[extract-content] page_range extract failed, fallback PDF entier:", err);
      }
    }

    // Phase: generating_workers (sémantique : 1 worker = 1 chapter)
    await updateJob(jobId, { phase: "generating_workers", workers_completed: 0 });

    const workingBase64 = workingBuffer.toString("base64");
    const chapters = await extractChapters(workingBase64, subjectLabel, workingPagesCount);

    if (chapters.length === 0) {
      throw new Error("Aucun chapitre identifié dans le PDF");
    }

    await updateJob(jobId, { worker_count: chapters.length });

    // Réparti le quota target entre chapters proportionnellement aux pages
    const totalChapterPages = chapters.reduce((sum, c) => sum + (c.pageEnd - c.pageStart + 1), 0);
    const chapterQuotas = chapters.map((c) => {
      const pages = c.pageEnd - c.pageStart + 1;
      const proportional = Math.round((job.total_target * pages) / Math.max(totalChapterPages, 1));
      return Math.max(MIN_QUESTIONS_PER_CHAPTER, Math.min(MAX_QUESTIONS_PER_CHAPTER, proportional));
    });

    let chaptersDone = 0;
    let totalSnippetsInserted = 0;
    let totalQuestionsInserted = 0;
    let totalQuestionsRaw = 0;
    const failedChapters: string[] = [];

    // Deadline interne : on stoppe gracefully avant le hard kill 600s
    const startMs = Date.now();
    const deadlineMs = startMs + WORKERS_DEADLINE_MS;

    await runConcurrent(chapters, ANTHROPIC_CONCURRENCY, async (chapter, idx) => {
      if (Date.now() > deadlineMs) {
        // Pas de logError ici (spammerait pour chaque chapter restant), on log 1x à la fin
        failedChapters.push(`${chapter.title} (skip — deadline interne atteinte)`);
        return;
      }
      try {
        const result = await processChapter(
          jobId,
          job,
          course,
          fullPdfBuffer, // ← fullPdfBuffer car les chapter ranges sont absolues
          chapter,
          chapterQuotas[idx],
          subjectLabel,
          level,
        );
        chaptersDone++;
        totalSnippetsInserted += result.snippetsInserted;
        totalQuestionsInserted += result.questionsInserted;
        totalQuestionsRaw += result.questionsInserted; // approximatif, normalisation déjà appliquée
        await updateJob(jobId, {
          workers_completed: chaptersDone,
          questions_raw: totalQuestionsRaw,
          questions_inserted: totalQuestionsInserted,
        });
      } catch (err) {
        failedChapters.push(`${chapter.title}: ${serializeError(err).slice(0, 100)}`);
        await logError(err, {
          source: "extract-content.runExtractionForJob.chapter",
          context: { jobId, chapter: chapter.title, durationMs: Date.now() - startMs },
        });
      }
    });

    // Phase: validating (sanity)
    await updateJob(jobId, { phase: "validating" });

    if (totalQuestionsInserted === 0 && totalSnippetsInserted === 0) {
      throw new Error(
        failedChapters.length === chapters.length
          ? `Tous les chapitres ont échoué : ${failedChapters.slice(0, 3).join(" | ")}`
          : "Aucune question ni snippet inséré (cause inconnue)",
      );
    }

    // logActivity pour traceability
    if (pageRange !== null) {
      await logActivity({
        event_type: "teacher_generated_targeted_questions",
        actor_id: job.teacher_id,
        actor_type: "teacher",
        target_type: "course",
        target_id: course.id,
        teacher_id: job.teacher_id,
        context: {
          questions_inserted: totalQuestionsInserted,
          snippets_inserted: totalSnippetsInserted,
          chapters_processed: chaptersDone,
          chapters_failed: failedChapters.length,
          page_range: pageRange,
        },
      });
    }

    // Phase: done
    await updateJob(jobId, {
      status: "done",
      phase: "done",
      questions_inserted: totalQuestionsInserted,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    await logError(err, { source: "extract-content.runExtractionForJob", context: { jobId } });
    await updateJob(jobId, {
      status: "failed",
      phase: "failed",
      error_message: serializeError(err).slice(0, 500),
      completed_at: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 8: Supprimer l'ancien runner.ts**

```bash
git rm lib/generate-questions/runner.ts
```

- [ ] **Step 9: Type-check**

```bash
npx tsc --noEmit
```

S'il y a des références à `runner.ts` ou à `runGenerationForJob` ailleurs dans le code, le type-check va échouer. On les corrige dans la Task 6.

- [ ] **Step 10: Commit**

```bash
git add lib/generate-questions/extract-content.ts
git rm lib/generate-questions/runner.ts  # si pas déjà fait
git commit -m "feat(extract-content): new pipeline with snippets + questions per chapter

Remplace l'ancien runner.ts (job done with structure-first chapter-by-chapter approach mais sans persistence des snippets). Le nouveau extract-content.ts :
- 1 appel Sonnet par chapter produit JSON {snippets[], questions[]}
- INSERT immédiat par chapter (partial success préservé en cas de kill Trigger.dev)
- snippets dans content_snippets (source_kind=syllabus_extraction)
- questions dans teacher_questions (period = chapter.title)
- Pool concurrence 3
- Deadline interne 540s pour graceful exit avant maxDuration 600s

Cf spec : docs/superpowers/specs/2026-05-14-pdf-extraction-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Adapter trigger task + route.ts pour appeler extract-content

**Files:**
- Modify: `trigger/generate-questions.ts`
- Modify: `app/api/courses/generate-questions/route.ts`

- [ ] **Step 1: Modifier la task Trigger.dev**

Dans `trigger/generate-questions.ts`, remplacer l'import et l'appel :

```typescript
// AVANT
import { runGenerationForJob } from "@/lib/generate-questions/runner";
// ...
await runGenerationForJob(payload.jobId);

// APRÈS
import { runExtractionForJob } from "@/lib/generate-questions/extract-content";
// ...
await runExtractionForJob(payload.jobId);
```

Le `task.id` reste `"generate-questions"` pour pas casser les runs in-flight + le binding route.ts → Trigger.dev.

- [ ] **Step 2: Adapter route.ts (import constants)**

Dans `app/api/courses/generate-questions/route.ts`, remplacer l'import :

```typescript
// AVANT
import { MAX_QUESTIONS_PER_COURSE, autoTargetQuestions } from "@/lib/generate-questions/runner";

// APRÈS
import { MAX_QUESTIONS_PER_COURSE, autoTargetQuestions } from "@/lib/generate-questions/extract-content";
```

(Le reste du fichier inchangé — la route ne change pas, c'est seulement l'import qui pointe vers le nouveau fichier.)

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected : 0 errors. Si erreurs, sont sur des imports résiduels — fixer.

- [ ] **Step 4: Commit**

```bash
git add trigger/generate-questions.ts app/api/courses/generate-questions/route.ts
git commit -m "feat(trigger): point task to new extract-content runner

La task Trigger.dev appelle maintenant runExtractionForJob (extract-content.ts) au lieu de runGenerationForJob (runner.ts). Route.ts pointe vers les constants du nouveau module.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: UI label inclure snippets count

**Files:**
- Modify: `app/school/import/_components/GenerationProgress.tsx:51-70`

- [ ] **Step 1: Vérifier le type JobStatusResponse**

```bash
grep -n "questions_raw\|questions_inserted\|snippets" app/school/import/_components/GenerationProgress.tsx
```

Le type JobStatusResponse vient du backend status endpoint. Pas besoin de modifier le type — on ajoute juste le snippets count quand `questions_inserted > 0` :

- [ ] **Step 2: Modifier le label**

Dans `stepLabel`, case 1, remplacer :

```typescript
case 1: {
  if (data.worker_count <= 1) {
    return data.workers_completed === 0
      ? "Identification des chapitres…"
      : `Génération en cours (${data.questions_raw} questions générées)`;
  }
  return `Chapitre ${Math.min(data.workers_completed + 1, data.worker_count)}/${data.worker_count} (${data.questions_raw} questions générées)`;
}
```

Par :

```typescript
case 1: {
  if (data.worker_count <= 1) {
    return data.workers_completed === 0
      ? "Identification des chapitres…"
      : `Génération en cours (${data.questions_inserted} questions, snippets de théorie en cours)`;
  }
  return `Chapitre ${Math.min(data.workers_completed + 1, data.worker_count)}/${data.worker_count} · ${data.questions_inserted} questions inserted`;
}
```

(Note : on lit `questions_inserted` au lieu de `questions_raw` parce que le nouveau pipeline insert immédiatement.)

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/school/import/_components/GenerationProgress.tsx
git commit -m "chore(import): UI label reflète snippets + questions inserted incrementally

Le nouveau pipeline insert chapter-by-chapter, donc questions_inserted monte en temps réel. Le label affiche maintenant cette valeur (pas questions_raw qui est moins fiable).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Smoke test + deploy end-to-end

**Files:** none (validation only)

- [ ] **Step 1: Merge toutes les PRs intermédiaires**

Chaque task ci-dessus a son commit. Selon stratégie d'Alex (1 grosse PR ou plusieurs), grouper. Recommandation : **1 PR contenant tous les commits du plan** (atomicité — soit tout marche, soit on rollback proprement).

```bash
git checkout -b feat/pdf-extraction-pipeline origin/main
git cherry-pick <hashes des commits Tasks 1-7>
git push -u origin feat/pdf-extraction-pipeline
gh pr create --title "feat: PDF extraction pipeline (snippets + questions)" \
  --body "Implémente le spec docs/superpowers/specs/2026-05-14-pdf-extraction-design.md. Cf plan : docs/superpowers/plans/2026-05-14-pdf-extraction-implementation.md."
```

- [ ] **Step 2: Apply Supabase migration en prod**

Avant de merger la PR, appliquer la migration via Supabase Studio ou CLI. Sinon le code va crash sur les INSERT content_snippets avec course_id.

- [ ] **Step 3: Merge PR + sync maia**

```bash
gh pr merge <PR#> --squash
git fetch origin main
git push maia origin/main:main
```

- [ ] **Step 4: Deploy Trigger.dev**

```bash
npx trigger.dev@latest deploy
```

Attendu : la version v11+ est déployée. Note le version number.

- [ ] **Step 5: Smoke test PDF petit**

Upload jury-histoire (ou équivalent ~30-80p) via /school/import. Attendu :
- TOC en ~20-40s (Haiku)
- 3-5 chapters identifiés
- ~30-50 questions + ~20-30 snippets en ~2 min total

Validation DB :
```bash
node scripts/watch-job-v2.mjs  # workers_completed monte régulièrement
```

- [ ] **Step 6: Smoke test PDF gros (chimie 176p)**

Upload le PDF chimie. Attendu :
- TOC en ~40-60s
- 10-20 chapters
- 100-200 questions + 50-100 snippets en ~5-7 min
- `status=done` à la fin

- [ ] **Step 7: Vérification UI**

- /school/questions → onglet "À valider" affiche les questions
- Sidebar matière → chapitres listés via `period`
- Les questions sont classées par chapitre

- [ ] **Step 8: Vérification snippets DB**

```bash
node -e 'import("@supabase/supabase-js").then(async ({ createClient }) => {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { count } = await c.from("content_snippets").select("*", { count: "exact", head: true }).eq("source_kind", "syllabus_extraction");
  console.log(`syllabus_extraction snippets: ${count}`);
})'
```

Attendu : `count > 0`, snippets attachés au course test.

- [ ] **Step 9: Cleanup zombie jobs (post-test)**

Si encore des jobs `running` orphelins, kill via script `kill-zombies.mjs` (déjà existant dans scripts/).

---

## Self-Review (auto-check)

**Spec coverage** :
- ✅ Phase 1 TOC via Haiku → Task 4 (switch model)
- ✅ Phase 2 per-chapter Sonnet → Task 5 (extract-content)
- ✅ Output snippets + questions ensemble → Task 5
- ✅ INSERT chapter-by-chapter → Task 5 (processChapter)
- ✅ Pool concurrence 3 → Task 5 (runConcurrent)
- ✅ Deadline interne 540s → Task 5
- ✅ Migration content_snippets → Task 1
- ✅ Model override RouteOptions → Task 2
- ✅ Provider Haiku → Task 3
- ✅ UI labels → Task 7
- ✅ Smoke test → Task 8

**Placeholder scan** : Aucun "TODO", "TBD", "appropriate error handling" sans détail.

**Type consistency** :
- `runExtractionForJob` (Task 5) → utilisé dans Task 6 ✓
- `Chapter` type importé de `./extract-chapters` (existant) ✓
- `JobRow`, `CourseRow` types définis localement Task 5 ✓
- `RouteOptions.model` ajouté Task 2, utilisé Tasks 4 et 5 ✓

**Risques résiduels** :
- Si le PDF a très peu de chapitres clairs (1-2), Haiku risque de retourner "Document complet" en fallback → Sonnet bosse sur PDF entier = lent. Mitigation possible plus tard : si chapters.length === 1 AND pages > 50, splitter artificiellement.
- Concurrence 3 fixe : si Anthropic throttle nous voyons via latency par chapter > 90s → option dans une carte board "ajuster concurrence selon perfs observées".

Plan prêt à exécuter.
