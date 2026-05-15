# Maïa — Design System Master

> **Source de vérité** pour le design Maïa. Toute page conçue dans le repo doit respecter ce document. Les pages spécifiques peuvent surcharger via `design-system/pages/<nom-page>.md` (pattern Master + Overrides du skill `ui-ux-pro-max`).
>
> Généré le **2026-05-15** sur la base des arbitrages produit + skill `anthropic-skills:ui-ux-pro-max` (knowledge loaded in context, script Python non accessible dans cet env).

---

## Projet

**Nom** : Maïa
**Type** : Edtech secondaire — plateforme de renforcement adaptive
**Audience mixte** :
- Élèves 12-18 ans (secondaire FW-B Belgique) — usage mobile-first (BYOD / tablette / phone école)
- Profs 30-60 ans — usage desktop-first (préparation cours, curation, suivi classe), responsive nécessaire
- Directions école 40-60 ans (pilotes) — usage occasionnel desktop
**Mood** : sérieux pédagogique, encourageant, factuel, jamais infantile, jamais commercial
**Différenciateur visuel** : tuteur Maïa (touche violette + emojis) distinct du chrome plateforme (Lucide + neutres)

## Style global

**Pattern** : Minimaliste flat moderne, content-first
**Référence visuelle** : Linear / Notion / Vercel — pas Duolingo, pas Khan Academy infantile, pas Schoolio legacy
**Density tolerance** : 2 niveaux (Élève aéré / Prof compact) — voir §Spacing

**Anti-patterns interdits** :
- ❌ Glassmorphism / blur excessif (perf mobile + accessibilité contraste)
- ❌ Skeuomorphism / neumorphism (visuellement daté)
- ❌ Brutalism / décor excessif (ado-pas-jeune, prof apprécie le calme)
- ❌ Gradient marketing flashy (mood manifeste, pas SaaS-eager-to-sell)
- ❌ Emojis comme icônes UI (Lucide-only, voir mémoire `feedback_lucide_icons_except_tutor`)
- ❌ Skins gamification (laurel, helmet, samurai, Bronze/Silver/Gold — supprimer)
- ❌ Courbes décoratives type Duolingo (infantilise)
- ❌ Label "IA" / "l'IA" user-facing (voir mémoire `feedback_no_ia_label_in_ux`)

---

## Couleurs (palette officielle Maïa)

Base **Tailwind 4** (déjà installée), tokens semantiques mappés sur les classes natives.

### Primary
- `primary-DEFAULT` : `indigo-600` `#4F46E5` — boutons CTA, links actifs, focus rings
- `primary-hover` : `indigo-700` `#4338CA`
- `primary-pressed` : `indigo-800` `#3730A3`
- `primary-bg-subtle` : `indigo-50` `#EEF2FF` (badges, hover lines)
- `primary-dark-mode` : `indigo-500` `#6366F1` (compense baisse de contraste en dark)

### Accent (encouragement, success discret)
- `accent-DEFAULT` : `emerald-500` `#10B981` — réussites, mastery élevée, validation
- `accent-hover` : `emerald-600` `#059669`
- `accent-bg-subtle` : `emerald-50` `#ECFDF5`

### Tuteur Maïa (persona distincte)
- `tutor-DEFAULT` : `violet-500` `#8B5CF6` — uniquement dans TutorPanel + messages du tuteur
- `tutor-bg-subtle` : `violet-50` `#F5F3FF`
- `tutor-icon` : `violet-600` `#7C3AED`
- **Note** : SEULE zone où les emojis sont autorisés (dans le contenu textuel des messages)

### Heatmap diverging (mastery)
**Couleurs sémantiques de la maîtrise** (élève aéré, max 3-5 alertes simultanées per mémoire `feedback_heatmap_no_overwhelm`) :

