# PDF Images Extraction Strategy — Design Spec

**Date** : 2026-05-15
**Status** : Draft
**Author** : Alex Bourdouxhe + Claudy
**Related** : `2026-05-14-pdf-extraction-design.md` (pipeline text-only existant)

---

## 1. Contexte

Le pipeline actuel d'extraction PDF (livré 2026-05-14, PRs #50-#59) est **text-only** : on extrait le texte via `unpdf`, on génère un TOC via Haiku 4.5, puis on génère 5-15 questions par chapitre via Sonnet 4.6. **Aucune image n'est traitée** — schémas cellulaires, scènes historiques, formules chimiques, cartes géographiques, structures moléculaires sont tous ignorés.

Les founders ont remonté ce gap :

- **Laurent** : sigles math/intégrales/matrices, chimie organique, schémas biologie (cellule), notation physique.
- **Christophe** : scènes historiques, reconnaissance personnages, cartes géo (topographie, courbes de niveau, hygrométrie), schémas cellulaires, iconographie religieuse.

L'usage couvert correspond au niveau **CESS Belgique FWB** (16-18 ans) — secondaire supérieur, pas université. Les formules sont simples (équations 2nd degré, log/exp, dérivées élémentaires, réactions chimiques équilibrées, F=ma). Les scènes/cartes/schémas sont typiques du programme : pas de besoin spécialisé exotique.

## 2. Goals & Non-goals

### Goals

- **Extraire les images** de chaque syllabus PDF et les attacher aux questions / snippets pertinents.
- **Générer des questions image-aware** : "Identifie le personnage", "Quelle scène biblique est représentée ?", "Identifie l'organite cellulaire pointé".
- **Préserver le pipeline texte existant** (pas de régression sur les questions text-only qui marchent déjà).
- **Asynchrone** : pas de slowdown perçu sur l'upload PDF (le prof voit ses questions texte arriver pendant que le pipeline images tourne en parallèle).
- **A11y native** : SVG accessibles, alt-text généré, MathML pour les rares formules complexes.

### Non-goals (explicitement)

- **Pas de Mathpix / OCR tiers spécialisé** en phase 2. Décision YAGNI : pour le niveau CESS, Vision Haiku 4.5 suffit à 90-95%. Les 5-10% d'erreurs sont **rattrapés par la review prof** (déjà en place). Cf section 8 "Future work" pour le seuil de reconsidération.
- **Pas de reconnaissance facial automatique** sur les images historiques (RGPD + ethique). Le prof identifie manuellement si besoin.
- **Pas de PDF Convert Mathpix** (replacement total du pipeline) : 2× plus cher pour gain marginal vu notre workflow validation-prof.
- **Pas de quiz géo SVG interactif** en phase 2 — repoussé phase 3 (cf section 8).

## 3. Architecture

### Vue d'ensemble : deux pipelines parallèles

```
                  ┌─────────────────────────────────────────────┐
                  │  PDF upload (route /api/courses/upload-url) │
                  └──────────────────┬──────────────────────────┘
                                     │
                  ┌──────────────────┴──────────────────────────┐
                  │  Trigger.dev task: generate-questions       │
                  │  (existing, on l'enrichit)                   │
                  └──────────────────┬──────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                  │
                    ▼                                  ▼
        ┌──────────────────────┐          ┌─────────────────────────┐
        │  Pipeline A (text)   │          │  Pipeline B (images)    │
        │  EXISTANT, inchangé  │          │  NOUVEAU                │
        │                      │          │                         │
        │  unpdf → texte       │          │  pdfjs canvas →         │
        │  Haiku TOC           │          │     images PNG          │
        │  Sonnet par chapitre │          │  Upload Supabase Storage│
        │  → teacher_questions │          │  Haiku Vision describe  │
        │                      │          │  Sonnet image-aware Q   │
        │  ~5 min              │          │  → teacher_questions    │
        │                      │          │     (avec image_url)    │
        │                      │          │  ~3 min (parallèle)     │
        └──────────────────────┘          └─────────────────────────┘
                    │                                  │
                    └────────────────┬─────────────────┘
                                     ▼
                  ┌─────────────────────────────────────────────┐
                  │  Toutes les questions visibles en validation │
                  │  prof. Badge "à vérifier" sur les questions  │
                  │  image-extraites confidence < 0.8.           │
                  └─────────────────────────────────────────────┘
```

