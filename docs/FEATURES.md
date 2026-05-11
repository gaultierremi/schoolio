# Features Schoolio

Dernière mise à jour : 2026-05-11.

## Catalogue prod

| Feature | Statut | Description |
| --- | --- | --- |
| Mode cours live | ✅ prod | Le professeur lance une session master, partage un code 6 caractères, synchronise le PDF et peut projeter des questions. Le slave `/live/[code]` reçoit les changements via Supabase Realtime avec fallback HTTP. |
| Random pick live | ✅ prod | Tirage aléatoire d'élèves depuis une classe, avec annulation possible et statistiques de tirage. Utilisé pendant les sessions live et le suivi classe. |
| Suggestions IA live | ✅ prod | Génération de questions contextuelles depuis la page PDF courante. Les questions peuvent être projetées puis remplacées par le PDF. |
| Schoolio écoute V1 | ⏳ en cours | Socle prévu pour capter la voix via Web Speech API et proposer des suggestions Gemini. Le badge slave et l'intégration live sont à valider en testing. |
| Invitations classes | ✅ prod | Codes d'invitation 8 caractères, lien `/join?code=...`, page dédiée avec QR code, activation/désactivation et expiration. Les anciens tokens restent présents pour compatibilité. |
| Onboarding étudiant | ✅ prod | L'élève rejoint une classe, voit ses devoirs, lance les quiz et accède aux PDF autorisés. |
| Dashboard étudiant | ✅ prod | Vue synthétique des classes, devoirs et actions de progression. |
| Wizard Étudier | ✅ prod | Génère des questions depuis un sujet libre ou un PDF via `/api/generate-questions`. La route est maintenant protégée par auth. |
| Génération questions PDF | ✅ prod | Import PDF, inférence de métadonnées Gemini, génération questions/exercices sur pages ou plages. Le flux inclut limitation de rafales Gemini côté import. |
| Exercices de cours | ✅ prod | Création, validation, rejet, archivage et restauration d'exercices liés à un cours. |
| Devoirs classes | ✅ prod | Création de devoirs, assignation aux élèves, dashboards, détails et exports CSV. |
| Appel et présence | ✅ prod | Enregistrement de périodes de présence, avec contraintes DB renforcées sur la validité des périodes. |
| Planning école | ✅ prod | Planning enseignant, contexte horaire courant, pattern de semaine et onboarding dédié. |
| Admin board | ✅ prod | Kanban admin avec export et Realtime/polling fallback côté interface. |
| Whitelist beta | ✅ prod | Demandes d'accès, approbation/rejet admin et gestion de la whitelist. |
| Routeur IA | ✅ prod | Providers Gemini/Anthropic configurés avec modèles, cache et fallback. |
| Audit sécurité Alex PR #1 | ✅ prod | Upgrade Next.js, headers sécurité, auth sur routes IA sensibles, `noopener,noreferrer`, sign-out global. |
| Audit sécurité Alex PR #2 | ✅ prod | RLS sur `courses`, `WITH CHECK`, contraintes DB et table `audit_log` append-only. |

## Focus live

| Élément | Statut | Notes |
| --- | --- | --- |
| Master professeur | ✅ prod | `/school/courses/[id]/live`, contrôle page, viewport et projection. |
| Slave public | ✅ prod | `/live/[code]`, lecture session active, PDF signé et question projetée. |
| Supabase Realtime | ✅ prod | Publication de `live_sessions` et updates côté slave. |
| Réponses live | ✅ prod | `live_question_answers` suit les réponses élèves en session. |

## Focus sécurité

| Élément | Statut | Notes |
| --- | --- | --- |
| Helpers auth API | ✅ prod | `requireUser`, `requireAdmin`, `requireSuperAdmin`, `requireTeacher` disponibles. |
| Migration helpers | ⏳ en cours | Seules quelques routes IA utilisent déjà `requireUser`. |
| RLS courses | ✅ prod | Activée par migration du 2026-05-11. |
| Audit log | ✅ prod | Table append-only avec email acteur figé à l'écriture. |
| CSP/HSTS | ✅ prod | Configurés dans `next.config.mjs`. |

