# DPIA Stub — Maïa (Sprint 1B)

> **Statut :** Stub minimal interne. Pour un pilote école payant, une **DPIA externalisée** doit être commandée à un cabinet juridique BE spécialisé RGPD avant signature. Ce document sert de point de départ.

**Version :** 2026-05-15 — Sprint 1B
**Responsable de traitement :** Maïa SARL/SRL (forme juridique à confirmer)
**DPO :** dpo@maia.app

---

## 1. Description du traitement

Maïa est une plateforme web d'apprentissage adaptive destinée aux élèves de l'enseignement secondaire francophone belge (programme officiel FW-B) et à leurs professeurs.

**Finalités :**
- Permettre aux élèves de pratiquer des exercices alignés sur le curriculum officiel
- Permettre aux professeurs de suivre la progression de leur classe et d'identifier les lacunes
- Générer des contenus pédagogiques (questions, théorie, indices) via IA en batch côté serveur (pas de chat IA runtime côté élève)
- Maintenir un audit log de sécurité (connexions, tentatives PIN, consentements)

**Catégories de personnes concernées :**
- Élèves (12-18 ans, donc majoritairement mineurs <16 ans nécessitant consentement parental)
- Professeurs (adultes)
- Direction d'école (adultes, accès admin)

---

## 2. Catégories de données traitées

| Catégorie | Exemples | Sensibilité RGPD |
|---|---|---|
| Identification | Email SSO (Google/Microsoft/SmartSchool), prénom, pseudo | Personnelle (Art. 4(1)) |
| Authentification | PIN bcrypt-hashé, journal connexions, IP hashée SHA-256 | Personnelle |
| Usage scolaire | Classes membre, réponses quiz, scores, mastery par concept | Personnelle |
| Contexte technique | User-agent, timezone IANA | Personnelle |
| Consentement (mineur) | Email parent **hashé bcrypt** (jamais en clair), signature parent hashée | Personnelle pseudonymisée |

**Pas de données sensibles Art. 9** (santé, biométrie, opinions, religion, orientation, ethnie). Maïa ne traite pas ces catégories.

---

## 3. Base légale (RGPD Art. 6)

| Traitement | Base légale |
|---|---|
| Utilisation de la plateforme par l'élève / le prof | Exécution du contrat (Art. 6(1)(b)) |
| Statistiques agrégées de classe pour le prof | Intérêt légitime (Art. 6(1)(f)) — finalité pédagogique |
| Mineurs <16 ans | Consentement parental (Art. 6(1)(a) + Art. 8) — workflow dédié via token signé |
| Audit log sécurité | Obligation légale + intérêt légitime (Art. 6(1)(c)(f)) |

---

## 4. Durées de conservation

