# PDF Images Extraction Strategy — Design Spec v2

**Date** : 2026-05-15 (v2 update même jour)
**Status** : Draft v2
**Author** : Alex Bourdouxhe + Claudy
**Related** : `2026-05-14-pdf-extraction-design.md` (pipeline text-only existant)

## Changelog v1 → v2

- ✅ **MathML inclus phase 2** (KaTeX server-side, lib open source MIT — pas un sous-processeur).
- ✅ **Géo SVG cartes muettes inclus phase 2** (d3-geo + Natural Earth + OSM — tout libre de droits, sources européennes).
- ✅ **Imago Toolkit WASM inclus phase 2** (chimie organique côté client, MIT, EPAM Europe).
- ✅ **Taxonomy enrichie** : passe de 9 → 71 types pédagogiques (64 catégorisés + 7 à filtrer).
- ⏳ **Sonnet image-aware** : 3 options à benchmarker comme tâche 1 du plan d'implémentation.
- ⏳ **Confidence threshold** : 0.8 par défaut, recalibrage après 100 syllabi (curseur produit, pas vérité scientifique).

---

## 1. Contexte

Le pipeline actuel d'extraction PDF (livré 2026-05-14, PRs #50-#59) est **text-only** : `unpdf` extrait le texte, Haiku 4.5 génère un TOC, Sonnet 4.6 génère 5-15 questions par chapitre. **Aucune image n'est traitée** — schémas cellulaires, scènes historiques, formules chimiques, cartes géographiques, structures moléculaires sont tous ignorés.

Les founders ont remonté ce gap :

- **Laurent** : sigles math/intégrales/matrices, chimie organique, schémas biologie (cellule), notation physique.
- **Christophe** : scènes historiques, reconnaissance personnages, cartes géo (topographie, courbes de niveau, hygrométrie), schémas cellulaires, iconographie religieuse.

L'usage couvert correspond au niveau **CESS Belgique FWB** (16-18 ans) — secondaire supérieur, pas université. Les formules sont simples (équations 2nd degré, log/exp, dérivées élémentaires, réactions chimiques équilibrées). Les scènes/cartes/schémas sont typiques du programme.

## 2. Goals & Non-goals

### Goals (phase 2)

- **Extraire les images** de chaque syllabus PDF et les attacher aux questions / snippets pertinents.
- **Générer des questions image-aware** : "Identifie le personnage", "Quelle scène biblique est représentée ?", "Identifie l'organite cellulaire pointé".
- **Préserver le pipeline texte existant** (aucune régression sur les questions text-only).
- **Asynchrone** : pas de slowdown perçu sur l'upload PDF (pipeline B parallèle au A).
- **A11y native (WCAG 2.2 AA)** :
  - Alt-text généré pour chaque image (depuis description Haiku, éditable par le prof)
  - **MathML rendu** pour les formules (via KaTeX) — screen readers lisent la formule sémantiquement
  - **SVG sémantique** pour cartes (zoom 400% sans pixellisation, `<title>`/`<desc>` par région)
- **Géo SVG cartes muettes** (phase 2 basique) : afficher cartes vectorielles de Belgique/Wallonie/régions FWB pour les questions de géographie (rendu net même en zoom + a11y).
- **Imago Toolkit WASM** : afficher structures moléculaires 2D côté client à partir de SMILES.

### Non-goals (explicitement)

- **Pas de Mathpix / OCR tiers spécialisé**. Décision YAGNI confirmée : niveau CESS, Vision Haiku 4.5 suffit à 90-95%, validation prof rattrape les 5-10%. Pas de sous-processeur US supplémentaire. Reconsidération possible phase 3 si benchmark prouve > 20% d'échec sur formules sciences.
- **Pas de reconnaissance faciale automatique** sur images historiques (RGPD + éthique).
- **Pas de quiz géo SVG interactif avancé** (clic région, scoring temps réel) en phase 2 — repoussé phase 3. Phase 2 = affichage SVG vectoriel uniquement.
- **Pas de PDF Convert Mathpix** (replacement total) : 2× plus cher pour gain marginal vu validation prof.
- **Pas de mécanique physique** (forces, dynamique) en phase 2 — pas encore prioritaire.

## 3. Architecture

### Vue d'ensemble : deux pipelines parallèles

