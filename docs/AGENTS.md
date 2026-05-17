# Agents IA — Projet Maïa

Cinq agents IA interviennent sur le projet. Chacun a un périmètre précis ; les mixer crée de la confusion et des conflits de contexte.

---

## Claudy

**Rôle :** agent principal du repo Maïa. Claude Code local, lancé dans `D:\schoolio`.

**Utiliser pour :**
- Nouvelles features produit (routes API, pages Next.js, logique métier)
- Refactoring sur le repo principal
- Debug et investigation de bugs complexes
- Revue de code et questions d'architecture sur Maïa

**Ne pas utiliser pour :**
- Composants UI purs (→ Coco)
- Tooling Mission Control (→ Claudia)
- Tâches longues autonomes sans supervision (→ Jules)
- Requêtes depuis le téléphone sans PC allumé (→ @claude)

**PC requis :** oui — tourne en local sur `D:\schoolio`.

---

## Coco

**Rôle :** agent UI. Codex local, lancé dans `D:\schoolio-coco`, spécialisé React/Tailwind.

**Utiliser pour :**
- Création et refactoring de composants React
- Ajustements Tailwind, responsive, accessibilité
- Itérations rapides sur le design système
- Génération de variantes visuelles (couleurs, layouts, états)

**Ne pas utiliser pour :**
- Logique métier ou appels API (il ne voit pas le contexte Supabase/auth)
- Migrations de base de données
- Tout ce qui touche `lib/api/`, `lib/db/`, ou `middleware.ts`

**PC requis :** oui — tourne en local sur `D:\schoolio-coco`.

---

## Claudia

**Rôle :** agent meta-outillage. Claude Code local, lancé dans `D:\mission-control`.

**Utiliser pour :**
- Développement et maintenance du toolkit Mission Control
- Scripts d'automatisation, hooks, reporting inter-agents
- Revue de plan Claudy (sprint complexe > 5 étapes ou > 3 fichiers, cf. CLAUDE.md règle 21)
- Tooling de dev (CI, scripts PowerShell, configuration harness)

**Ne pas utiliser pour :**
- Features produit Maïa (elle n'a pas le contexte complet du repo)
- Composants UI (→ Coco)
- Tâches asynchrones cloud (→ Jules ou @claude)

**PC requis :** oui — tourne en local sur `D:\mission-control`.

---

## Jules

**Rôle :** agent cloud Google Jules. Autonome, asynchrone, sans intervention humaine pendant l'exécution.

**Utiliser pour :**
- Features bien spécifiées nécessitant plusieurs heures de travail
- Tâches qui peuvent tourner sans surveillance (ex : implémenter un module entier à partir d'un spec détaillé)
- Travail en parallèle pendant que Claudy traite autre chose

**Ne pas utiliser pour :**
- Tâches qui nécessitent des allers-retours fréquents (Jules ne demande pas de clarification en cours de route)
- Accès à des secrets locaux ou à des services non exposés publiquement
- Urgences — le démarrage prend du temps et le résultat n'est pas immédiat
- Tout ce qui touche à la sécurité ou aux permissions (trop risqué sans supervision)

**PC requis :** non — agent cloud, fonctionne sans PC allumé.

---

## @claude (GitHub Action)

**Rôle :** agent cloud Anthropic, déclenché par mention `@claude` dans une issue ou PR GitHub.

**Utiliser pour :**
- Tâches déclenchées depuis le téléphone (PC éteint)
- Création de fichiers de documentation
- Revue rapide d'une PR ou réponse à une question sur une issue
- Petites implémentations autonomes (fichier unique, logique simple)
- Triage et clarification d'issues

**Ne pas utiliser pour :**
- Features complexes multi-fichiers (contexte limité, pas d'accès au runtime local)
- Tâches qui nécessitent de lancer des serveurs ou des tests d'intégration
- Accès à des variables d'environnement locales ou à Supabase en direct
- Modifications de `.github/workflows/` (permissions insuffisantes)

**PC requis :** non — agent cloud GitHub Actions.

---

## Tableau de routage rapide

| Type de tâche | Agent recommandé |
|---|---|
| Nouvelle feature produit (API, page, logique) | **Claudy** |
| Composant React / UI Tailwind | **Coco** |
| Script d'automatisation / Mission Control | **Claudia** |
| Revue de plan complexe (> 5 étapes) | **Claudia** |
| Feature longue autonome bien spécifiée | **Jules** |
| Tâche depuis le téléphone, PC éteint | **@claude** |
| Doc rapide / triage d'issue | **@claude** |
| Bug complexe avec contexte full-stack | **Claudy** |
| Itération design / responsive | **Coco** |
| CI, hooks, tooling dev | **Claudia** |
