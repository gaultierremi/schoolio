# Architecture Schoolio

Dernière mise à jour : 2026-05-11.

## Vue d'ensemble

Schoolio est une application web Next.js pour enseignants et élèves. Elle couvre l'import PDF, la génération de questions, les classes, les devoirs, les sessions live synchronisées et les tableaux de bord étudiant/enseignant.

## Stack technique

| Couche | Choix |
| --- | --- |
| Framework | Next.js 14.2.35, App Router |
| Langage | TypeScript strict |
| UI | React 18, Tailwind CSS v4 |
| Backend | Route handlers Next.js dans `app/api/` |
| Base de données | Supabase Postgres |
| Auth | Supabase Auth, cookies serveur via `@supabase/ssr` |
| Storage | Supabase Storage pour les PDF de cours |
| Temps réel | Supabase Realtime pour les sessions live |
| IA | Anthropic SDK, Google Gemini SDK, routeur IA interne |
| Déploiement | Vercel |
| PDF | `react-pdf`, `pdf-lib`, worker PDF copié en `postinstall` |

## Structure du repo

| Dossier | Rôle |
| --- | --- |
| `app/` | Pages App Router, layouts, routes publiques et espaces `school`, `student`, `admin`, `live`, `join`. |
| `app/api/` | API HTTP interne, organisée par domaine fonctionnel. |
| `components/` | Composants partagés et composants métier (`classes`, `pdf`, `teacher-live`, `ui`). |
| `lib/` | Accès Supabase, logique IA, génération d'exercices, scoring, recommandations, helpers API. |
| `lib/api/` | Helpers transverses pour auth et réponses API. |
| `supabase/migrations/` | Schéma SQL, RLS, Realtime, contraintes et fondations sécurité. |
| `docs/` | Documentation projet, audit, architecture, API et roadmap. |
| `public/` | Assets statiques. |
| `scripts/` | Scripts de maintenance, dont copie du worker PDF. |
| `hooks/` | Non présent à ce jour ; réservé si des hooks React partagés deviennent nécessaires. |

## Conventions serveur

Les routes API sont des route handlers Next.js sous `app/api/**/route.ts`.

Les nouveaux helpers transverses créés par Alex sont :

| Helper | Fichier | Usage |
| --- | --- | --- |
| `requireUser()` | `lib/api/auth.ts` | Vérifie une session Supabase et retourne `401` si absent. |
| `requireAdmin()` | `lib/api/auth.ts` | Vérifie email admin après auth utilisateur. |
| `requireSuperAdmin()` | `lib/api/auth.ts` | Vérifie email super-admin après auth utilisateur. |
| `requireTeacher()` | `lib/api/auth.ts` | Vérifie le rôle enseignant via RPC Supabase. |
| `apiOk()` | `lib/api/respond.ts` | Réponse JSON succès typée. |
| `apiError()` | `lib/api/respond.ts` | Réponse JSON erreur standard. |
| `safeError()` | `lib/api/respond.ts` | Log serveur + erreur JSON générique. |

Routes déjà migrées vers `requireUser()` :

- `POST /api/extract-questions`
- `POST /api/generate-explanation`
- `POST /api/generate-questions`
- `POST /api/propose-question`

Les autres routes utilisent encore des vérifications locales ou `createClient()` directement. Les prochaines PR sécurité doivent migrer progressivement les routes enseignant vers `requireTeacher()` et les routes admin vers `requireAdmin()`.

## Pattern Claudy

Pour les changements importants, Claudy suit un pattern plan-first :

1. Lire le code existant et les migrations avant d'écrire.
2. Identifier le domaine touché et les contrats API/UI.
3. Préférer les helpers locaux (`lib/api/*`, `lib/supabase-*`, logique `lib/*`) aux abstractions nouvelles.
4. Livrer une modification courte, testable, puis documenter les risques restants.

## Données et RLS

Supabase est la source de vérité pour les cours, classes, membres, devoirs, questions, sessions live et événements d'activité.

Les migrations récentes renforcent la sécurité :

| Migration | Effet |
| --- | --- |
| `20260511020000_enable_rls_on_courses.sql` | Active RLS sur `courses`. |
| `20260511030000_tighten_rls_with_check.sql` | Ajoute des `WITH CHECK` sur plusieurs écritures utilisateur. |
| `20260511040000_add_check_constraints.sql` | Ajoute des contraintes sur scores et périodes. |
| `20260511050000_audit_log_immutable.sql` | Ajoute `audit_log` append-only. |
| `20260512100000_add_period_check_to_attendance.sql` | Renforce la validité des périodes d'appel. |

Principe actuel : l'application garde des vérifications applicatives, mais les règles RLS doivent devenir la dernière barrière.

## IA

Schoolio utilise deux familles de fournisseurs :

| Fournisseur | Usage |
| --- | --- |
| Gemini 2.5 Pro / Flash | Génération de questions, extraction PDF, inférence de métadonnées, suggestions contextuelles live. |
| Anthropic | Fallback et génération de contenu selon le routeur IA. |

Le routeur IA (`lib/ai-router.ts`) expose une logique de sélection et de fallback. Les imports PDF appliquent une file Gemini côté client pour limiter les rafales.

## Mode Cours Live

Le mode cours live repose sur une relation master/slave :

| Élément | Description |
| --- | --- |
| Master | Interface professeur dans `/school/courses/[id]/live`. |
| Slave | Page publique `/live/[code]` affichée aux élèves ou à la projection. |
| Code | Code session à 6 caractères généré côté serveur. |
| Synchronisation PDF | Le professeur pousse la page courante et l'état de viewport. |
| Projection question | Le professeur peut projeter une question live puis revenir au PDF. |
| Realtime | `live_sessions` est publiée dans Supabase Realtime. |
| Fallback | Le slave garde des fetchs ponctuels pour rattraper un événement Realtime manqué. |

Tables principales :

- `live_sessions`
- `live_question_answers`
- `student_random_picks`
- `class_attendance_records`

Le slave lit une session active par code via RPC/API publique. Les mutations restent côté enseignant authentifié.

## Sécurité récente

Les merges Alex ont ajouté :

- Upgrade Next.js `14.2.3` vers `14.2.35`.
- Headers sécurité dans `next.config.mjs` : CSP, HSTS, `frame-ancestors`, désactivation `x-powered-by`.
- `noopener,noreferrer` pour les previews PDF.
- Déconnexion Supabase globale.
- Auth obligatoire sur plusieurs routes IA.
- RLS `courses` et contraintes DB complémentaires.
- Table `audit_log` append-only.

