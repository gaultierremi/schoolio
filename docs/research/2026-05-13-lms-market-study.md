# Étude de marché LMS (Occident) — Features, Géo, Utilisateurs
**Date :** 13 Mai 2026
**Auteur :** Jules (AI Software Engineer)
**Contexte :** Analyse du paysage LMS pour la stratégie d'entrée de Maia sur le marché secondaire (BE/FR/EU).

---

## Section 1 — Tableau comparatif principal

| LMS | Zone géo principale | Utilisateurs approx. | Modèle | Pricing approx. | Features core | Features adaptive/IA |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Canvas** | US / Global | ~40M+ | Propriétaire / SaaS | $10-$15 / élève / an | RCE, Mastery, SpeedGrader | MasteryConnect, AI Conversation |
| **Google Classroom**| Global | ~150M+ | Freemium / SaaS | Gratuit (Standard) | Drive, Assignments, Meet | Practice Sets (IA), Smart Correct |
| **Microsoft Teams** | Global | ~100M+ (Edu) | Inclus M365 | Inclus M365 A1-A5 | Channels, Video, Office | Reading Progress, Search Coach |
| **Schoology** | US dominant | ~10M+ | Propriétaire / SaaS | n/a | K-12 Focus, Social UX | Learning Objectives tracking |
| **Blackboard** | US / Global | ~100M+ | Propriétaire / SaaS | $15k - $50k+ / étab. | Ally (Access.), Ultra UX | AI Design Assistant |
| **Moodle** | Europe / Global | ~300M+ | Open Source | Gratuit (self-host) | Plugins, Modularité | Adaptive Learning (Plugins) |
| **D2L Brightspace** | Canada / Global | ~20M+ | Propriétaire / SaaS | n/a | Portfolio, Accessibility | Performance+, D2L Lumi (IA) |
| **Smartschool** | Belgique (FL/FR) | ~1.5M | Propriétaire | n/a | Skore, Analytics, Apps | Individuele leerpaden |
| **itslearning** | Norvège / EU | ~7M | Propriétaire (Sanoma) | n/a | K-12 Workflow | Recommendation Engine |
| **ENT (Pronote)** | France | ~10k étab. | Propriétaire | n/a | Vie scolaire, Notes | QCM thématiques |
| **IServ** | Allemagne | ~5000 étab. | Propriétaire | n/a | Infrastructure locale | n/a |
| **Magister** | Pays-Bas | ~2M | Propriétaire | n/a | School admin, Study guide | n/a |

---

## Section 2 — Matrice de features

| LMS | Classes | Horaires | Devoirs | Notes | Parents | Quiz | Contenu | Vidéo | Analytics | Mobile | Adaptive |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Canvas** | ✅ | 🟡 | ✅ | ✅ | 🟡 | ✅ | ✅ | 🟡 | ✅ | ✅ | 🟡 |
| **Google Class.** | ✅ | 🟡 | ✅ | 🟡 | ❌ | ✅ | ✅ | ✅ | 🟡 | ✅ | ❌ |
| **MS Teams** | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Schoology** | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | 🟡 |
| **Blackboard** | ✅ | 🟡 | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Moodle** | ✅ | 🟡 | ✅ | ✅ | ❌ | ✅ | ✅ | 🟡 | ✅ | ✅ | 🟡 |
| **D2L Brightspace**| ✅ | 🟡 | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Smartschool** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| **itslearning** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | 🟡 |
| **Pronote** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ❌ | ✅ | ✅ | ❌ |
| **IServ** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ❌ |
| **Magister** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |

---

## Section 3 — Synthèse "Marché vs Maia"

| LMS | Évaluation | Note stratégique |
| :--- | :--- | :--- |
| **Canvas** | 🟢 Allié potentiel | Intégration LTI 1.3 très mature. Maia se greffe comme l'outil "Expert/Tuteur". |
| **Google Classroom**| 🟢 Allié potentiel | Écosystème ouvert via API. Maia peut devenir un "Add-on" de Practice Sets. |
| **MS Teams** | 🟢 Allié potentiel | Intégration via Teams Apps. Maia complète la suite de productivité. |
| **Schoology** | 🟢 Allié potentiel | Très présent en K-12 US. Intégration API PowerSchool possible. |
| **Moodle** | 🟢 Allié potentiel | Standard LTI natif. Idéal pour les déploiements open-source EU. |
| **Blackboard** | 🟡 Complémentaire | Focus admin/accessibilité. Maia apporte la couche adaptive manquante. |
| **D2L Brightspace** | 🔵 Concurrent direct | Ont une vision "Adaptive/IA" (Lumi), mais restent très orientés contenu. |
| **Smartschool** | 🟡 Complémentaire | Dominant en BE. Maia peut s'intégrer via SSO/API pour le tutoring. |
| **itslearning** | 🟡 Complémentaire | Fort en Europe du Nord. Maia apporte la granularité conceptuelle. |
| **ENT (Pronote)** | 🟡 Complémentaire | Indétrônable sur la vie scolaire (FR). Maia est l'outil pédagogique tiers. |
| **IServ** | 🟡 Complémentaire | Focus infrastructure. Maia apporte la valeur pédagogique. |
| **Magister** | 🟡 Complémentaire | Monopole NL sur l'admin. Maia se greffe au-dessus. |

