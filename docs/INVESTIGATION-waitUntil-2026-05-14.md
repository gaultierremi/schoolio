# Investigation waitUntil — 2026-05-14

## Résumé exécutif

**PR #24 n'a pas pu être validée empiriquement** : aucun job n'a été créé sur `question_generation_jobs` depuis le merge (02:54 UTC). Les 3 jobs encore présents dans la table datent tous d'avant le merge (02:45–02:48 UTC), utilisent `worker_count=6` (code pré-PR), et sont tous restés en `phase=generating_workers` sans jamais compléter. Le verdict sur PR #24 reste donc **ouvert** : le fix code est correct, mais il faut au minimum un test live pour confirmer.

Les signaux side-band sont en revanche très clairs : les seules erreurs Anthropic observées sur la fenêtre sont 3 × `Streaming is required for operations that may take longer than 10 minutes` à 02:24 UTC, qui ont été corrigées par **PR #47** (commit `a58e5ef`, 02:32 UTC) avant PR #24. Le seul worker Anthropic qui a réussi a pris **114,5 s** pour générer son output.

## Méthodo

- **Fenêtre temporelle** : `2026-05-14T02:00:00Z` → maintenant (~05:30 CEST).
- **Tables requêtées** (service_role via Supabase REST) :
  - `question_generation_jobs` (filtre `created_at>=02:00Z`)
  - `error_logs` (filtre `source LIKE 'api.courses.generate-questions%'`)
  - `ai_request_logs` (filtre `task_type=generate_questions`, plus une passe `provider_id=anthropic_claude` 24 h)
  - `ai_provider_quotas` (état cooldowns en fin d'investigation)
- **Repère temporel** :
  - PR #47 (streaming fix) mergée à **02:32 UTC** (commit `a58e5ef`)
  - PR #24 (concurrence 6→2 + logError) mergée à **02:54 UTC** (commit `eb18c54`)
- **Script reproductible** : `scripts/investigate-waitUntil-2026-05-14.mjs`. Mac sandbox a bloqué `node` direct ; l'exécution a été faite depuis la console JS d'une tab Chrome ouverte sur Supabase. Le script reste utile pour un futur run avec accès réseau normal.

## Faits

### Jobs `question_generation_jobs`

3 jobs au total dans la fenêtre. Tous datent d'**avant** PR #24, tous avec `worker_count = 6`.

| id (short) | created (UTC) | status  | phase                | workers | inserted | pages | error |
| ---------- | ------------- | ------- | -------------------- | ------- | -------- | ----- | ----- |
| `5f877edd` | 02:45:35      | running | generating_workers   | 1/6     | 0        | 176   | —     |
| `a9d97c8d` | 02:48:06      | running | generating_workers   | 0/6     | 0        | 176   | —     |
| `c0c55ddf` | 02:48:25      | running | generating_workers   | 0/6     | 0        | 176   | —     |

- **Tous trois** ciblaient le même cours (`2d72676f-…`), pages_count 176, target 300 questions, le même teacher.
- **Aucun** `completed_at` rempli, aucun `error_message` rempli — le row n'a jamais été mis à jour par la branche `catch` de `runGeneration`.
- **Aucun job post-PR #24** : `created_at` le plus récent est 02:48 UTC, alors que PR #24 a été mergée à 02:54 UTC.
- **Stuck depuis** : tous ont `phase_changed_at` antérieur à 02:48 UTC → bloqués depuis 2 h 40+ au moment de l'investigation.

Distribution :
- `by_status` → `running: 3`
- `by_phase` → `generating_workers: 3`
- `post_pr24_count` → **0**
- `pre_pr24_count` → 3
- `duration_post_pr24` → n/a (aucun job)

### Logs `error_logs` (source `api.courses.generate-questions*`)

3 rows, tous identiques :

```
source   : api.courses.generate-questions.POST
severity : error
message  : "Tous les fournisseurs IA sont indisponibles pour la tâche : generate_questions"
context  : { route: "/api/courses/generate-questions" }
user_id  : null  (le logError() n'a pas reçu user)
school_id: null
```

Horodatages : **02:08:48**, **02:18:38**, **02:24:41** UTC.

**Aucun row avec `source = 'api.courses.generate-questions.worker'`** (la nouvelle source instrumentée par PR #24). Conclusion logique vu qu'aucun job n'a tourné post-PR #24.

Le nouveau `source=...runGeneration` (utilisé dans le `catch` final) est également absent — confirme que les 3 jobs stuck n'ont jamais atteint la branche `catch`.

### Logs `ai_request_logs` Anthropic

5 rows sur `task_type=generate_questions` depuis 02:00 UTC :

| created (UTC) | provider          | status          | latency  | error message (short)                                                                              |
| ------------- | ----------------- | --------------- | -------- | -------------------------------------------------------------------------------------------------- |
| 02:08:48      | gemini_flash      | quota_exceeded  | 696 ms   | `[429] Quota exceeded ... free_tier_requests, limit 20, model gemini-2.5-flash`                    |
| 02:24:41      | anthropic_claude  | error           | 0 ms     | `Streaming is required for operations that may take longer than 10 minutes.`                       |
| 02:24:41      | anthropic_claude  | error           | 14 ms    | idem                                                                                                |
| 02:24:41      | anthropic_claude  | error           | 1 ms     | idem                                                                                                |
| 02:47:32      | anthropic_claude  | **success**     | **114 531 ms** | —                                                                                          |

Vue large (depuis 00:00 UTC, toutes tâches) :
```
generate_questions :: gemini_flash      :: success         = 12
generate_questions :: gemini_flash      :: quota_exceeded  = 1
generate_questions :: gemini_pro        :: quota_exceeded  = 3
generate_questions :: anthropic_claude  :: success         = 1
generate_questions :: anthropic_claude  :: error           = 3
infer_metadata     :: gemini_flash      :: success         = 5
infer_metadata     :: gemini_pro        :: quota_exceeded  = 1
explain_answer     :: gemini_flash      :: success         = 1
```

### État `ai_provider_quotas` (snapshot fin d'investigation)

- `anthropic_claude` : `requests_today=1`, daily_limit 1000, **pas de cooldown**.
- `gemini_pro` : cooldown jusqu'à **02:57 UTC** (1 h après le dernier quota_exceeded).
- `gemini_flash` : cooldown jusqu'à **03:08:48 UTC**, `requests_today=10` (free tier 20/day déjà entamé).
- Tous les autres providers : pas de Vision support → ai-router les filtre hors candidates pour `requireVision: true`.

Conséquence : entre ~02:18 et ~02:57, **seul `anthropic_claude` est dispo** sur l'axe Vision (Gemini Flash en cooldown depuis 02:08).

## Hypothèses confirmées / infirmées

### Confirmées par les données

1. **Anthropic SDK exigeait le streaming dès la première fenêtre.** Les 3 erreurs `Streaming is required` à 02:24 UTC sont antérieures à PR #47 (02:32). C'est la cause du bug observé dans le 1er bloc de jobs (avant 02:32).

2. **Après PR #47, Anthropic répond — mais lentement.** Le seul success Anthropic (job `5f877edd`, worker 1/6) a pris **114,5 s** sur un PDF de 176 pages. PDF Vision streaming est intrinsèquement lent.

3. **Le worker `5f877edd` qui a réussi est aussi le seul à avoir incrémenté `workers_completed`.** Les 5 autres workers de ce même job n'ont jamais logué ni success ni erreur dans `ai_request_logs`. Idem pour les 12 workers attendus des jobs `a9d97c8d` + `c0c55ddf` : **0 row dans ai_request_logs**. Le worker n'a donc pas atteint le `try { await provider.generateText(...) }` du router, OU le `finally` de log n'a jamais été exécuté.

4. **Le `catch` `runGeneration` n'a jamais tourné** : aucun row `status=failed`, aucun `error_message` rempli sur les 3 jobs. La fonction Vercel a été **kill brutalement** avant que le `await Promise.allSettled` se settle.

### Infirmée

- L'hypothèse "Anthropic throttle les 6 streaming parallèles" n'est ni confirmée ni infirmée mais probablement secondaire : on n'a pas vu un seul code 429 Anthropic dans `ai_request_logs`. Si Anthropic throttait, on s'attendrait à voir des erreurs `429`/`rate_limit`. À ce stade, l'évidence pointe plutôt vers **Vercel waitUntil killé** que vers Anthropic.

### Non testable avec les données actuelles

- L'effet de PR #24 (`MAX_WORKERS=2`, `Promise.allSettled`, logError par worker) : **aucun job n'a été lancé depuis le merge**. Ne sera observable qu'après un re-trigger live.

## Verdict

PR #24 = **⚠️ partial fix — non vérifié.**

Justification :
- Le code de PR #24 est défensif et bien orienté (concurrence ↓, instrumentation ↑, fail-soft).
- Mais le **root cause initial** (jobs stuck `generating_workers`) reste partagé entre 2 facteurs distincts :
  - **(A) bug Anthropic SDK** : non-streaming refusé > 10 min → déjà corrigé par PR #47 (a58e5ef), **avant** PR #24.
  - **(B) kill silencieux de `waitUntil`** : aucun log côté worker, aucun row failed côté job. Hypothèse principale = Vercel kill la fonction background quand elle dépasse une certaine durée ou que le runtime concurrence est trop élevé. PR #24 baisse la concurrence (atténuation) mais **ne résout pas le kill** si la cause vraie est un timeout `waitUntil`.

Sans test live post-PR #24, on ne peut pas exclure que la même symptôme réapparaisse — surtout sur PDF 176 pages où un worker prend déjà ~2 min seul. À 2 workers × 2 min sur Vercel hobby/pro, on est à la limite des 300 s `maxDuration`.

## Recommendations (prioritized)

1. **Re-trigger live avec instrumentation max — avant toute autre action.**
   Demander au prof testeur de relancer une génération sur le même cours 176 pages. Observer :
   - les rows `ai_request_logs` qui apparaissent en temps réel (1/worker attendu)
   - le row `question_generation_jobs` (transitions `running → done` ou `running → failed`)
   - les rows `error_logs` avec `source = '…worker'`
   Si après 5 min le job est encore `generating_workers` sans rows, on a la preuve que `waitUntil` se fait killer indépendamment du nombre de workers.

2. **Baisser MAX_WORKERS à 1 (sequential fallback) si test #1 échoue encore.**
   Un seul worker → ~2 min pour un PDF 176 p → comfortable sous `maxDuration=300`. Trade-off : générer moins de questions par appel (50 vs 100). Le prof peut re-trigger pour accumuler. C'est un patch low-risk avant d'envisager #3.
   Bonus : ajouter un `console.log` early dans `runGeneration` qui timestamp chaque phase, pour voir dans les logs Vercel si la fonction tourne ou est tuée.

3. **Migrer le runGeneration sur Trigger.dev (ou QStash, Inngest) — vraie résolution architecturale.**
   `waitUntil` n'est pas conçu pour des jobs > 1-2 min. On confond "extend response lifetime" et "background job system". Trigger.dev offre :
   - durabilité (retry, idempotency)
   - logs centralisés par job
   - timeouts explicites (15 min+)
   - no Vercel function timeout coupling
   Coût : 1-2 jours d'intégration, mais débloque toute la roadmap "génération volumineuse" (concept maps, hint banks, etc.) qui va aussi taper > 1 min.

## Annexes

### Reproductibilité
Script : `scripts/investigate-waitUntil-2026-05-14.mjs`. Lecture `.env.local`, requêtes REST Supabase, output JSON structuré. À relancer après chaque essai de fix pour comparer les distributions.

### Détails commits pertinents
- `a58e5ef` (PR #47, 02:32 UTC) — `client.messages.stream().finalMessage()` au lieu de `messages.create()`. Fixe les `Streaming is required`.
- `eb18c54` (PR #24, 02:54 UTC) — `MAX_WORKERS 6 → 2`, `Promise.allSettled`, `logError({source: '…worker', context: { workerIndex, durationMs, pdfSizeBytes }})`.

### Limites de l'investigation
- Aucune visibilité sur les logs Vercel (function runtime stdout/stderr). Si dispo, ils trancheraient l'hypothèse "kill silencieux".
- Aucun job post-merge ⇒ on ne mesure pas l'effet du fix.
- 1 seule success Anthropic ⇒ pas de distribution latence Anthropic statistiquement utile.
