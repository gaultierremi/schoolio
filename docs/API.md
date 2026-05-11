# API Schoolio

Dernière mise à jour : 2026-05-11.

L'API est exposée via les route handlers Next.js dans `app/api/**/route.ts`.

## Légende auth

| Valeur | Signification |
| --- | --- |
| Public | Pas de session requise, ou route volontairement publique. |
| User | Utilisateur Supabase connecté. |
| Teacher | Enseignant connecté, vérification applicative ou RLS. |
| Admin | Email admin ou super-admin. |
| Helper Alex | Route migrée vers `lib/api/auth.ts` et/ou `lib/api/respond.ts`. |
| Local | Vérification auth locale ou accès Supabase direct, migration restante. |

## Auth, beta et utilitaires

| Méthode | Route | Auth | Helper | Description |
| --- | --- | --- | --- | --- |
| `POST` | `/api/beta/request-access` | Public | Local | Dépose une demande d'accès beta. |
| `GET` | `/api/image-proxy` | Public | Local | Proxy d'image pour affichage contrôlé. |
| `POST` | `/api/join` | User | Local | Rejoint une classe via code d'invitation. |
| `GET` | `/api/join/preview` | Public | Local | Prévisualise une classe depuis un code d'invitation. |

## IA et étude

| Méthode | Route | Auth | Helper | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/api/adaptive-questions` | User | Local | Retourne des questions adaptées au profil d'étude. |
| `POST` | `/api/extract-questions` | User | Helper Alex | Extrait des questions depuis du contenu ou un PDF. |
| `POST` | `/api/generate-explanation` | User | Helper Alex | Génère une explication IA pour une réponse. |
| `POST` | `/api/generate-questions` | User | Helper Alex | Génère des questions depuis le StudyWizard ou un PDF. |
| `POST` | `/api/propose-question` | User | Helper Alex | Propose une question générée par IA. |
| `POST` | `/api/record-quiz-answer` | User | Local | Enregistre une réponse de quiz. |
| `POST` | `/api/spaced-repetition` | User | Local | Met à jour la répétition espacée. |
| `POST` | `/api/study-progress` | User | Local | Enregistre la progression d'étude. |
| `GET` | `/api/study-recommendations` | User | Local | Retourne des recommandations de révision. |
| `POST` | `/api/study-session` | User | Local | Crée ou met à jour une session d'étude. |

## Courses et PDF

| Méthode | Route | Auth | Helper | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/api/courses` | Teacher | Local | Liste les cours accessibles. |
| `GET` | `/api/courses/[id]` | Teacher | Local | Charge les métadonnées d'un cours. |
| `DELETE` | `/api/courses/[id]` | Teacher | Local | Supprime ou archive un cours. |
| `POST` | `/api/courses/upload-url` | Teacher | Local | Génère une URL d'upload PDF. |
| `POST` | `/api/courses/reupload` | Teacher | Local | Remplace le PDF d'un cours existant. |
| `POST` | `/api/courses/infer-metadata` | Teacher | Local | Infère titre, matière et niveau depuis un PDF. |
| `POST` | `/api/courses/generate-questions` | Teacher | Local | Génère questions/exercices sur une plage de pages. |
| `GET` | `/api/courses/[id]/signed-url` | Teacher | Local | Génère une URL signée pour lire le PDF. |
| `POST` | `/api/courses/[id]/extract-questions` | Teacher | Local | Extrait des questions d'un cours. |
| `POST` | `/api/courses/[id]/generate-exercises` | Teacher | Local | Génère des exercices structurés depuis un cours. |
| `GET` | `/api/courses/[id]/exercises` | Teacher | Local | Liste les exercices d'un cours. |
| `GET` | `/api/courses/[id]/exercises/[exerciseId]` | Teacher | Local | Charge un exercice. |
| `PATCH` | `/api/courses/[id]/exercises/[exerciseId]` | Teacher | Local | Met à jour un exercice. |
| `PATCH` | `/api/courses/[id]/exercises/[exerciseId]/archive` | Teacher | Local | Archive un exercice. |
| `PATCH` | `/api/courses/[id]/exercises/[exerciseId]/reject` | Teacher | Local | Rejette un exercice généré. |
| `PATCH` | `/api/courses/[id]/exercises/[exerciseId]/restore` | Teacher | Local | Restaure un exercice archivé. |
| `PATCH` | `/api/courses/[id]/exercises/[exerciseId]/validate` | Teacher | Local | Valide un exercice généré. |

## Classes et invitations