```
                  ┌─────────────────────────────────────────────┐
                  │  PDF upload (route /api/courses/upload-url) │
                  └──────────────────┬──────────────────────────┘
                                     │
                  ┌──────────────────┴──────────────────────────┐
                  │  Trigger.dev task: generate-questions       │
                  │  (existing, on l'enrichit)                  │
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
        │                      │          │  → teacher_questions    │
        │  ~5 min              │          │     (avec image_url)    │
        │                      │          │  ~3 min (parallèle)     │
        └──────────────────────┘          └─────────────────────────┘
                    │                                  │
                    └────────────────┬─────────────────┘
                                     ▼
                  ┌─────────────────────────────────────────────┐
                  │  Toutes les questions visibles en validation │
                  │  prof. Badge "à vérifier" sur les questions  │
                  │  image-extraites confidence < 0.8.           │
                  │  Render UI :                                 │
                  │   - Formules : KaTeX → MathML (a11y)         │
                  │   - Molécules : Imago WASM client            │
                  │   - Cartes : SVG d3-geo / Natural Earth      │
                  └─────────────────────────────────────────────┘
```

### Pourquoi deux pipelines parallèles ?

- **UX perception** : prof voit les premières questions texte ~30s après upload. Si on attendait les images, on perdrait 3 min de perception.
- **Failure isolation** : si pipeline images plante (image corrompue, Vision quota, etc.), les questions texte sont déjà persistées.
- **Re-run sélectif** : relancer uniquement pipeline B sur job partiellement réussi.

## 4. Pipeline B — Composants détaillés

### 4.1 Extraction des images locales (pdfjs canvas)

