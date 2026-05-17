# Mobile Playbook — Déléguer aux agents depuis le téléphone

Mémo opérationnel. Pour choisir le bon agent, consulte [`docs/AGENTS.md`](./AGENTS.md).

---

## Pré-requis sur le téléphone

**Apps indispensables**
- **GitHub Mobile** (iOS/Android) — créer/commenter des issues, review des PRs, merger
- Navigateur (Safari/Chrome) — accès Vercel, Supabase dashboard, Eruda debug

**Accès à avoir configurés avant de partir sans PC**
- Compte GitHub connecté dans GitHub Mobile avec notifications activées
- Accès en lecture au repo `gaultierremi/maia` (pas besoin d'écriture — @claude pousse lui-même)
- URL Vercel prod bookmarkée : `https://schoolio-two.vercel.app`
- Accès Supabase dashboard (lecture seule suffit pour débugger) : `https://supabase.com/dashboard`

**Agents disponibles sans PC**
| Agent | Déclenché comment | Latence |
|---|---|---|
| `@claude` | Mention dans une issue/PR GitHub | 2–5 min |
| Jules | Interface web Google Jules | 30 min – 2 h |

Claudy, Coco et Claudia nécessitent le PC allumé. Depuis le téléphone, ils sont inaccessibles.

---

## Comment déléguer une tâche à @claude depuis le tel

### Principe

Ouvre ou crée une issue GitHub, colle ton brief avec `@claude` dedans. L'agent lit l'issue, code, crée une branche, pousse et te répond dans les commentaires de l'issue.

### Procédure pas à pas

1. **GitHub Mobile → repo `maia` → Issues → New issue**
2. Titre court et précis (ex : `Fix: badge décompte manquant sur tableau de bord prof`)
3. Corps de l'issue : colle ton brief (voir [Templates](#templates-de-briefs-courts-à-coller-dans-une-issue))
4. Soumets l'issue
5. @claude répond dans les 2–5 minutes avec une todo list et commence à travailler
6. Quand il a fini, il poste un lien "Create a PR" dans son commentaire
7. Tu review et merges depuis GitHub Mobile (voir section suivante)

### Exemple de prompt efficace

```
@claude dans `app/(dashboard)/teacher/page.tsx`, le badge qui affiche le
nombre d'élèves actifs retourne toujours 0. La logique se trouve probablement
dans la query Supabase autour de la ligne 45.

Fix le bug. Un seul fichier touché max, pas de refactor autour.
```

Ce qui rend ce prompt efficace :
- Fichier précis + numéro de ligne approximatif
- Description du symptôme, pas une hypothèse sur la cause
- Contrainte explicite sur le périmètre (1 fichier, pas de refactor)

---

## Comment déléguer à Jules depuis le tel

### Principe

Jules est un agent Google autonome. Il prend une spec, code pendant 30 min à 2 h, et ouvre une PR quand il a fini. Pas d'allers-retours pendant l'exécution.

### Procédure pas à pas

1. Ouvre `https://jules.google.com` dans ton navigateur mobile
2. Connecte-toi avec le compte Google associé au projet
3. Sélectionne le repo `gaultierremi/maia`
4. Décris la tâche dans le champ de saisie (voir format ci-dessous)
5. Lance la tâche — Jules crée une branche et commence
6. Tu reçois une notification quand la PR est prête (configurer les notifs email Jules)
7. Review et merge depuis GitHub Mobile

### Format de brief pour Jules

Jules n'interrompt pas pour clarifier — la spec doit être complète dès le départ.

```
Feature : [nom court]

Contexte :
- Quel fichier / module est concerné
- Quel est l'état actuel
- Pourquoi ce changement est nécessaire

Comportement attendu :
- Point 1
- Point 2
- ...

Contraintes :
- Pas de changement sur [fichier/module X]
- Utiliser [pattern Y] déjà en place
- Pas de nouvelles dépendances

Critère de done : [ce qui doit être vrai quand c'est fini]
```

### Quand NE PAS utiliser Jules depuis le tel

- Bug urgent (Jules est lent à démarrer)
- Tâche qui touche à la sécurité ou aux permissions
- Feature qui nécessite des allers-retours fréquents
- Moins de 30 min de travail estimé (→ @claude est plus adapté)

---

## Comment review et merger une PR depuis le tel

### Review dans GitHub Mobile

1. Notifications → sélectionne la PR
2. **Files changed** : scroll pour voir le diff
3. Pour commenter : appui long sur une ligne → "Add comment"
4. Si tout est bon : **Review changes → Approve** (ou laisser sans review et merger directement si tu fais confiance à @claude)

### Merger

1. Sur la page de la PR, scroll jusqu'en bas
2. Vérifie que les checks CI sont verts (icône ✓)
3. **Merge pull request → Confirm merge**
4. Optionnel : **Delete branch** après le merge

### Si les checks échouent

- Clique sur le check rouge pour voir les logs
- Si c'est un lint ou type error : laisse un commentaire `@claude fix the CI failure` sur la PR
- Si c'est un test d'intégration Supabase : attends d'avoir le PC pour investiguer

---

## Comment tester la prod (schoolio-two.vercel.app) en mobile

### Test fonctionnel basique

1. Ouvre `https://schoolio-two.vercel.app` dans le navigateur
2. Connecte-toi avec un compte de test (prof ou élève selon ce que tu testes)
3. Navigue dans le flux concerné par le changement déployé

### Vérifier que le bon déploiement est actif

- Vercel déploie automatiquement sur merge dans `main`
- Pour voir le statut : `https://vercel.com/dashboard` → projet `schoolio-two`
- Le dernier déploiement "Production" doit correspondre au commit que tu viens de merger

### Debug avec Eruda (console mobile)

Eruda injecte une console de développement dans n'importe quelle page web depuis le navigateur mobile.

**Activation :**
1. Dans le navigateur, ouvre la console JavaScript (selon le navigateur) **ou** crée un bookmark avec cette URL :
   ```
   javascript:(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/eruda';document.head.appendChild(s);s.onload=function(){eruda.init();}})();
   ```
2. Navigue sur `schoolio-two.vercel.app`
3. Exécute le bookmark — une icône flottante apparaît en bas à droite
4. Tape dessus → console, réseau, éléments DOM

**Utilisation :**
- Onglet **Console** : voir les erreurs JS et les `console.log`
- Onglet **Network** : voir les requêtes API, leurs statuts et réponses
- Onglet **Elements** : inspecter le DOM

**Limitation :** Eruda ne voit pas les Server Components Next.js ni les erreurs côté serveur. Pour les erreurs 500, vérifie les logs Vercel directement.

---

## Templates de briefs courts à coller dans une issue

### Template 1 — Créer un composant UI

```
@claude crée le composant `components/ui/[NomComposant].tsx`.

Rôle : [description en une phrase]

Props :
- `propA: string` — [description]
- `propB: boolean` — [description]

Comportement :
- [état par défaut]
- [état hover/focus/disabled si applicable]

Style : Tailwind uniquement, cohérent avec les composants existants dans `components/ui/`.
Pas de logique métier, pas d'appels API.
```

### Template 2 — Fixer un bug ciblé

```
@claude bug dans `[chemin/vers/fichier.tsx]` autour de la ligne [N].

Symptôme : [ce qui se passe]
Attendu : [ce qui devrait se passer]

Contexte :
- [variable ou état concerné]
- [condition qui déclenche le bug]

Fix uniquement ce fichier. Pas de refactor autour.
```

### Template 3 — Écrire un test

```
@claude écris un test pour `[chemin/vers/fichier.ts]`, fonction `[nomFonction]`.

Cas à couvrir :
1. [cas nominal]
2. [cas limite]
3. [cas d'erreur]

Framework déjà utilisé dans le projet : [vitest / jest — à vérifier avec `ls __tests__/`].
Place le test dans `__tests__/[nom].test.ts`.
```

### Template 4 — Mettre à jour de la doc

```
@claude mets à jour `docs/[FICHIER.md]`.

Section concernée : [titre de la section]

Changement à faire :
- [ce qui est obsolète / faux]
- [ce qui doit le remplacer]

Ton : pragmatique, français, pas de marketing. Cohérent avec le reste du fichier.
```

---

## Anti-patterns

Ce qu'il NE faut PAS demander à @claude depuis le tel.

**Ne pas demander de features multi-fichiers complexes**
@claude a un contexte limité et ne peut pas lancer le serveur de dev pour tester. Une feature qui touche 5+ fichiers ou qui implique une migration DB + une route API + un composant → attends d'avoir le PC ou délègue à Jules avec une spec complète.

**Ne pas demander des modifications de `.github/workflows/`**
Les permissions GitHub Actions ne le permettent pas. @claude refusera ou plantera silencieusement.

**Ne pas envoyer des briefs vagues**
`@claude améliore le dashboard` → résultat imprévisible. Précise toujours : quel fichier, quel symptôme, quelle contrainte de périmètre.

**Ne pas demander des tâches qui nécessitent des secrets locaux**
Variables d'environnement locales, accès Supabase en direct, appels à des services internes non exposés → impossible depuis un agent cloud.

**Ne pas lancer plusieurs @claude en parallèle sur des fichiers qui se croisent**
Deux agents qui modifient le même fichier simultanément créent des conflits. Lance-les séquentiellement ou sur des fichiers strictement séparés.

**Ne pas demander une urgence à Jules**
Jules prend 30 min minimum avant de produire quoi que ce soit. Pour un bug bloquant en prod, utilise @claude ou attends le PC.

**Ne pas oublier de merger (ou de fermer) les PRs ouvertes**
@claude crée une branche par issue. Si tu ne merges pas, les branches s'accumulent et les issues restent ouvertes. Passe 2 minutes dans GitHub Mobile à nettoyer après chaque session mobile.