| Méthode | Route | Auth | Helper | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/api/classes` | Teacher | Local | Liste les classes du professeur. |
| `POST` | `/api/classes` | Teacher | Local | Crée une classe. |
| `POST` | `/api/classes/validate-code` | Public | Local | Valide un code classe historique. |
| `POST` | `/api/classes/validate-token` | Public | Local | Valide un lien d'invitation tokenisé. |
| `GET` | `/api/classes/[id]` | Teacher | Local | Charge une classe et ses membres. |
| `PATCH` | `/api/classes/[id]` | Teacher | Local | Met à jour une classe. |
| `DELETE` | `/api/classes/[id]` | Teacher | Local | Supprime ou archive une classe. |
| `GET` | `/api/classes/[id]/members` | Teacher | Local | Liste les membres d'une classe. |
| `PATCH` | `/api/classes/[id]/members` | Teacher | Local | Met à jour un membre. |
| `POST` | `/api/classes/[id]/join-full` | User | Local | Inscription complète dans une classe. |
| `POST` | `/api/classes/[id]/join-light` | Public/User | Local | Inscription allégée dans une classe. |
| `PATCH` | `/api/classes/[id]/invitation` | Teacher | Local | Active, désactive ou expire un code 8 caractères. |
| `POST` | `/api/classes/[id]/invitation/regenerate` | Teacher | Local | Régénère le code d'invitation 8 caractères. |
| `POST` | `/api/classes/[id]/regenerate-code` | Teacher | Local | Régénère l'ancien code de classe. |
| `POST` | `/api/classes/[id]/regenerate-link` | Teacher | Local | Régénère l'ancien lien d'invitation. |
| `POST` | `/api/classes/[id]/attendance` | Teacher | Local | Enregistre l'appel ou une présence. |
| `GET` | `/api/classes/[id]/export` | Teacher | Local | Exporte les élèves en CSV. |
| `GET` | `/api/classes/[id]/pick-stats` | Teacher | Local | Retourne les statistiques de tirage aléatoire. |
| `POST` | `/api/classes/[id]/random-pick` | Teacher | Local | Tire un élève aléatoirement. |
| `POST` | `/api/classes/[id]/random-pick/[pickId]/cancel` | Teacher | Local | Annule un tirage aléatoire. |

## Assignments

| Méthode | Route | Auth | Helper | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/api/classes/[id]/assignments` | Teacher | Local | Liste les devoirs d'une classe. |
| `POST` | `/api/classes/[id]/assignments` | Teacher | Local | Crée un devoir. |
| `PATCH` | `/api/classes/[id]/assignments/[assignmentId]` | Teacher | Local | Met à jour un devoir. |
| `DELETE` | `/api/classes/[id]/assignments/[assignmentId]` | Teacher | Local | Supprime un devoir. |
| `GET` | `/api/classes/[id]/assignments/[assignmentId]/dashboard` | Teacher | Local | Donne la synthèse classe d'un devoir. |
| `GET` | `/api/classes/[id]/assignments/[assignmentId]/details` | Teacher | Local | Donne les détails élèves d'un devoir. |
| `GET` | `/api/classes/[id]/assignments/[assignmentId]/export` | Teacher | Local | Exporte les résultats d'un devoir. |

## Live sessions

| Méthode | Route | Auth | Helper | Description |
| --- | --- | --- | --- | --- |
| `POST` | `/api/live-sessions` | Teacher | Local | Crée une session live et un code 6 caractères. |
| `POST` | `/api/live-sessions/[id]/back-to-pdf` | Teacher | Local | Remet la projection sur le PDF. |
| `GET` | `/api/live-sessions/[id]/contextual-questions` | Teacher | Local | Génère des questions contextuelles pour la page courante. |
| `POST` | `/api/live-sessions/[id]/end` | Teacher | Local | Termine une session live. |
| `PATCH` | `/api/live-sessions/[id]/page` | Teacher | Local | Synchronise la page PDF courante. |
| `PATCH` | `/api/live-sessions/[id]/page-state` | Teacher | Local | Synchronise page, zoom et viewport. |
| `POST` | `/api/live-sessions/[id]/project-question` | Teacher | Local | Projette une question live. |
| `POST` | `/api/live-sessions/[id]/record-answer` | Public/User | Local | Enregistre une réponse élève live. |
| `POST` | `/api/live-sessions/[id]/regenerate-code` | Teacher | Local | Régénère le code live. |
| `GET` | `/api/live/[code]` | Public | Local | Charge une session active par code. |
| `GET` | `/api/live/[code]/pdf-url` | Public | Local | Donne l'URL PDF signée pour le slave. |
| `GET` | `/api/live/[code]/projected-question` | Public | Local | Charge la question projetée. |

## Student

