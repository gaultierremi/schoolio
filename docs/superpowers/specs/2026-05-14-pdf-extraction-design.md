# PDF Extraction Pipeline — Design Spec

**Date** : 2026-05-14
**Auteur** : Claudy (avec Alex)
**Status** : draft pour review

## Objectif

Construire un pipeline d'**extraction structurée** du contenu d'un syllabus PDF qui sert **trois consommateurs** :

1. **Questions de quiz** (tous types : MCQ, numeric, short_text, multi-step) → `teacher_questions`
2. **Snippets de matière** (théorie courte, définitions, formules) → `content_snippets` pour le tuteur socratique
3. **Sessions de remédiation** (concepts à réviser quand un élève rate des questions) → réutilise snippets + questions

**Priorité absolue : qualité de l'extraction.** Vitesse acceptable jusqu'à ~8 min sur PDF 200p.

## Contexte — pourquoi pas l'architecture actuelle

Le pipeline `runGenerationForJob` actuel a été refactoré 6 fois sur la matinée (PR #34 → #41) et timeout systématiquement en production sur le PDF chimie 176p. Diagnostic empirique :

- **PDF Vision Anthropic sur 176p** : ~200s par appel (vs ~30s estimé)
- **`max_tokens=32K`** = ~30 questions max par appel → 300 questions = **forcément ≥10 appels Anthropic** (limite hardware modèle)
- **Anthropic free tier** : 3-4 concurrent max → 3 batches × 100s = 300-400s + TOC 200s = **> 600s** (timeout Trigger.dev free)
- **Smoke tests pré-deploy** étaient bidons (UUID fictif → run crash en 7s, ne testait pas l'inférence réelle)

L'approche actuelle "1 PDF entier × N workers" est intrinsèquement lente sur gros PDF. On ne peut pas la rendre rapide ; il faut **changer la nature des appels**.

## Architecture cible

### Vue d'ensemble

```
Upload PDF (≤ 20 MB, max 300 pages)
   ↓
[Phase 1] TOC extraction (Haiku 4.5)               → 1 appel, ~40s
   ↓ outputs: chapters[] = [{title, pageStart, pageEnd}]
   ↓
[Phase 2] Per-chapter content extraction (Sonnet 4.6)
   ↓ pool de concurrence 3
   ↓ chaque chapter = sub-PDF + 1 appel structuré qui output :
   ↓   • snippets[] (théorie : 5-15 passages courts par chapter)
   ↓   • questions[] (10-20 questions variées par chapter)
   ↓ ~60-90s par chapter
   ↓
[Phase 3] Validate + persist
   ↓ INSERT content_snippets + teacher_questions par batch
   ↓
[Done]
```

### Choix de modèles

| Phase | Modèle | Pourquoi |
|---|---|---|
| TOC extraction | **Haiku 4.5** | Tâche simple (lister chapitres + pages). Haiku ~3-5x plus rapide que Sonnet, qualité largement suffisante pour identifier des titres de chapitres. |
| Content extraction | **Sonnet 4.6** | Qualité critique : reformulation de snippets de théorie, génération de questions pédagogiques variées et correctes. Sonnet > Haiku pour la nuance, Sonnet < Opus en vitesse mais qualité comparable pour MCQ niveau secondaire. |

**Pas Opus** : surcoût ~5x pour gain marginal sur MCQ secondaire selon les benchs publics. À reconsidérer si qualité Sonnet jugée insuffisante après dogfood.

### Output structuré par chapter (1 appel = 1 JSON)

```json
{
  "chapter_summary": "string (1-2 phrases, résumé synthétique du chapitre)",
  "snippets": [
    {
      "concept_name": "string (ex: 'Loi de Lavoisier')",
      "text": "string (20-4000 chars, extrait/reformulé du PDF, théorie principale)",
      "source_page": "int (page absolue dans PDF complet)"
    }
  ],
  "questions": [
    {
      "type": "mcq | numeric | short_text | multi_step",
      "question": "string",
      "concept_name": "string (référence au snippet du même chapter)",
      "concept_page": "int (page absolue PDF)",
      "difficulty": "1 | 2 | 3",
      "explanation": "string",
      // Champs type-specific (options/answer_index pour mcq, etc.)
    }
  ]
}
```

**Distribution attendue par chapter** :
- 5-15 snippets (1 par concept principal)
- 10-20 questions (couvre 70% des concepts du chapter)

### Pourquoi 1 seul appel par chapter (snippets + questions ensemble)

- **Économie** : 1 appel Anthropic lit le PDF une fois, produit 2 outputs. Faire 2 appels distincts = 2x coût + 2x temps.
- **Cohérence** : les questions référencent `concept_name` qui matche un snippet du même output. Pas de désynchronisation.
- **Coût `max_tokens`** : 15 snippets + 15 questions ≈ 12-18K tokens output, marge confortable sous 32K.

### Gestion erreurs

| Cas | Action |
|---|---|
| Un chapter (Sonnet) échoue / JSON malformé | logError + skip + continue avec les autres (partial success) |
| Tous les chapters échouent | `status=failed` avec message clair "Aucun contenu extrait. Réessaye dans 1 min ou contacte le support." |
| TOC échoue (Haiku) | Fallback : 1 seul "chapter" = "Document complet" sur toutes les pages |
| Trigger.dev timeout approche (260s budget interne sur 600s) | Sauvegarde au fur et à mesure : INSERT après chaque chapter terminé, pas en batch final → un timeout en cours de route garde les chapters déjà inserted |
| max_tokens hit | Skip ce chapter, log avec contexte (chapter name, page range) |

### Persistance — alignement avec schéma existant

Le schéma actuel a un modèle curriculum riche (`curriculum_programs` → `uaa` → `concepts` → `theory_blocks` → `content_snippets`). Pour la **première version dogfood** de ce pipeline :

- **`teacher_questions`** : insert direct (table déjà utilisée). `period = chapter.title`, `concept_page_hint = source_page`.
- **`content_snippets`** : insert avec `source_kind='manual_teacher'` pour bypasser la dépendance `concept_id` strict (concept_id est NOT NULL FK vers `concepts.id`).
  - **Décision à valider** : créer un concept "implicite" (1 row dans `concepts`) par chapter, l'utiliser comme parent des snippets ?
  - **Alternative** : étendre le CHECK `source_kind` pour ajouter `'syllabus_extraction'` qui permet `concept_id` nullable, et patcher `lib/snippets/retrieve.ts` pour gérer ce cas.
  - → On choisit la 2e option (migration + 1 ligne de code) pour rester aligné avec `manual_teacher` sémantique.

### Concurrence

- Pool de 3 workers Sonnet en parallèle (free tier Anthropic Tier 1 = 3-4 concurrent sustained).
- Si on observe du throttle (latency > 90s/appel) : baisser à 2 et alerter pour upgrade Tier 2 (~$40 cumulés).
- Pas de partitioning artificiel : 1 worker = 1 chapter entier. La concurrence opère sur les batches de chapters.

### Budget temps cible

| Étape | PDF 50p (5 chapters) | PDF 200p (15 chapters) |
|---|---|---|
| TOC (Haiku) | ~25s | ~60s |
| Chapters Sonnet (3 concurrent) | ~90s (2 batches) | ~270s (5 batches) |
| Validation + persist | ~10s | ~30s |
| **Total** | **~2 min** | **~6 min** |

8 min reste comme budget plafond confortable.

### Trigger.dev maxDuration

- **600s par task** (déjà bumpé en PR #41)
- **Deadline interne 540s** dans le runner pour graceful exit avant le hard kill 600s
- À chaque chapter terminé : INSERT immédiat → partial success préservé en cas de kill

## Composants à modifier

### 1. `lib/generate-questions/extract-chapters.ts` (existe)
- Switch model : `routeAIRequest` avec preference Haiku 4.5
- Garder le parse résilient

### 2. `lib/generate-questions/runner.ts` (à refactor)
- Renommer en `lib/generate-questions/extract-content.ts` (le nom reflète mieux le but)
- `runExtractionForJob(jobId)` :
  1. TOC via `extract-chapters`
  2. Pool de 3 workers Sonnet sur chapters
  3. Chaque worker INSERT directement (snippets + questions) à la fin de son traitement, pas en batch global
  4. Update `workers_completed` après chaque insert

### 3. `lib/ai-providers/anthropic.ts` (à étendre)
- Aujourd'hui : provider Sonnet seul.
- Demain : helper `AnthropicHaikuProvider()` pour Haiku 4.5. Ou paramètre `model` injectable dans `routeAIRequest`.
- Décision : ajouter `model?: string` à `RouteOptions` qui override la sélection auto.

### 4. `supabase/migrations/YYYYMMDD_content_snippets_syllabus_extraction.sql` (nouveau)
- Ajouter `'syllabus_extraction'` à la CHECK `source_kind`
- Permettre `concept_id` nullable
- Update RLS policies pour autoriser `service_role` insert sur ce source_kind (déjà OK car écrit par le runner avec service_role)

### 5. UI `app/school/import/_components/GenerationProgress.tsx` (cosmétique)
- Label phase 1 = "Identification des chapitres" (déjà fait)
- Label phase 2 = "Extraction chapitre X/N (Y questions, Z snippets)" (ajout Z snippets)

### 6. Trigger.dev task `trigger/generate-questions.ts` (renommer)
- `id: "extract-pdf-content"` (sémantique meilleure)
- Compatibilité : garder `id: "generate-questions"` en alias 1 release pour éviter de casser les runs in-flight, supprimer ensuite.

## Hors-scope (explicite)

- Génération de questions multi-step complètes : trop complexe pour la v1, on garde mcq/numeric/short_text seulement.
- Intégration avec `curriculum_programs` / `uaa` / `concepts` riches : v1 utilise `source_kind='syllabus_extraction'` qui contourne. À refacto plus tard si on veut matcher avec curriculum officiel FWB.
- Auto-création de concepts canoniques : non, on reste sur des "chapters" simples avec `period = chapter.title`.

## Risques identifiés

| Risque | Mitigation |
|---|---|
| Haiku TOC qualité insuffisante (chapters mal découpés) | A/B test sur 3 PDFs (chimie/histoire/français) avant ship ; fallback Sonnet si confiance basse |
| Sonnet 4.6 plus lent que prévu sur sub-PDF | Mesure empirique sur 1 chapter avant de ship le pipeline complet |
| `content_snippets` migration casse l'orchestrator ingestion existant | Tester migration en dev, vérifier `lib/snippets/retrieve.ts` |
| Anthropic free tier throttle sur 3 concurrent | Si observation : pause auto entre batches, ou upgrade Tier 2 |

## Critères de succès (test final dogfood)

- PDF chimie 17-18 (176p, 7MB) → 10-20 chapitres identifiés, ~150 questions inserted, ~80 snippets inserted, **total < 8 min**
- PDF jury-histoire (taille typique 30-80p) → reste rapide, **total < 3 min**
- Questions visibles avec filtre par chapitre dans `/school/questions` "à valider"
- Snippets visibles côté tuteur élève (étape suivante du sprint, hors scope ici)
