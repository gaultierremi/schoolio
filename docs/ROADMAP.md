# Roadmap Schoolio

Dernière mise à jour : 2026-05-11.

## Mergé récemment

Périmètre : derniers sprints et merges visibles sur `main` autour du 2026-05-11.

| Commit / PR | Statut | Résumé |
| --- | --- | --- |
| `66128f7` / PR #6 | ✅ mergé | Ajout d'une contrainte DB sur la plage valide des périodes d'appel. |
| `f60a05e` / PR #2 Alex | ✅ mergé | Hardening DB : RLS `courses`, `WITH CHECK`, contraintes, fondation RGPD avec `audit_log`. |
| `9b8f6f8` / PR #1 Alex | ✅ mergé | Quick wins sécurité : Next.js 14.2.35, headers, auth sur routes IA, sign-out global. |
| `b17f81e` | ✅ mergé | Codes d'invitation classes pour onboarding étudiant. |
| `2a7cd70` | ✅ mergé | Whitelist email et page admin beta. |
| `f6566e5` | ✅ mergé | Dashboard étudiant V0. |
| `94723da`, `b11be28` | ✅ mergé | Composants UI de récap session et statistiques hebdomadaires. |

## En cours

| Sujet | Owner | Statut | Prochaine étape |
| --- | --- | --- | --- |
| Schoolio écoute V1 testing | Équipe Schoolio | ⏳ en cours | Valider Web Speech API, suggestions Gemini et UX badge slave en condition live. |
| Mission Control Claudia | Claudia | ⏳ en cours | Recréer les composants dans le scaffold Electron séparé `D:\mission-control`. |
| Migration helpers API | Alex / Codex | ⏳ en cours | Étendre `requireTeacher`, `requireAdmin` et `safeError` aux routes non migrées. |

## Backlog priorisé

| Priorité | Sujet | Objectif |
| --- | --- | --- |
| P0 | Audit fixes Alex PR #3+ | Continuer la migration auth, réduire les routes publiques, ajouter tests de non-régression sécurité. |
| P0 | Schoolio écoute V1 prod | Stabiliser transcription, suggestions, latence et fallback quand Web Speech API n'est pas disponible. |
| P1 | Comparateur cours/programme Adrien V1 | Comparer contenu PDF et programme attendu, détecter trous et redondances. |
| P1 | Active Inspire features | Prioriser les interactions tableau/projection utiles aux enseignants. |
| P1 | Tests live-session | Couvrir création session, sync page, projection question, fin session et slave public. |
| P2 | Observabilité IA | Suivre coût, provider, latence, cache hit et erreurs de fallback. |
| P2 | Exports pédagogiques | Consolider exports CSV/PDF pour classes, devoirs et progression. |

## Plus tard

| Sujet | Intention |
| --- | --- |
| Microsoft for Startups | Étudier crédits, distribution et intégrations possibles. |
| Pricing model | Définir les plans école, professeur individuel et limites IA. |
| Multi-établissement | Modèle d'organisation plus robuste pour écoles et rôles. |
| Offline / desktop | Réévaluer après Mission Control et usages terrain. |
| Analytics produit | Mesurer activation, rétention enseignants et usage des sessions live. |
| RGPD complet | Politique de rétention, export utilisateur, suppression et registre de traitement. |