| Méthode | Route | Auth | Helper | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/api/student/dashboard` | User | Local | Charge le tableau de bord élève. |
| `POST` | `/api/student/dismiss-onboarding` | User | Local | Masque l'onboarding élève. |
| `GET` | `/api/student/my-classes` | User | Local | Liste les classes rejointes. |
| `POST` | `/api/student/classes/[id]/leave` | User | Local | Quitte une classe. |
| `GET` | `/api/student/assignments` | User | Local | Liste les devoirs élève. |
| `GET` | `/api/student/assignments/[id]/course-pdf-url` | User | Local | Retourne l'URL PDF du cours lié. |
| `GET` | `/api/student/assignments/[id]/pdf-url` | User | Local | Retourne l'URL PDF du devoir. |
| `POST` | `/api/student/assignments/[id]/start-quiz` | User | Local | Démarre un quiz de devoir. |
| `POST` | `/api/student/assignments/[id]/finish-quiz` | User | Local | Termine un quiz de devoir. |
| `POST` | `/api/student/assignments/[id]/mark-read` | User | Local | Marque un devoir comme lu. |
| `GET` | `/api/student/courses/[id]/pdf-url` | User | Local | Retourne l'URL PDF d'un cours élève. |

## School dashboard

| Méthode | Route | Auth | Helper | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/api/school/dashboard-summary` | Teacher | Local | Résumé du dashboard enseignant. |
| `GET` | `/api/school/recent-activity` | Teacher | Local | Activité récente de l'école. |
| `GET` | `/api/school/stats` | Teacher | Local | Statistiques enseignant. |
| `GET` | `/api/school/schedule` | Teacher | Local | Liste le planning. |
| `POST` | `/api/school/schedule` | Teacher | Local | Crée une entrée planning. |
| `PATCH` | `/api/school/schedule/[id]` | Teacher | Local | Modifie une entrée planning. |
| `DELETE` | `/api/school/schedule/[id]` | Teacher | Local | Supprime une entrée planning. |
| `GET` | `/api/school/schedule/current-context` | Teacher | Local | Retourne le contexte horaire courant. |
| `POST` | `/api/school/schedule/dismiss-onboarding` | Teacher | Local | Masque l'onboarding planning. |
| `PATCH` | `/api/school/schedule/week-pattern-override` | Teacher | Local | Change le pattern de semaine. |

## Admin

| Méthode | Route | Auth | Helper | Description |
| --- | --- | --- | --- | --- |
| `DELETE` | `/api/admin/ai-router/cache` | Admin | Local | Vide le cache du routeur IA. |
| `GET` | `/api/admin/beta-whitelist` | Admin | Local | Liste la whitelist beta. |
| `POST` | `/api/admin/beta-whitelist` | Admin | Local | Ajoute une entrée whitelist. |
| `DELETE` | `/api/admin/beta-whitelist/[id]` | Admin | Local | Supprime une entrée whitelist. |
| `POST` | `/api/admin/beta-whitelist/approve/[request_id]` | Admin | Local | Approuve une demande beta. |
| `POST` | `/api/admin/beta-whitelist/reject/[request_id]` | Admin | Local | Rejette une demande beta. |
| `GET` | `/api/admin/board` | Admin | Local | Liste les cartes du board admin. |
| `POST` | `/api/admin/board` | Admin | Local | Crée une carte admin. |
| `PATCH` | `/api/admin/board/[id]` | Admin | Local | Modifie une carte admin. |
| `DELETE` | `/api/admin/board/[id]` | Admin | Local | Supprime une carte admin. |
| `GET` | `/api/admin/board/export` | Admin | Local | Exporte le board admin. |
| `POST` | `/api/admin/invite-teacher` | Admin | Local | Invite un enseignant. |

## Teacher content

| Méthode | Route | Auth | Helper | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/api/teacher-tags` | Teacher | Local | Liste les tags enseignant. |
| `POST` | `/api/teacher-tags` | Teacher | Local | Crée un tag enseignant. |
| `PATCH` | `/api/teacher-tags/[id]` | Teacher | Local | Modifie un tag enseignant. |
| `DELETE` | `/api/teacher-tags/[id]` | Teacher | Local | Supprime un tag enseignant. |
| `GET` | `/api/teacher-tags/usage/[id]` | Teacher | Local | Retourne l'usage d'un tag. |
| `PATCH` | `/api/teacher-questions/[id]/validation` | Teacher | Local | Valide ou rejette une question enseignant. |

## Dette de migration helpers

Priorité recommandée :

1. Routes `admin/*` vers `requireAdmin()`.
2. Routes `courses/*`, `classes/*`, `school/*`, `teacher-*` vers `requireTeacher()`.
3. Routes `student/*`, `study-*`, `record-quiz-answer` vers `requireUser()`.
4. Standardisation des erreurs avec `apiError()` et `safeError()`.