**Lib** : `pdfjs-dist` (déjà en dep client, on l'utilise server-side via `canvas` polyfill sur Trigger.dev).

**Stratégie** :
- Itérer chaque page du PDF
- Pour chaque page, render à 150 DPI sur un canvas
- Détecter régions image via `PDFPageProxy.getOperatorList()` → opcodes `paintImageXObject` et `paintInlineImageXObject`
- Extraire chaque image en PNG buffer (avec bounding box + page number)

**Filtres anti-bruit** :
- Skip images < 100×100 px (decoration/icon probable)
- Skip images > 4000×4000 px (page entière scannée — gestion séparée)
- Skip ratio aberrant (>10:1, lignes décoratives)

**Output** : tableau `{ pageNumber, bboxX, bboxY, width, height, pngBuffer, hash }` où `hash` = SHA-256 du buffer (dedup).

**Performance attendue** : ~10s pour PDF 200p avec 80 images.

### 4.2 Storage Supabase

Upload chaque image dans `course-uploads/{courseId}/images/{hash}.png`.

- **Hash naming** : dedup automatique transverse au syllabus
- **Bucket privé** + RLS (seuls les users avec accès au cours)
- **Signed URLs** server-side, expiration 1h

Estimation : 80 images × 200 KB = ~16 MB par syllabus. Free tier 1 GB → ~60 syllabi. Pricing au-delà : $0.021/GB/mois — négligeable.

### 4.3 Description Vision Haiku 4.5

Appel Anthropic Messages API avec image + prompt structuré :

```typescript
{
  model: "claude-haiku-4-5",
  max_tokens: 1000,
  messages: [{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", data: pngBase64 } },
      { type: "text", text: VISION_DESCRIBE_PROMPT }
    ]
  }]
}
```

**`VISION_DESCRIBE_PROMPT`** (skeleton, raffiné après tests) :

```
Tu es un expert pédagogique CESS Belgique FWB (5ème/6ème, 16-18 ans).
Décris cette image extraite d'un syllabus scolaire.

Réponds en JSON strict :
{
  "type": "<un type de la taxonomy ci-dessous>",
  "subject_hint": "chimie" | "math" | "physique" | "biologie" | "histoire" |
                  "geographie" | "religion" | "philosophie" | "francais" |
                  "neerlandais" | "anglais" | "allemand" | "latin" |
                  "economie" | "arts" | "musique" | "autre",
  "description": "Description factuelle en 2-4 phrases. Si formule : transcription textuelle (LaTeX si applicable). Si scène : composition, époque, personnages visibles. Si carte : type, région, éléments légendés. Si schéma : ce qui est représenté, parties annotées.",
  "key_elements": ["liste", "des", "éléments", "identifiables"],
  "pedagogical_use": "Quel type de question pédagogique cette image permet (ex: 'identifier organites cellulaires', 'reconnaître scène historique', 'lire courbes de niveau').",
  "confidence": 0.0-1.0,
  "ocr_text": "Texte présent dans l'image, transcrit fidèlement (légendes, labels, formules en LaTeX si math).",
  "latex_if_formula": "Pour type=formula_* : transcription LaTeX. Sinon null.",
  "smiles_if_molecule": "Pour type=molecule_organic : notation SMILES si identifiable. Sinon null.",
  "topojson_region_hint": "Pour type=map_* : nom région principale identifiée (ex: 'Belgique', 'Wallonie', 'Europe'). Sinon null."
}

Types disponibles (taxonomy CESS 71 entrées) : [LISTE ICI — cf section 4.4]
```

**Coût** : ~$0.001-0.002 par image (Haiku 4.5 vision). 80 images × 100 syllabi/mois = **~$15/mois**.

**Confidence usage** :
- `confidence >= 0.8` → questions sans flag
- `confidence < 0.8` → `needs_review = true`, badge orange UI prof

### 4.4 Taxonomy 71 types

Constante TypeScript partagée (`lib/pdf/image-types.ts`) :

```typescript
export const IMAGE_TYPES = [
  // === Sciences exactes ===
  "formula_math",                  // équation/intégrale/expression
  "graph_function",                // courbe f(x), nuage de points
  "geometric_figure",              // triangle, cercle, solide 3D
  "formula_physics_electric",      // loi d'Ohm, P=UI
  "circuit_diagram",               // schéma électrique
  "wave_graph",                    // onde, signal, oscillation
  "optics_diagram",                // rayon lumineux, lentille, miroir
  "thermodynamic_diagram",         // état gazeux, cycle thermique
  "formula_chemical_equation",     // réaction équilibrée
  "molecule_organic",              // structure 2D (benzène, alcane...)
  "molecule_inorganic",            // structure 3D, ions
  "lewis_structure",               // schéma de Lewis
  "periodic_table_excerpt",        // extrait ou complet
  "lab_apparatus",                 // bécher, distillation...

  // === Sciences du vivant ===
  "cell_diagram",                  // cellule + organites
  "anatomy_human",                 // corps humain (organe, système)
  "anatomy_animal",                // anatomie animale
  "anatomy_plant",                 // plante (racine, feuille, fleur)
  "chromosome_diagram",            // ADN, chromosome, mitose/méiose
  "family_tree_genetic",           // arbre généalogique génétique
  "ecosystem_diagram",             // chaîne alimentaire, biotope
  "food_chain",                    // réseau trophique
  "microscopic_image",             // photo microscope (cellule, tissu)
  "photo_animal",                  // photo animal en contexte
  "photo_plant",                   // photo plante en contexte
  "photo_mineral",                 // roche, minéral

  // === Histoire ===
  "scene_historical_painting",     // peinture représentant scène
  "scene_historical_photo",        // photo d'époque XIXe-XXIe
  "portrait_historical",           // portrait personnage
  "battle_scene",                  // bataille / guerre
  "daily_life_scene",              // vie quotidienne d'une époque
  "monument_architectural",        // bâtiment historique
  "archaeological_artifact",       // objet (poterie, arme, bijou)
  "document_historical",           // manuscrit, charte, traité, affiche
  "timeline_historical",           // frise chronologique

  // === Géographie ===
  "map_political",                 // frontières, pays
  "map_physical",                  // relief, altitude
  "map_climate",                   // zones climatiques
  "map_demographic",               // densité, migrations
  "map_economic",                  // flux, ressources, industries
  "map_topographic",               // courbes de niveau
  "map_hydrographic",              // réseau hydrographique, embouchure
  "map_historical",                // territoires d'époque
  "map_world",                     // planisphère
  "satellite_image",               // image satellite
  "geological_section",            // coupe géologique
  "weather_diagram",               // anticyclone, front
  "urban_diagram",                 // plan urbain

  // === Religion / philosophie ===
  "religious_painting",            // peinture religieuse
  "religious_icon",                // icône orthodoxe
  "biblical_scene",                // scène biblique
  "religious_symbol",              // croix, croissant, étoile
  "sacred_text_excerpt",           // extrait texte sacré
  "philosophical_portrait",        // portrait philosophe

  // === Langues / lettres ===
  "linguistic_table",              // conjugaison, déclinaisons
  "literary_excerpt",              // extrait texte littéraire
  "author_portrait",               // portrait écrivain
  "etymology_diagram",             // origine mot

  // === Arts ===
  "art_painting",                  // œuvre picturale non religieuse
  "art_sculpture",                 // sculpture
  "art_architecture",              // style architectural
  "music_score",                   // partition
  "musical_instrument",            // image instrument

  // === Économie / sociales ===
  "economic_chart",                // PIB, inflation, courbes
  "economic_flow_diagram",         // circuit économique
  "statistical_graph",             // histogramme, camembert, courbe stats
  "sociological_graph",            // pyramide des âges
  "legal_document_excerpt",        // extrait juridique

  // === Transversal / structurel ===
  "table_data",                    // tableau de mesures/données
  "concept_map",                   // carte conceptuelle
  "flowchart",                     // diagramme processus / décision
  "venn_diagram",                  // diagramme de Venn
  "tree_diagram",                  // arbre logique
  "pyramid_diagram",               // pyramide (Maslow, alimentaire)

  // === À skip (filtrer) ===
  "logo",
  "decoration",
  "icon",
  "header_footer",
  "qr_code",
  "barcode",
  "cover_page_element",
] as const;

export type ImageType = (typeof IMAGE_TYPES)[number];

export const SKIP_TYPES: ImageType[] = [
  "logo", "decoration", "icon", "header_footer",
  "qr_code", "barcode", "cover_page_element",
];

export const isSkipType = (t: ImageType): boolean => SKIP_TYPES.includes(t);
```

**Total** : **64 types pédagogiques + 7 types à skip = 71**.

### 4.5 Génération de questions image-aware (Sonnet 4.6) — À BENCHMARKER

3 options à comparer dans la **tâche 1 du plan d'implémentation** :

| Option | Pipeline | Coût/image | Qualité attendue |
|---|---|---|---|
| **A** (spec v1) | Haiku decrit + Sonnet text-only avec description en input | ~$0.006 | Bonne, mais Sonnet ne voit pas l'image |
| **B** | Sonnet 4.6 vision direct (1 call image+question) | ~$0.015 | Optimale (Sonnet voit + raisonne) |
| **C** | Haiku seul (vision + question en 1 call) | ~$0.002 | Faible (Haiku moins bon en pédagogie) |

**Méthodologie benchmark** :
- 10 images variées (formula_math, scene_historical_painting, cell_diagram, map_topographic, molecule_organic, religious_painting, lab_apparatus, statistical_graph, monument_architectural, anatomy_human)
- Générer questions avec chaque option
- Évaluation aveugle par Alex + 1 prof (matières concernées) sur 3 axes : (a) pertinence pédagogique, (b) qualité des distracteurs MCQ, (c) absence d'hallucination
- Score 1-5 par axe, moyenne pondérée
- Choix de l'option pour le pipeline final

**Décision provisoire (à confirmer par benchmark)** : option A si écart qualité < 20% vs B. Sinon option B.

**Stratégie anti-hallucination universelle** (toutes options) : forcer **MCQ avec choix canoniques** pour identification :
- Scène historique : 4 événements canoniques de la période
- Personnage : 4 figures de l'époque
- Carte : 4 régions/concepts géo
- Œuvre d'art : 4 styles/auteurs

Type de question selon `vision_type` :

| Vision type | Type question privilégié |
|---|---|
| `formula_*`, `geometric_figure` | `numeric` ou `mcq` (calcul/identification) |
| `*_diagram`, `cell_diagram`, `anatomy_*` | `mcq` (identifier élément annoté) |
| `scene_*`, `battle_scene`, `*_painting`, `*_icon` | `mcq` (événement/époque/scène) |
| `portrait_*`, `author_portrait`, `*_artifact` | `mcq` (personnage/objet/époque) |
| `map_*` | `mcq` ou `short_text` (lecture cartographique) |
| `molecule_*`, `lewis_structure` | `mcq` (nom de molécule, fonction) |
| `*_graph`, `*_chart`, `table_data` | `numeric` ou `short_text` (lecture de valeur) |
| `linguistic_table` | `short_text` (conjugaison/déclinaison) |

**Coût provisoire** (option A) : ~$0.005 × 80 images × 100 syllabi/mois = **~$40/mois**.
**Coût provisoire** (option B) : ~$0.015 × 80 × 100 = **~$120/mois**.

### 4.6 KaTeX server-side — LaTeX → MathML conversion

**Lib** : `katex` (MIT license, npm, lib pure, pas de service externe).

**Flow** :
- Haiku retourne `latex_if_formula` pour `vision_type ∈ {formula_math, formula_physics_electric, formula_chemical_equation}`
- Au save de la question, on convertit LaTeX → MathML server-side :
  ```typescript
  import katex from "katex";

  const mathml = katex.renderToString(latex, {
    output: "mathml",     // important : pas "html"
    throwOnError: false,  // fallback gracieux si LaTeX invalide
    displayMode: true,
  });
  ```
- Stockage `formula_latex` + `formula_mathml` en DB
- UI quiz : render directement `dangerouslySetInnerHTML={{ __html: mathml }}` (MathML est natif HTML5, safe)

**A11y bonus** : screen readers (NVDA, VoiceOver, JAWS) lisent MathML comme "intégrale de zéro à un de x au carré dx" au lieu d'une image opaque.

**Coût** : 0$, 0 dépendance externe, 0 sous-processeur.

### 4.7 Imago Toolkit WASM — chimie organique côté client

**Lib** : `@iqg/indigo-ketcher` (port WASM du toolkit Indigo, MIT license, EPAM).

**Flow** :
- Haiku retourne `smiles_if_molecule` pour `vision_type == "molecule_organic"` ou `lewis_structure`
- Stockage `molecule_smiles` en DB
- UI quiz : composant React `<MoleculeRenderer smiles={...} />` qui :
  - Lazy-load le module WASM Imago (~500 KB gzipped, une seule fois)
  - Render la structure 2D dans un `<svg>` cliquable
  - Alt-text auto-généré : "Structure moléculaire : {imageDescription}"

**Privacy** : SMILES + render reste **côté client uniquement**. Aucune molécule transmise à un service tiers.

**Coût** : 0$, 0 dépendance externe.

### 4.8 SVG géo cartes muettes (phase 2 basique)

**Sources** :
- `natural-earth-vector` npm (public domain, Natural Earth)
- TopoJSON FWB / Belgique extraits OSM (OdbL, commercial OK)
- d3-geo (BSD-3) pour projection / manipulation

**Stratégie phase 2** (minimal viable) :
- Haiku retourne `topojson_region_hint` pour `vision_type == map_*`
- Mapping côté server :
  ```typescript
  const REGION_TOPOJSON = {
    "Belgique": "/topojson/belgium.json",
    "Wallonie": "/topojson/wallonia.json",
    "Bruxelles": "/topojson/brussels.json",
    "Europe": "/topojson/europe.json",
    "Monde": "/topojson/world.json",
    // ...
  };
  ```
- Stockage `geo_topojson_path` (string) sur la question
- UI quiz : composant `<GeoMap topojsonPath={...} />` qui render SVG vectoriel via `react-simple-maps` (wrapper d3-geo)

**Phase 2 minimal** : affichage statique vectoriel uniquement (pas d'interaction clic).
**Phase 3** : interaction clic région, scoring, drag-drop labels.

**Privacy** : tous les TopoJSON servis depuis `public/topojson/` (statique). Aucun appel tiers à runtime.

**Coût** : 0$ (libs + données libres).

### 4.9 Insertion en base

Chaque question image-aware insérée dans `teacher_questions` avec champs additionnels :

- `image_url` : signed URL Supabase Storage
- `image_hash` : SHA-256 pour dedup
- `image_page_number` : page PDF source
- `image_description_md` : description Haiku (alt-text + contexte ré-génération)
- `image_confidence` : score Haiku
- `vision_type` : un des 71 types taxonomy
- `formula_latex` : nullable, LaTeX si formule
- `formula_mathml` : nullable, MathML rendu par KaTeX
- `molecule_smiles` : nullable, SMILES si molécule organique
- `geo_topojson_path` : nullable, chemin TopoJSON si carte
- `needs_review` : `image_confidence < 0.8`

Le snippet correspondant dans `content_snippets` reçoit aussi `image_url` (tuteur socratique futur).

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
  add column vision_type text,
  add column formula_latex text,
  add column formula_mathml text,
  add column molecule_smiles text,
  add column geo_topojson_path text,
  add column needs_review boolean not null default false;

-- Pas de CHECK constraint sur vision_type : la validation est cote app
-- (IMAGE_TYPES constante TS, evolutive sans migration). Comment cle pour audit.
comment on column public.teacher_questions.vision_type is
  'Un des 71 types definis dans lib/pdf/image-types.ts (IMAGE_TYPES).';

comment on column public.teacher_questions.needs_review is
  'Set true quand image_confidence < 0.8 lors de la generation. Le prof doit valider la question avant publication aux eleves.';

create index idx_teacher_questions_needs_review
  on public.teacher_questions (teacher_id, needs_review)
  where needs_review = true;
```

### Migration 2 : `content_snippets` enrichie

```sql
-- 2026-05-15-add-image-url-to-content-snippets.sql
alter table public.content_snippets
  add column image_url text,
  add column image_hash text;
```

### Migration 3 : `pdf_extracted_images` (nouvelle table audit/dedup)

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

## 6. UI Changes

### 6.1 Page `/school/questions` — liste

- **Badge image** sur card question : `📷 Image` si `image_url is not null`
- **Filtre "Avec image"** dans sidebar (checkbox), à côté du filtre type
- **Bandeau "À vérifier"** en haut de liste si `count(needs_review = true) > 0`, CTA "Vérifier N questions extraites d'images"

### 6.2 Formulaire d'édition — quand image présente

- **Affichage image** en haut du formulaire (max 400px haut, cliquable pour zoom modal)
- **Alt-text auto-généré** (`image_description_md`) en champ éditable
- **Badge "Auto-extrait du PDF"** gris + date
- **Si `needs_review = true`** : badge orange "Vérifier la transcription" + bouton "Marquer comme vérifiée"
- **Render selon `vision_type`** :
  - `formula_*` → render KaTeX (preview MathML) sous l'image
  - `molecule_organic` → render Imago WASM (preview SMILES)
  - `map_*` → render SVG TopoJSON (preview géo)

### 6.3 Quiz élève — affichage image dans question

Cf mockup `dashboard-eleve-session-mockup.html`. Insertion `<figure>` dans bloc "Énoncé" :

```tsx
{question.image_url && (
  <figure className="my-4">
    {question.formula_mathml && (
      <div
        className="my-2 text-center"
        dangerouslySetInnerHTML={{ __html: question.formula_mathml }}
      />
    )}
    {question.molecule_smiles && (
      <MoleculeRenderer smiles={question.molecule_smiles} className="mx-auto" />
    )}
    {question.geo_topojson_path && (
      <GeoMap topojsonPath={question.geo_topojson_path} className="mx-auto max-w-md" />
    )}
    {!question.formula_mathml && !question.molecule_smiles && !question.geo_topojson_path && (
      <img
        src={question.image_url}
        alt={question.image_description_md ?? "Illustration de l'exercice"}
        className="rounded-lg border border1 max-h-80 mx-auto"
      />
    )}
  </figure>
)}
```

Pas de modification structurale du mockup — slot image dans `<QuizQuestion>`.

## 7. Failure Modes & Mitigations

| Failure | Probabilité | Impact | Mitigation |
|---|---|---|---|
| pdfjs canvas crash sur PDF corrompu | Moyenne | Pipeline B fail, A continue | try/catch par page, skip, log |
| Vision Haiku rate limit | Faible (Tier 2) | Slowdown 3 → 5 min | concurrency cap 3, backoff exponentiel |
| Image > 5 MB (limite Anthropic) | Rare | Skip image | resize si > 4 MB avant call |
| Sonnet hallucine identification | Moyenne | Question incorrecte | MCQ canoniques (cf 4.5) + needs_review si conf < 0.8 |
| KaTeX échoue sur LaTeX invalide | Faible | Pas de MathML rendu | `throwOnError: false`, fallback alt-text |
| Imago WASM ne reconnaît pas SMILES | Moyenne | Pas de render molécule | fallback affichage image PNG originale |
| TopoJSON région non mappée | Moyenne | Pas de SVG géo | fallback affichage image PNG originale |
| Supabase Storage quota dépassé | Long terme | Upload échoue | alerte à 80%, plan upgrade Pro ($25/mois pour 100 GB) |

## 8. Cost Analysis

### Coûts récurrents (par mois, Year 1 @ 100 syllabi/mois)

| Item | Coût/mois | Notes |
|---|---|---|
| Vision Haiku 4.5 (descriptions) | ~$15 | 80 images × 100 syllabi × $0.0015 |
| Sonnet image-aware (option A provisoire) | ~$40 | À confirmer post-benchmark |
| Supabase Storage incrémental | ~$0.50 | 1.6 GB additionnels × $0.021/GB |
| KaTeX server-side | $0 | Lib npm |
| Imago WASM client-side | $0 | Lib npm |
| Géo SVG (libs + TopoJSON) | $0 | Public domain / open source |
| **TOTAL pipeline B (option A)** | **~$55/mois** | $660/an |
| **TOTAL pipeline B (option B)** | **~$135/mois** | $1 620/an (à confirmer benchmark) |

À comparer pipeline A actuel (~$50/mois). **Pipeline complet (A + B option A) = ~$105/mois Year 1**.

### Coûts non récurrents

- Dev pipeline B : **~5 jours** (extraction + Vision + Sonnet + KaTeX + Imago + géo SVG + migrations + UI)
- Benchmark Sonnet image-aware (3 options) : **~1 jour**
- Tests sur 5 syllabi multi-matières : **~0.5 jour**

### Coûts évités (justification YAGNI)

- **Pas de Mathpix** : -$22/an (Image API) ou -$1 200/an (PDF Convert)
- **Pas de RDKit/OSRA hosting** : -$24/an
- **Pas de nouveau sous-processeur DPA** : -admin time récurrent

### Cost ceiling à monitorer

- Si Sonnet image-aware dépasse **$200/mois Year 1** (option B sustained), on review : (a) baisse qualité prompt, (b) skip plus d'images decoration, (c) batch 5 images dans 1 call Sonnet.

## 9. Open Questions / Future Work

### Phase 3 (post-MVP, après benchmark sur 100 syllabi)

1. **Mathpix Image API ($22/an)** : reconsidération si >20% des questions sciences sont jugées fausses sur formules.
2. **Géo SVG interactif avancé** : clic région, scoring temps réel, drag-drop labels.
3. **Dédup transverse `school_id`** : si deux syllabi de la même matière partagent images (manuel commun).
4. **OSRA / MolScribe** : si Imago échoue mesurablement sur structures organiques complexes.
5. **Mécanique physique** (forces, dynamique) : ajout taxonomie + types adaptés.

### Cas exclus définitivement

- **Reconnaissance faciale automatique** : RGPD + éthique.
- **OCR de manuscrit élève** : pas notre cas.
- **Vidéo / GIF** : hors scope PDF.

## 10. Self-Review v2

- ✅ **Placeholder scan** : aucun "TBD"
- ✅ **Internal consistency** : tous les composants (4.6 KaTeX, 4.7 Imago, 4.8 géo SVG) référencés dans data model (5) et UI (6)
- ✅ **Scope check** : un seul livrable cohérent (pipeline images-aware phase 2)
- ✅ **Ambiguity check** : seuils chiffrés, types enum listés, benchmark méthodologie explicite
- ✅ **Référence mockup** : section 6.3 cite `dashboard-eleve-session-mockup.html`
- ✅ **Règles CLAUDE.md** : migration 3 a RLS + service role policy (règle 8), CHECK constraint replacé par comment + validation côté app pour évolutivité taxonomy (justification doc)
- ✅ **Never-DELETE principle** : `pdf_extracted_images` cascade via course delete uniquement (RGPD prévu)
- ✅ **Distinction lib vs API** : KaTeX/Imago/d3-geo sont libs embarquées (pas sous-processeur), Mathpix exclu (était la seule vraie API US payante)

---

**Validation prof requise avant implementation plan** :
- Tâche 1 du plan = benchmark Sonnet image-aware (3 options) sur 10 images
- Tu valides la méthodologie benchmark (section 4.5) avant qu'on génère le plan ?