---

## Section 4 — Features absentes (Opportunités Maia)

Aucun LMS du panel ne livre proprement les capacités suivantes :

1.  **Adaptive learning par concept mastery individuel** : La plupart proposent des "parcours" linéaires ou des branchements simples, pas une maîtrise granulaire basée sur un graphe de concepts.
2.  **Tuteur Socratique pur** : Les outils IA actuels (Lumi, AI Conversation) ont tendance à assister l'enseignant ou à donner des réponses, pas à guider l'élève via le questionnement sans jamais donner la solution.
3.  **Curriculum officiel digitalisé par pays** : Les LMS sont des "coquilles vides" ; l'enseignant doit tout importer. Maia arrive avec le contenu aligné nativement.
4.  **Heatmaps concepts élève + classe** : Les analytics actuels sont basés sur les notes/activités, pas sur la compréhension conceptuelle profonde ("L'élève maîtrise-t-il la distributivité ?").
5.  **Banks Socratiques par misconception** : Pas de bibliothèques structurées pour répondre spécifiquement aux erreurs de logique types.

---

## Section 5 — Sources et confiance

| Donnée | Source | Confiance |
| :--- | :--- | :--- |
| Market Share US Higher Ed | Wikipedia / On EdTech (2023) | Vérifié |
| Utilisateurs Google Classroom | Communiqué Google (2021) | Vérifié |
| Market Share Moodle Europe | Wikipedia / e-Literate (2017) | Moyenne (date un peu) |
| Smartschool Stats | Site officiel / Presse BE | Vérifié |
| Blackboard Bankruptcy | Reuters / WSJ (2025-2026) | Vérifié |
| Features IA (Lumi/LTI) | Documentation technique officielle | Vérifié |

---

## Section 6 — Input formules scientifiques (Tech Report)

Comment les LMS gèrent-ils l'input scientifique sur smartphone ?

| LMS | Auto-Unicode | LaTeX Input | Visual Editor | Virtual Keyboard | Handwriting / OCR | Pas de support |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Canvas** | ❌ | ✅ (via text) | ❌ (Mobile app) | ❌ | ❌ | ✅ (Plain) |
| **Google Class.** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **MS Teams** | ❌ | ❌ | ❌ | ❌ | ✅ (via OneNote) | ❌ |
| **Schoology** | ❌ | ✅ (LaTeX) | ❌ (Mobile app) | ❌ | ❌ | ✅ |
| **Blackboard** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Moodle** | ❌ | ✅ (Tex filter) | 🟡 (Mobile web) | ❌ | ❌ | ✅ |
| **D2L Brightspace**| ❌ | ✅ (LaTeX) | ❌ (Mobile app) | ❌ | ❌ | ✅ |
| **Smartschool** | ❌ | ❌ | ✅ (BookWidgets) | ✅ | ❌ | ❌ |
| **itslearning** | ❌ | ✅ (LaTeX) | ❌ | ❌ | ❌ | ✅ |
| **Pronote** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **IServ** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Magister** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### Analyse Technique (CTO Focus) :
*   **Rendu :** La majorité utilise **MathJax** ou **KaTeX** pour l'affichage (rendu web), mais l'input mobile est le parent pauvre.
*   **Outils tiers :** **Wiris (MathType)** est le standard d'intégration pour Moodle/Canvas, mais son UX mobile est médiocre (palettes trop petites).
*   **Handwriting :** Seul Microsoft (via l'intégration OneNote dans Teams) offre un support OCR/Handwriting décent sur mobile.
*   **UX mobile vs Desktop :** Rupture quasi-totale. Sur desktop, l'élève utilise un éditeur visuel ; sur mobile, il est souvent forcé d'écrire en plain text (ex: `x^2`) ou de ne pas pouvoir éditer de formules du tout.
*   **Opportunité Maia :** L'implémentation d'un **Virtual Math Keyboard** optimisé mobile ou d'un **Handwriting-to-LaTeX** (via Mathpix API ou similaire) serait un différenciateur technologique majeur.