| Mastery | Token | Hex | Usage |
|---|---|---|---|
| 0-30% (lacune prioritaire) | `mastery-low` | `rose-500` `#F43F5E` | Top 3-5 concepts alertes uniquement |
| 30-60% (en cours) | `mastery-mid` | `amber-400` `#FBBF24` | Concepts en progression |
| 60-100% (acquis) | `mastery-high` | `emerald-500` `#10B981` | Concepts maîtrisés |
| Non-prioritaire | `mastery-neutral` | `slate-200` `#E2E8F0` | Toutes les autres lacunes, ne pas alerter |

**Heatmap pour le prof (compact)** : utiliser une saturation plus vive car la heatmap classe doit être exhaustive (mémoire `feedback_heatmap_no_overwhelm` autorise vue exhaustive côté prof).

### Erreur / Danger (destructive)
- `danger-DEFAULT` : `red-600` `#DC2626` — uniquement actions destructives (delete, archive, suppression compte)
- `danger-bg-subtle` : `red-50` `#FEF2F2`
- `danger-text-subtle` : `red-700` `#B91C1C` (pour messages d'erreur dans formulaires)

### Live indicator (twitch pulse, élèves uniquement, discret)
- `live-DEFAULT` : `red-500` `#EF4444` — badge "Live en cours" sur `/accueil` élève
- Animation : pulse subtil 2s loop, opacity 0.8 → 1.0 → 0.8
- **Pas** côté prof — le prof voit son propre live, pas besoin d'attirer l'attention

### Surfaces — Light mode
- `surface-bg` : `slate-50` `#F8FAFC` — fond page
- `surface-card` : `white` `#FFFFFF` — cards, modals
- `surface-elevated` : `white` + `shadow-md`
- `surface-border` : `slate-200` `#E2E8F0`
- `surface-border-strong` : `slate-300` `#CBD5E1` (focus, sélection)
- `text-primary` : `slate-900` `#0F172A`
- `text-secondary` : `slate-600` `#475569`
- `text-tertiary` : `slate-500` `#64748B`
- `text-disabled` : `slate-400` `#94A3B8`

### Surfaces — Dark mode
- `surface-bg` : `slate-950` `#020617`
- `surface-card` : `slate-900` `#0F172A`
- `surface-elevated` : `slate-800` `#1E293B`
- `surface-border` : `slate-800` `#1E293B`
- `surface-border-strong` : `slate-700` `#334155`
- `text-primary` : `slate-100` `#F1F5F9`
- `text-secondary` : `slate-300` `#CBD5E1`
- `text-tertiary` : `slate-400` `#94A3B8`
- `text-disabled` : `slate-500` `#64748B`

### Contrastes (WCAG)
- Toute paire foreground/background respecte **AA 4.5:1** minimum pour le texte courant
- **AAA 7:1** pour les éléments critiques (boutons primary, messages d'erreur)
- Dark mode validé indépendamment (pas une simple inversion)

---

## Typographie

### Paire Google Fonts

**Recommandation pour edtech mixte ados/profs FW-B** :

- **Heading + Body : Inter** (variable font, 18kb)
  - Standard industry pour app UI (Linear, Vercel, Stripe, GitHub)
  - Lisibilité exceptionnelle 12px-48px
  - Variable weight 100-900 dans un seul fichier
  - Supporte tabular-nums (essentiel heatmaps + stats)
  - Caractères FR/NL/DE corrects
  - Neutre = ne distrait pas, respecté par ados ET profs

- **Math/code : JetBrains Mono** (pour KaTeX déjà installé)
  - Coexiste avec KaTeX (formules)
  - Variantes pour ligatures math

**Pourquoi Inter en mono-famille** (heading + body) :
1. Performance : 1 download (~18kb woff2 variable), pas de FOIT
2. Cohérence visuelle : pas de "saut" entre H et body
3. Maintenance : 1 famille à gérer
4. Validé par les références produit (Linear/Vercel/Notion l'utilisent)
5. Évite l'écueil "polices d'enseignement mignonnes" (Comic Sans territory) qui sape la crédibilité

### Échelle (modular 1.25)

| Token | Taille | Line-height | Usage |
|---|---|---|---|
| `text-xs` | 12px | 1.4 | Métadonnées, labels chip, captions |
| `text-sm` | 14px | 1.5 | Body secondaire, helper text, tableau prof compact |
| `text-base` | 16px | 1.6 | Body principal (élève + prof), inputs |
| `text-lg` | 18px | 1.55 | Sub-headings, intro paragraph |
| `text-xl` | 20px | 1.5 | Card titles |
| `text-2xl` | 24px | 1.4 | Section headings (h2) |
| `text-3xl` | 30px | 1.3 | Page headings (h1) |
| `text-4xl` | 36px | 1.2 | Landing hero |
| `text-5xl` | 48px | 1.1 | Landing hero XL |

### Weights
- `font-normal` (400) — body
- `font-medium` (500) — labels, links
- `font-semibold` (600) — headings, buttons
- `font-bold` (700) — emphasis, brand "Maïa"

### Tabular numbers
Toujours `font-variant-numeric: tabular-nums` sur :
- Heatmap cells (%)
- Stats dashboards (KPI numbers)
- Live timers (compte à rebours)
- Prix / dates / scores
- Tables de données (curation, classes)

### Letter spacing
- Body : default
- Headings : `tracking-tight` (-0.025em)
- Brand "Maïa" : `tracking-tight` + `font-bold`

---

## Spacing — Système 4pt/8pt

**Échelle exhaustive** (cohérente avec Tailwind 4) :

| Token | Pixels | Usage |
|---|---|---|
| `1` | 4px | Gap entre micro-éléments |
| `2` | 8px | Padding interne badges |
| `3` | 12px | Gap entre items compacts |
| `4` | 16px | Padding par défaut |
| `5` | 20px | Padding cards compact (prof) |
| `6` | 24px | Padding cards aéré (élève) |
| `8` | 32px | Section breaks |
| `10` | 40px | Page padding mobile |
| `12` | 48px | Page padding desktop |
| `16` | 64px | Hero verticals |
| `24` | 96px | Landing sections |

### Densités

**Élève aéré (priorité respiration)** :
- Page padding : `p-6` (24px) mobile, `p-12` (48px) desktop
- Card padding : `p-6` (24px)
- Gap entre sections : `gap-6` (24px) à `gap-8` (32px)
- Line-height body : `leading-relaxed` (1.625)
- Touch targets : `min-h-12` (48px) — au-delà du 44pt minimum, plus confortable ado

**Prof compact (priorité densité info)** :
- Page padding : `p-4` (16px) mobile, `p-8` (32px) desktop
- Card padding : `p-4` à `p-5` (16-20px)
- Gap entre sections : `gap-4` (16px)
- Line-height body : `leading-normal` (1.5)
- Touch targets : `min-h-10` (40px) sur desktop OK, mobile reste `min-h-12`

**Activation** : via class root sur layout `<body data-density="aere|compact">` ou prop sur `<Layout density={role === 'student' ? 'aere' : 'compact'}>`.

---

## Layout & breakpoints

### Breakpoints (Tailwind defaults conservés)
- `sm` : 640px (large mobile / small tablet)
- `md` : 768px (tablet portrait)
- `lg` : 1024px (tablet landscape / small laptop)
- `xl` : 1280px (desktop)
- `2xl` : 1536px (large desktop)

### Container max-widths
- Élève (`/accueil` mobile-first) : `max-w-md` (448px) mobile, `max-w-6xl` (1152px) desktop
- Prof (`/accueil` desktop-first) : `max-w-7xl` (1280px) desktop, full mobile
- Pages publiques (landing, legal) : `max-w-6xl` (1152px)

### Navigation patterns

**Desktop (≥ `lg`)** :
- **Sidebar gauche unifiée role-aware** — largeur 256px expandable, 64px collapsed
- Items principaux avec icône Lucide + label
- État actif : `bg-primary-bg-subtle` + `text-primary` + bordure gauche
- Section "Mon compte" en bas (avatar + user-menu dropdown modal)

**Mobile (< `lg`)** :
- **Bottom nav pour tous (élève + prof)** — 5 items max, hauteur 64px
- Icônes Lucide + label compact (text-xs)
- État actif : `text-primary` + fond `primary-bg-subtle`
- Top app bar minimal (logo Maïa, avatar user-menu)

**Items nav élève** (4-5 max) :
- Accueil (`/accueil`) — icône `House`
- Devoirs (`/accueil/devoirs`) — icône `Mail`
- Plan Maïa (`/accueil/plan-maia`) — icône `Sparkles`
- Cours (`/accueil/cours`) — icône `BookOpen`
- (post-MVP) Notifications — icône `Bell`

**Items nav prof** (5-6 max) :
- Accueil (`/accueil`) — icône `House`
- Classes (`/accueil/classes`) — icône `Users`
- Curation (`/accueil/curation`) — icône `CheckSquare`
- Cours (`/accueil/cours`) — icône `BookOpen`
- Import (`/accueil/import`) — icône `Upload`
- Horaire (`/accueil/horaire`) — icône `Calendar`

### Z-index scale
- `0` : flow base
- `10` : sticky header, sidebar
- `20` : dropdowns, tooltips
- `30` : popovers
- `40` : modal backdrop
- `50` : modals, sheets
- `60` : toasts
- `100` : critical alerts (badge "Live en cours" pulse)

---

## Effets visuels

### Animations
- **Durée standard** : `200ms`
- **Easing standard** : `cubic-bezier(0.16, 1, 0.3, 1)` — ease-out quint (validé Alex)
- **Easing fast exit** : `cubic-bezier(0.4, 0, 1, 1)` — ease-in pour fermetures (~70% durée enter, soit `140ms`)
- **Entrée page** : crossfade 200ms
- **Modal/sheet** : scale 0.96→1 + opacity 0→1 sur 200ms
- **Hover** : color/bg transition 150ms only
- **Pas d'animation transform width/height** (CLS killer)

### Live pulse (élèves uniquement)
- Animation `pulse-live` : `opacity 0.8 → 1.0 → 0.8` sur 2s loop infinite
- Préférence `prefers-reduced-motion: reduce` : remplace par fade-in unique puis statique

### Shadows
- `shadow-xs` : `0 1px 2px 0 rgb(0 0 0 / 0.05)` — barre/divider subtile
- `shadow-sm` : `0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.04)` — cards aérées
- `shadow-md` : `0 4px 6px -1px rgb(0 0 0 / 0.08)` — modals, dropdowns
- `shadow-lg` : `0 10px 15px -3px rgb(0 0 0 / 0.10)` — sheets, popovers
- Dark mode : remplacer par `ring-1 ring-white/5` (les shadows fonctionnent mal en dark)

### Border radius
- `rounded-sm` : 4px (badges, chips)
- `rounded-md` : 6px (buttons, inputs)
- `rounded-lg` : 8px (cards, modals)
- `rounded-xl` : 12px (cards aérées élève, hero)
- `rounded-full` : avatars, badges status

### Focus rings (accessibilité critique)
- Toujours visible (jamais `outline-none` sans alternative)
- `ring-2 ring-primary-DEFAULT ring-offset-2 ring-offset-surface-bg`
- 4-5px d'épaisseur visuelle totale

---

## États interactifs (consistency)

Chaque composant interactif doit définir :

| État | Style |
|---|---|
| `default` | Base |
| `hover` (desktop only) | Color shift -100 (e.g. `indigo-600` → `indigo-700`) + cursor pointer |
| `pressed/active` | Color shift -200 (e.g. `indigo-700` → `indigo-800`) |
| `focus-visible` | Ring 2px primary |
| `disabled` | Opacity 0.5 + cursor not-allowed + no hover |
| `loading` | Spinner `Loader2` Lucide en rotation + texte "Chargement…" si bouton |

**Press feedback haptique** (PWA mobile) : `navigator.vibrate(10)` sur actions principales (envoi devoir, validation question). Respect `prefers-reduced-motion` désactive.

---

## Iconographie

**Lucide-react uniquement**, stroke 1.5px par défaut, sauf :
- Tuteur Maïa : peut inclure emojis dans le contenu textuel (💡 ✨ 🎯 — pas plus)
- KaTeX gère ses propres glyphes math

**Mapping icônes courantes** (à respecter pour cohérence) :
- Devoirs : `Mail`
- Accueil/Home : `House`
- Classes : `Users`
- Curation : `CheckSquare`
- Cours : `BookOpen`
- Import : `Upload`
- Horaire : `Calendar`
- Live : `Radio`
- Plan Maïa : `Sparkles`
- Notifications : `Bell`
- Compte : `UserCircle`
- Paramètres : `Settings`
- Recherche : `Search`
- Indice tuteur : `Lightbulb`
- Validation : `Check`
- Erreur : `XCircle`
- Avertissement : `AlertTriangle`
- Info : `Info`
- Charger plus : `ChevronDown`
- Fermer : `X`
- Retour : `ArrowLeft`

**Tailles** :
- Mini badge : `size={14}`
- Inline body : `size={16}` (défaut)
- Header/menu : `size={20}`
- CTA primary : `size={18}`
- Empty state hero : `size={48}` ou `size={64}`

---

## Composants standards (référence)

### Boutons

**Variants** :
- `primary` : bg `indigo-600`, text `white`, hover `indigo-700`, focus ring 2px
- `secondary` : bg `white`, border `slate-300`, text `slate-900`, hover `slate-50`
- `ghost` : bg transparent, text `slate-700`, hover `slate-100`
- `danger` : bg `red-600`, text `white`, hover `red-700` — destructive only, jamais primary par défaut
- `link` : text `indigo-600`, underline on hover, pas de bg

**Sizes** :
- `sm` : `h-9 px-3 text-sm` (36px) — tableaux prof
- `md` : `h-10 px-4 text-sm` (40px) — défaut prof
- `lg` : `h-12 px-6 text-base` (48px) — défaut élève + CTA principal partout

### Inputs

- Hauteur minimum élève : `h-12` (48px touch target)
- Hauteur prof compact : `h-10` (40px)
- Border `slate-300`, focus `ring-2 ring-primary-DEFAULT border-primary-DEFAULT`
- Helper text en dessous (toujours réservé l'espace pour éviter CLS)
- Error text `text-red-600 text-sm` en dessous

### Cards

- `rounded-lg shadow-sm border border-slate-200`
- Densité élève : `p-6` (24px)
- Densité prof : `p-4` à `p-5`
- Hover (interactive) : `shadow-md transition-shadow`
- Selected state : `ring-2 ring-primary-DEFAULT`

### Modals / Sheets

- Backdrop : `bg-slate-900/50` light, `bg-black/70` dark
- Modal max-width : `max-w-md` (form) / `max-w-2xl` (content) / `max-w-4xl` (concept editor curation)
- Bottom sheet mobile : `rounded-t-2xl`, slide-up 200ms
- Trap focus, escape closes, click-outside closes (avec confirmation si unsaved changes)

### Forms

- Label visible au-dessus de l'input (pas placeholder-only)
- Required = `*` rouge après le label
- Helper text persistant (pas seulement on error)
- Erreur sous le champ + `aria-live="polite"` + focus auto sur 1er invalid
- Submit en bas, primary action à droite (desktop) / pleine largeur (mobile)

---

## Modes d'usage (par rôle)

### Mode Élève (aéré, mobile-first)
- Container `max-w-md` mobile, `max-w-6xl` desktop
- Densité aérée
- Police body `text-base` (16px) minimum (anti zoom iOS)
- Touch targets `min-h-12`
- Heatmap throttlée 3-5 alertes max simultanées
- Tuteur Maïa = persona distincte (violet + emojis OK)
- Vocabulaire : adulte bienveillant, "Bonjour Mathéo", jamais infantile

### Mode Prof (compact, desktop-first)
- Container `max-w-7xl`
- Densité compact
- Tables denses OK, tabular-nums activé
- Touch targets desktop `min-h-10`, mobile `min-h-12`
- Heatmap classe exhaustive (pas de throttle)
- Vocabulaire : adulte professionnel, pédagogique, précis

### Mode Public (landing, légal)
- Container `max-w-6xl`
- Hero `text-5xl`, body `text-lg`
- Ton manifeste, pas commercial
- Pas de pricing visible (mémoire `feedback_no_pricing_public`)
- CTA `/pilotes` (mailto `pilotes@maia.app` + mini form)

### Mode Tuteur Maïa (intégré dans quiz élève)
- **Seule zone où les emojis sont autorisés** (1-2 max par message)
- Accent couleur `violet-500`
- Icônes : `Lightbulb` (indice), `Sparkles` (astuce), `Target` (objectif), `BookOpen` (théorie)
- Ton chaleureux mais socratique (jamais donner la réponse, max 2 indices per mémoire `feedback_tutor_max_2_hints`)
- Animations entrée messages : slide-up + opacity 0→1, 200ms ease-out quint

---

## Accessibility checklist (WCAG AA minimum)

Toute page conçue doit valider :

- [ ] Contraste 4.5:1 texte (3:1 large/UI)
- [ ] Focus visible sur tout interactif
- [ ] Tab order match l'ordre visuel
- [ ] Icon-only buttons → `aria-label`
- [ ] Forms : labels visibles, aria-describedby pour helper/error
- [ ] Heading hierarchy h1→h2→h3 sans saut
- [ ] Couleur pas seul porteur de sens (icône/texte en plus)
- [ ] `prefers-reduced-motion` respecté
- [ ] Touch target 44pt min (48pt élève)
- [ ] `lang="fr"` sur `<html>` (FR MVP)
- [ ] Live regions pour notifications/erreurs : `aria-live="polite"`
- [ ] Skip-to-main link sur layout sticky

---

## Performance budget (Core Web Vitals)

- **LCP** < 2.5s (target 1.8s)
- **CLS** < 0.1 (target 0.05)
- **INP** < 200ms (target 100ms)
- **TTFB** < 800ms
- Bundle JS first-load < 200kb gzipped
- Images : `next/image` obligatoire, AVIF/WebP, srcset
- Font preload Inter variable + JetBrains Mono uniquement

---

## Page-specific overrides

Si une page a des règles spécifiques qui dérogent au MASTER, créer un fichier dans `design-system/pages/<nom-page>.md`. Le harness UI doit prioritiser le fichier page-specific s'il existe.

Exemples envisageables :
- `design-system/pages/landing.md` — hero plus expressif, sections marketing
- `design-system/pages/quiz.md` — fullscreen, distraction-free, palette tuteur dominante
- `design-system/pages/live.md` — palette dark forcée (projection classe), font large
- `design-system/pages/heatmap-prof.md` — densité ultra-compacte, palette diverging vive

---

## Source de vérité — versioning

Ce document doit être mis à jour à chaque arbitrage produit qui touche le visuel global. Tout PR qui modifie le système doit modifier ce fichier ET citer la décision dans le commit message.

**Mémoires Maïa liées** :
- `feedback_lucide_icons_except_tutor`
- `feedback_landing_tone_adult_kind`
- `feedback_heatmap_no_overwhelm`
- `feedback_tutor_max_2_hints`
- `feedback_no_pricing_public`
- `feedback_no_ia_label_in_ux`
- `project_role_model_2_values`
- `project_curation_concept_view`
- `project_plan_maia_daily`
- `project_pwa_from_mvp`
- `project_live_session_kahoot_year`
- `project_tenant_routing_flat`