### Pourquoi deux pipelines parallèles ?

- **UX perception** : le prof voit les premières questions texte ~30s après l'upload (chapitre 1 inséré). Si on attendait que les images soient traitées avant d'INSERT, on perdrait 3 min de perception.
- **Failure isolation** : si le pipeline images plante (image corrompue, Vision quota, etc.), les questions texte sont déjà persistées. Le prof a quelque chose à valider même si la moitié du job échoue.
- **Re-run sélectif** : on peut relancer **uniquement** le pipeline images sur un job déjà partiellement réussi, sans regénérer les questions texte.

## 4. Pipeline B — Composants détaillés

### 4.1 Extraction des images locales

**Lib** : `pdfjs-dist` (déjà en dep client, on l'utilise server-side via `canvas` polyfill sur Trigger.dev).

**Stratégie** :
- Itérer chaque page du PDF
- Pour chaque page, render à 150 DPI sur un canvas
- Détecter les régions image via les **PDFObject `getOperatorList()`** → opcodes `paintImageXObject` et `paintInlineImageXObject`
- Extraire chaque image en PNG buffer (avec bounding box + page number)

**Filtres anti-bruit** :
- Skip images < 100×100 px (probablement decoration/icon)
- Skip images > 4000×4000 px (probablement page entière scannée — gérer séparément)
- Skip images avec ratio aberrant (>10:1, lignes décoratives)

**Output** : tableau d'objets `{ pageNumber, bboxX, bboxY, width, height, pngBuffer, hash }` où `hash` = SHA-256 du buffer (dedup si la même image apparaît plusieurs fois).

**Performance attendue** : ~10s pour un PDF 200p avec 80 images (CPU-bound, canvas render).

### 4.2 Storage Supabase

Upload chaque image PNG dans le bucket existant `course-uploads/{courseId}/images/{hash}.png`.

- **Pourquoi `hash` et pas séquentiel** : dedup automatique. Une même image utilisée 5 fois dans le syllabus = 1 fichier.
- **Bucket privé** + RLS : seuls les utilisateurs avec accès au cours peuvent voir l'image.
- **Signed URLs** générées côté server à chaque affichage (expiration 1h).

Estimation stockage : 80 images × 200 KB moyenne = **16 MB par syllabus**. Supabase free tier = 1 GB → ~60 syllabi avant escalade. Pricing storage ensuite : $0.021/GB/mois — négligeable.

### 4.3 Description Vision Haiku 4.5

Pour chaque image, on call Anthropic Messages API avec :

```typescript
{
  model: "claude-haiku-4-5",
  max_tokens: 800,
  messages: [{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", data: pngBase64 } },
      { type: "text", text: VISION_DESCRIBE_PROMPT }
    ]
  }]
}
```

**`VISION_DESCRIBE_PROMPT`** (à raffiner après tests) :

```
Tu es un expert pédagogique. Décris cette image extraite d'un syllabus scolaire CESS belge.

Réponds en JSON strict :
{
  "type": "formula" | "diagram" | "scene_historical" | "map" | "molecule" | "cell_bio" | "religious_icon" | "photo" | "other",
  "subject_hint": "chimie" | "math" | "physique" | "biologie" | "histoire" | "geo" | "religion" | "francais" | "autre",
  "description": "Description factuelle en 2-4 phrases. Pour une scène : composition, époque, personnages visibles. Pour une formule : transcription textuelle. Pour une carte : type de carte, région, éléments légendés. Pour un schéma : ce qui est représenté, parties annotées.",
  "key_elements": ["liste", "des", "éléments", "identifiables"],
  "pedagogical_use": "Quel type de question pédagogique cette image permet (ex: 'identifier organites cellulaires', 'reconnaître scène historique', 'lire courbes de niveau').",
  "confidence": 0.0-1.0,
  "ocr_text": "Texte présent dans l'image, transcrit fidèlement (légendes, labels, formules)."
}
```

**Coût** : ~$0.001-0.002 par image (Haiku 4.5 vision). Pour 80 images × 100 syllabi/mois = **~$15/mois**. Acceptable.

**Confidence usage** :
- `confidence >= 0.8` → questions générées sans flag review
- `confidence < 0.8` → flag `needs_review = true`, badge orange UI prof

### 4.4 Génération de questions image-aware (Sonnet 4.6)

Pour chaque image décrite, on génère 1-3 questions via Sonnet :

```typescript
{
  model: "claude-sonnet-4-6",
  max_tokens: 2000,
  messages: [{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", data: pngBase64 } },
      { type: "text", text: IMAGE_QUESTION_PROMPT(imageMeta, chapterContext) }
    ]
  }]
}
```

**`IMAGE_QUESTION_PROMPT`** prend en input :
- La description Haiku (section 4.3)
- Le contexte du chapitre où l'image apparaît (texte des pages voisines)
- Le profil pédagogique (matière, niveau CESS)

**Stratégie anti-hallucination** : on force des questions **MCQ avec choix canoniques** pour les cas à risque (identification personnage/scène/lieu) :

- Pour une scène historique : 4 choix d'événements canoniques (Bastille, Révolution russe, Mai 68...)
- Pour un personnage : 4 figures de l'époque
- Pour une carte : 4 régions/concepts géo

Ça évite les questions ouvertes où l'élève répond "Napoléon" mais Sonnet attendait "Bonaparte" (faux négatif). MCQ verrouille la validation.

**Types possibles selon `type` Haiku** :
- `formula` → `numeric` ou `mcq` (calcul à partir de la formule)
- `diagram` / `cell_bio` → `mcq` (identifier élément annoté)
- `scene_historical` → `mcq` (événement / époque)
- `map` → `mcq` (lecture cartographique) ou `short_text` (nom propre)
- `molecule` → `mcq` (nom de la molécule / type de fonction)
- `religious_icon` → `mcq` (scène biblique)
- `photo` / `other` → MCQ générique sur le contenu visible

**Coût** : ~$0.01-0.02 par image × 80 images × 100 syllabi/mois = **~$120/mois Year 1**. Acceptable mais à monitorer.

**Optimisation** : ne pas générer de questions pour les images très simples (logos école, icônes décoratives). Le tag `type: "other"` + `confidence < 0.5` → on skip.

### 4.5 Insertion en base

Chaque question image-aware est insérée dans `teacher_questions` avec les champs additionnels :

- `image_url` : signed URL Supabase Storage
- `image_hash` : SHA-256 pour dedup côté DB
- `image_page_number` : page du PDF où l'image apparaît (debug/audit)
- `image_description_md` : description Haiku stockée (utilisée comme alt-text + contexte futur ré-génération)
- `image_confidence` : score Haiku
- `needs_review` : `image_confidence < 0.8`

Le snippet correspondant dans `content_snippets` reçoit aussi `image_url` (pour usage par le tuteur socratique futur).

## 5. Data Model — Migrations

### Migration 1 : `teacher_questions` enrichie

```sql
-- 2026-05-15-add-image-fields-to-teacher-questions.sql
alter table public.teacher_questions
  add column image_url text,
  add column image_hash text,
  add column image_page_number int,
  add column image_description_md text,
  add column image_confidence numeric(3,2),
  add column needs_review boolean not null default false;

-- Index pour la liste "questions à vérifier" dans l'UI prof
create index idx_teacher_questions_needs_review
  on public.teacher_questions (teacher_id, needs_review)
  where needs_review = true;

-- Comment d'audit
comment on column public.teacher_questions.needs_review is
  'Set true quand image_confidence < 0.8 lors de la generation. Le prof doit valider la question avant publication aux eleves.';
```

### Migration 2 : `content_snippets` enrichie

```sql
-- 2026-05-15-add-image-url-to-content-snippets.sql
alter table public.content_snippets
  add column image_url text,
  add column image_hash text;

-- Pas d'index needed : on filtre via source_kind déjà indexé
```

### Migration 3 : `pdf_extracted_images` (nouvelle table)

Table d'audit/dedup au niveau syllabus.

```sql
-- 2026-05-15-create-pdf-extracted-images.sql
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
  vision_type text check (vision_type in ('formula','diagram','scene_historical','map','molecule','cell_bio','religious_icon','photo','other')),
  created_at timestamptz not null default now()
);

create unique index uniq_pdf_extracted_images_course_hash
  on public.pdf_extracted_images (course_id, hash);

create index idx_pdf_extracted_images_job
  on public.pdf_extracted_images (job_id);

alter table public.pdf_extracted_images enable row level security;

-- Service role only INSERT/UPDATE (cf CLAUDE.md règle 8)
create policy "service_role only writes"
  on public.pdf_extracted_images
  for all
  to service_role
  using (true)
  with check (true);

-- Prof peut lire les images de ses propres cours
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

## 6. UI Changes

### 6.1 Page `/school/questions` — liste

- **Nouveau badge** sur la card question : `📷 Image` si `image_url is not null`
- **Nouveau filtre** dans la sidebar : "Avec image" (checkbox), à côté du filtre type
- **Bandeau "À vérifier"** en haut de la liste si `count(needs_review = true) > 0`, avec call-to-action "Vérifier N questions extraites d'images"

### 6.2 Formulaire d'édition question — quand `image_url` présent

- **Affichage de l'image** en haut du formulaire (largeur fluide, max 400px de haut, cliquable pour zoom modal)
- **Alt-text auto-généré** (`image_description_md`) affiché dans un champ éditable — le prof peut le corriger
- **Badge "Auto-extrait du PDF"** en gris avec date d'extraction
- **Si `needs_review = true`** : badge orange "Vérifier la transcription" en haut + bouton "Marquer comme vérifiée" qui passe `needs_review = false`

### 6.3 Quiz élève — affichage image dans question

Cf mockup `dashboard-eleve-session-mockup.html`. Insertion d'une `<figure>` dans le bloc "Énoncé" :

```tsx
{question.image_url && (
  <figure className="my-4">
    <img
      src={question.image_url}
      alt={question.image_description_md ?? "Illustration de l'exercice"}
      className="rounded-lg border border1 max-h-80 mx-auto"
    />
    {/* Caption optionnelle si description courte */}
  </figure>
)}
```

Pas de modification structurale du mockup — on ajoute juste le slot image dans le composant `<QuizQuestion>`.

## 7. Failure Modes & Mitigations

| Failure | Probabilité | Impact | Mitigation |
|---|---|---|---|
| pdfjs canvas crash sur PDF corrompu | Moyenne | Pipeline B fail, A continue | try/catch par page, skip page foireuse, log error |
| Vision Haiku rate limit (Tier 1) | Faible (Tier 2 maintenant) | Slowdown 3 → 5 min | concurrency cap 3, backoff exponentiel |
| Image > 5 MB (limite Anthropic) | Rare | Skip image | resize si > 4 MB avant call |
| Sonnet hallucine personnage/scène | Moyenne | Question incorrecte | MCQ canonique (cf 4.4) + needs_review si conf < 0.8 |
| Supabase Storage quota dépassé | Long terme | Upload échoue | alerte à 80% quota, plan upgrade Pro ($25/mois pour 100 GB) |
| Image corrompue / format exotique | Rare | Vision retourne null | skip + log, ne bloque pas le job |

## 8. Cost Analysis

### Coûts récurrents (par mois, Year 1 @ 100 syllabi/mois)

| Item | Coût/mois | Notes |
|---|---|---|
| Vision Haiku 4.5 (descriptions) | ~$15 | 80 images × 100 syllabi × $0.0015 |
| Sonnet 4.6 (questions image-aware) | ~$120 | 80 × 100 × $0.015 |
| Supabase Storage incrémental | ~$0.50 | 1.6 GB additionnels × $0.021/GB |
| **TOTAL pipeline B** | **~$135/mois** | $1 620/an |

À comparer au pipeline A actuel (~$50/mois). **Pipeline complet = ~$185/mois Year 1**.

### Coûts non récurrents

- Dev pipeline B : **~3 jours** (extraction, Vision, Sonnet, migrations, UI)
- Tests sur 5 syllabi multi-matières : **~0.5 jour**

### Coûts évités

- **Pas de Mathpix** : -$22/an (Image API) ou -$1 200/an (PDF Convert)
- **Pas de RDKit/OSRA hosting** : -$24/an
- **Pas de nouveau sous-processeur DPA** : -admin time récurrent

### Cost ceiling à monitorer

- Si Sonnet image-aware dépasse **$200/mois Year 1**, on review : (a) baisse de la qualité prompt, (b) skip plus d'images "decoration", (c) batch les images dans une seule call Sonnet.

## 9. Open Questions / Future Work

### Phase 3 (post-MVP, après benchmark sur 10 syllabi)

1. **Mathpix Image API ($22/an)** : à reconsidérer si >20% des questions sciences sont jugées fausses par les profs sur les formules. Seuil mesurable.
2. **MathML accessibilité native** : intégrable même sans Mathpix via KaTeX server-side qui convertit LaTeX (inline dans `image_description_md`) en MathML. ~0.5 jour dev.
3. **Géo SVG interactif** (d3-geo + TopoJSON FWB) : permettre quiz "clique sur la province" sur cartes muettes. ~2 jours dev, $0 coût récurrent.
4. **Imago Toolkit WASM** (chimie organique) : si Vision Haiku se plante mesurablement sur structures organiques complexes. Open source, hébergé client-side.
5. **Dédup transverse** : si deux syllabi de la même matière partagent des images (manuel commun), dedup au niveau `school_id` plutôt que `course_id`.

### Cas exclus volontairement

- **Reconnaissance faciale automatique** sur images historiques : interdit pour Maïa (RGPD + ethique). Le prof identifie manuellement.
- **OCR de manuscrit** : pas notre cas (syllabi typographiés).
- **Vidéo / GIF** : pas dans le scope PDF.

## 10. Self-Review

- ✅ **Placeholder scan** : aucun "TBD" ou "à compléter" dans le spec
- ✅ **Internal consistency** : pipeline B utilise les mêmes prompts + DB schema cités en sections 4-5-6
- ✅ **Scope check** : un seul livrable cohérent (pipeline images-aware) — pas de découpage en sous-projets nécessaire
- ✅ **Ambiguity check** : le seuil `confidence < 0.8` est explicite et chiffré, les types Haiku enum sont listés
- ✅ **Référence mockup** : section 6.3 cite explicitement `dashboard-eleve-session-mockup.html`
- ✅ **Règles CLAUDE.md** : migration 3 a `enable row level security` + service role policy (règle 8)
- ✅ **Never-DELETE principle** : aucun DELETE prévu — les `pdf_extracted_images` se cascadent via `course delete` mais c'est le `course` lui-même qui est supprimé (cas RGPD prévu)

---

**Validation prof requise avant implementation plan** : section 9 (future work) est-elle bien acceptable ou faut-il intégrer dès phase 2 (a) MathML ou (b) géo SVG ? Réponse attendue avant de générer le plan d'implémentation détaillé.