| Catégorie | Durée | Mécanisme |
|---|---|---|
| Compte actif | Tant que le compte est actif | — |
| Compte supprimé : profil (PII) | Effacé immédiatement | `user_profiles.first_name/last_name/pseudo` mis à NULL ; `auth.users.email` remplacé par placeholder |
| Compte supprimé : données événementielles | Conservées sous forme pseudonymisée (règle interne #23) | Table `anonymized_users` — vues frontend affichent "Utilisateur supprimé" |
| Audit log | 5 ans | Fonction SQL `purge_old_audit_log()`, invocable par cron mensuel Trigger.dev |
| Consentements signés (`consent_records`) | 5 ans après révocation | — |
| Token signature parent | 72h max (TTL `expires_at`) | — |
| PIN attempts (audit append-only) | 5 ans | Couvert par purge audit générale |

---

## 5. Mesures techniques et organisationnelles (RGPD Art. 32)

### Mesures techniques
- Hébergement EU : Supabase Frankfurt (DE), Vercel régions EU configurables
- Chiffrement TLS 1.2+ obligatoire (HSTS via Vercel)
- Chiffrement at-rest : Supabase Postgres (AES-256)
- **RLS Supabase** : chaque table sensible a une policy stricte. Aucun client browser ne peut lire ou écrire les tables d'auth (`user_pin`, `pin_attempts`, `consent_records`, `anonymized_users`).
- **PIN bcrypt cost 12** (~150ms par check) — résistant brute force
- **Cookie HttpOnly signé JWT** pour la fraîcheur PIN (pas de DB query par navigation)
- **Hash systématique des données sensibles** : email parent (bcrypt), IP (SHA-256), tokens (SHA-256), nom signataire (bcrypt)
- Audit log immutable (migration `20260511050000_audit_log_immutable.sql`)
- Pas de PII dans les logs applicatifs (console.log filtré)

### Mesures organisationnelles
- Accès production limité aux founders Maïa + administrateurs école désignés
- DPO accessible via `dpo@maia.app`
- Politique interne "never DELETE" sur tables événementielles (CLAUDE.md règle 23)
- Validation manuelle des contenus IA par le professeur avant publication (curation prof)
- Procédure de réponse aux demandes RGPD documentée : 30 jours max (Art. 12(3))

---

## 6. Sous-traitants (Art. 28)

| Sous-traitant | Service | Localisation | Base de transfert |
|---|---|---|---|
| Supabase | Auth + DB + Storage | Frankfurt (EU) | Pas de transfert hors UE |
| Vercel | Hébergement application | Régions EU configurables (par défaut US — à forcer EU) | SCC Art. 46(2)(c) si fallback US |
| Anthropic | IA Claude (génération contenu batch) | États-Unis | **SCC Art. 46(2)(c)** — DPA signé avec clauses contractuelles types |
| Trigger.dev | Orchestration jobs asynchrones | US ou EU selon plan | SCC Art. 46(2)(c) si US |
| Resend / Postmark | Email transactionnel | EU configurable | À forcer EU |

**Note Anthropic** : transfert international encadré par SCC. Aucune donnée d'élève n'est envoyée à Anthropic en temps réel — seuls les syllabi (contenu pédagogique sans PII élève) sont envoyés au batch d'ingestion. Les réponses élèves au quiz utilisent un comparateur déterministe côté serveur, jamais d'appel IA en runtime sur les data élève.

---

## 7. Évaluation des risques

| Risque | Probabilité | Gravité | Atténuation |
|---|---|---|---|
| Fuite de données via injection SQL | Faible | Élevée | Supabase parameterized queries, ORM Postgrest |
| Vol de cookie / session | Faible | Élevée | Cookie HttpOnly + Secure (prod) + SameSite=lax, JWT HS256 signed |
| Brute force PIN | Faible | Moyenne | bcrypt cost 12, fallback SSO 3 échecs, audit log |
| Phishing du parent (faux email "consentement") | Moyenne | Moyenne | Email expéditeur officiel + lien expirable 72h + signature bcrypt côté serveur |
| Accès non autorisé d'un user à des données d'un autre | Faible | Élevée | RLS Supabase strict sur 100% des tables sensibles |
| Perte de données suite à crash | Faible | Moyenne | Backups Supabase quotidiens + point-in-time recovery |
| Non-conformité durée de conservation | Faible | Moyenne | Fonction SQL `purge_old_audit_log()` + cron mensuel |
| Sous-traitant US (Anthropic) | Moyenne | Faible | Batch uniquement, pas de PII envoyée, SCC en place |

**Risque résiduel global :** acceptable pour phase pilote interne et premiers pilotes école BE. Avant déploiement à plus grande échelle (>3 écoles), commander une DPIA externe par un juriste BE spécialisé.

---

## 8. Droits des personnes concernées (RGPD Art. 12-22)

| Droit | Implémentation Maïa | Délai |
|---|---|---|
| Art. 15 — Accès | `/accueil/parametres/confidentialite` affiche consents + journal audit | Immédiat (UI) |
| Art. 16 — Rectification | Via le prof (élève) ou directement le user (prof) | Immédiat |
| Art. 17 — Effacement | `/accueil/parametres/suppression-compte` avec anonymisation | Immédiat |
| Art. 18 — Limitation | À demander à dpo@maia.app | 30 jours |
| Art. 20 — Portabilité | `/accueil/parametres/export-donnees` génère JSON | Immédiat |
| Art. 21 — Opposition | À demander à dpo@maia.app | 30 jours |
| Art. 7(3) — Retrait consentement | À implémenter dans `/accueil/parametres/confidentialite` (Sprint 1B+) | Immédiat |

---

## 9. Recours / autorité de contrôle

L'utilisateur peut déposer une plainte auprès de l'**Autorité de Protection des Données (APD/CPVP)** belge :
- Rue de la Presse 35, 1000 Bruxelles
- contact@apd-gba.be
- https://www.autoriteprotectiondonnees.be/

---

## 10. Revue

- **Création :** 2026-05-15
- **Prochaine revue :** Avant signature 1ère école pilote payante (DPIA externalisée juriste BE)
- **Responsable :** dpo@maia.app

---

**⚠️ Ce document est un stub interne minimal pour Sprint 1B.** Pour une vraie DPIA conforme à un déploiement pilote école payant, faire valider et compléter par un juriste BE spécialisé en RGPD scolaire. Sections à approfondir avec lui :
- §7 Évaluation des risques (méthodologie ENISA recommandée)
- §6 Sous-traitants (audit des DPA signés)
- §5 Mesures organisationnelles (procédures internes documentées : gestion incidents Art. 33-34, formation équipe)
- §1 Description finalités détaillée par type d'usage
