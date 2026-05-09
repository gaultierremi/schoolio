# Schoolio — Architecture

## Stack technique

### Frontend

- Next.js 14.2.3 (App Router)
- React 18
- TypeScript 5
- Tailwind CSS 4.2.4 (dark theme, accent purple-500)
- Framer Motion 12 (animations)
- KaTeX (formules math)

### Backend

- Routes API Next.js (`app/api/`)
- Supabase (Postgres + Auth + Storage + Realtime)
- `@supabase/ssr` 0.10.2 + `@supabase/supabase-js` 2.105.3

### IA

- Gemini 2.5 Pro (génération questions/exos depuis PDF, vision)
- Gemini 2.5 Flash (fallback rate limit)
- Claude Sonnet 4.6 (fallback ultime exos + extract questions)
- Claude Haiku 4.5 (adaptatif, concepts, recommandations)

### PDFs

- `pdf-lib` 1.17.1 (extraction pages, comptage)
- Bucket Supabase privé `course-pdfs`
- Limite storage actuelle : PDF uniquement, 50 MB max
- Chemin de stockage : `user_id/course_id/filename.pdf`

## Variables d'environnement

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_AI_API_KEY
ANTHROPIC_API_KEY
BOARD_EXPORT_TOKEN
```

## Structure applicative

### Espaces principaux

- `/school` : espace professeur, dashboard, cours, questions, classes, devoirs, planning.
- `/student` : espace élève, classes rejointes, devoirs, quiz et accès aux parcours d'étude.
- `/study` : création de sessions d'étude personnalisées.
- `/train` : entraînement adaptatif basé sur la maîtrise des concepts.
- `/admin/board` : kanban admin interne.
- `/join` et `/join/[token]` : entrée élève via code classe ou lien d'invitation.

### Routes API majeures

- `app/api/courses/` : CRUD cours, upload PDF, URLs signées, metadata et générations IA.
- `app/api/classes/` : classes, membres, codes d'invitation, devoirs, exports.
- `app/api/student/` : classes élève, devoirs, quiz, PDF signé, mark-read.
- `app/api/school/` : dashboard professeur, stats, activité récente, planning.
- `app/api/spaced-repetition` et `app/api/adaptive-questions` : apprentissage adaptatif.
- `app/api/admin/board` : cartes du kanban interne.

## Donnees

### Tables coeur

- `courses` : cours PDF du professeur, metadata, tags, hash PDF.
- `teacher_questions` : banque de questions QCM validées/rejetées.
- `exercises` et `exercise_steps` : exercices guidés et résolutions par étapes.
- `classes` et `class_memberships` : classes, élèves, codes et liens d'invitation.
- `assignments` et `assignment_completions` : devoirs assignés, progression, score, durée.
- `teacher_organization_tags` : tags d'organisation personnels du professeur.
- `activity_events` : journal d'evenements pour dashboard et analytics.
- `teacher_schedule_slots` : emploi du temps professeur.
- `user_profiles` : rôle, pseudo, préférences, streaks et données de profil.

### Securite donnees

- Les routes applicatives utilisent Supabase Auth pour identifier l'utilisateur.
- Plusieurs routes côté serveur utilisent la service role Supabase avec contrôles explicites `teacher_id`, membership ou rôle.
- La table `courses` a RLS désactivée et dépend donc des contrôles serveur.
- Le bucket `course-pdfs` est privé ; les PDFs sont consultés via URLs signées.

## Flux principaux

### Import PDF professeur

1. Le professeur upload un PDF dans `course-pdfs`.
2. Schoolio calcule un `pdf_hash` et infère les metadata via Gemini.
3. Les questions et exercices sont générés ou extraits.
4. Le professeur valide, rejette, tague et assigne le contenu.

### Devoir eleve

1. Le professeur cree un devoir pour une classe.
2. L'élève voit le devoir sur `/student`.
3. Pour un PDF, l'élève ouvre une URL signée et peut marquer comme lu.
4. Pour un quiz, l'élève répond question par question, avec score sauvegardé.
5. Le professeur consulte les completions et exports depuis le detail du devoir.

### Entrainement adaptatif

1. Les concepts et scores de maîtrise alimentent les routes adaptatives.
2. La selection favorise les concepts faibles.
3. Les réponses mettent à jour la maîtrise et la prochaine révision.
4. Les stats sont visibles dans `/study/stats` et le profil.

## IA et fallback

La stratégie actuelle est locale à chaque route IA : détection de rate limit HTTP 429 ou quota, puis fallback progressif.

Ordre general :

1. Gemini 2.5 Pro
2. Gemini 2.5 Flash
3. Claude Sonnet 4.6 pour les générations/extractions lourdes
4. Claude Haiku 4.5 pour adaptatif, concepts, recommandations et explications

Point de dette : la détection `isRateLimitError()` est dupliquée dans plusieurs routes et devrait être extraite dans `lib/`.

## Composants UI importants

- `app/school/_components/` : dashboard professeur, KPI, activite, planning courant.
- `app/school/schedule/_components/` : grille horaire et modal de créneau.
- `app/school/courses/[id]/exercises/_components/PageRangeGenerator.tsx` : génération par plage de pages.
- `components/pdf/PageRangeSlider.tsx` : selection de plage PDF.
- `components/classes/JoinClassForm.tsx` : inscription élève via code ou token.
- `components/TrainingCard.tsx` : quiz adaptatif riche.
- `components/StudyWizard.tsx` : création de session d'étude.
- `components/ReviewCard.tsx` : révision espacée.
- `components/MasteryDashboard.tsx` : maîtrise par concept.

## Points d'attention

- Plusieurs pages restent volumineuses, notamment `app/school/questions/page.tsx`, `app/school/organization/page.tsx` et `app/school/import/page.tsx`.
- Le flow élève doit rester prioritaire pour la bêta : feedback sur mauvaise réponse, dashboard prof dynamique, cas devoir "exercise".
- Les futures features B2B2C doivent introduire `organizations` avant accumulation de données legacy.
- Les tests E2E Playwright manquent sur les flows critiques : join, devoir, quiz, import PDF, assignation, dashboard professeur.
