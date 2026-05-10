# AI Router — Schoolio

Système de routing IA multi-provider avec cascade automatique, quota tracking et cache.

## Objectif

100% gratuit en bêta : zéro appel payant si les quotas free-tier suffisent.

## Providers (par ordre de priorité)

| ID | Nom | Limite/jour | EU | Vision |
|----|-----|-------------|-----|--------|
| `gemini_pro` | Gemini 2.5 Pro | 50 | ✅ | ✅ |
| `gemini_flash` | Gemini 2.5 Flash | 500 | ✅ | ✅ |
| `mistral_large` | Mistral Large | 100 | ✅ | ❌ |
| `cerebras_llama` | Cerebras Llama 3.1 70B | 1 000 | ❌ | ❌ |
| `groq_llama` | Groq Llama 3.1 70B | 500 | ❌ | ❌ |
| `groq_gemma` | Groq Gemma2 9B | 1 000 | ❌ | ❌ |
| `sambanova_llama` | SambaNova Llama 3.1 405B | 500 | ❌ | ❌ |
| `openrouter_free` | OpenRouter (free) | 200 | ❌ | ❌ |
| `cloudflare_ai` | Cloudflare Workers AI | 10 000 | ❌ | ❌ |

## Usage

```typescript
import { routeAIRequest, GracefulAIError } from "@/lib/ai-router";

const response = await routeAIRequest("explain_answer", prompt, {
  maxTokens: 300,
});
// response.text, response.provider, response.latencyMs

// Tâche vision (PDF)
const response = await routeAIRequest("extract_questions", prompt, {
  pdfBase64,
  requireVision: true,
  responseSchema: GEMINI_SCHEMA,
  cacheTtlMs: 0,
});

// Attraper les erreurs gracieuses
try {
  await routeAIRequest(...);
} catch (err) {
  if (err instanceof GracefulAIError) {
    return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
  }
}
```

## Options de routage

| Option | Type | Défaut | Description |
|--------|------|--------|-------------|
| `requireVision` | boolean | false | Filtre les providers sans support PDF |
| `requireEuCompliant` | boolean | false | Filtre les providers non-EU |
| `cacheTtlMs` | number | 86400000 | TTL cache en ms. 0 = désactivé |
| `responseSchema` | ResponseSchema | — | Schema Gemini (passé uniquement aux providers Gemini) |
| `maxTokens` | number | 4096 | Max tokens de sortie |
| `temperature` | number | 0.7 | Température |
| `jsonMode` | boolean | false | Forcer JSON output (providers OpenAI-compat) |

## Variables d'environnement

```bash
# Providers
GOOGLE_AI_API_KEY=...
MISTRAL_API_KEY=...          # optionnel
CEREBRAS_API_KEY=...         # optionnel
GROQ_API_KEY=...             # optionnel
SAMBANOVA_API_KEY=...        # optionnel
OPENROUTER_API_KEY=...       # optionnel
CLOUDFLARE_ACCOUNT_ID=...    # optionnel
CLOUDFLARE_API_TOKEN=...     # optionnel

# Forcer un provider spécifique (debug/tests)
AI_FORCE_PROVIDER=gemini_flash
```

## Comportement

1. **Cache** : SHA256(`taskType|prompt`). Hit → retourne sans appel provider. Désactivé pour les tâches vision.
2. **Quota** : Compteur daily remis à zéro à minuit. Si `requests_today >= daily_limit` → provider skippé.
3. **Cooldown** : Sur 429, le provider est mis en cooldown 1h.
4. **Cascade** : Les providers disponibles sont triés par priorité et essayés un à un.
5. **GracefulAIError** : Si tous les providers échouent, lève cette erreur → 503 côté route.

## Administration

Page `/admin/ai-router` : quotas en temps réel, logs des 50 dernières requêtes, stats cache, bouton "Vider le cache".

## Tâches reconnues

| Task type | Endpoint |
|-----------|----------|
| `explain_answer` | `POST /api/generate-explanation` |
| `infer_metadata` | `POST /api/courses/infer-metadata` |
| `extract_questions` | `POST /api/courses/[id]/extract-questions` |
| `extract_questions_from_pdf` | `POST /api/extract-questions` |
| `generate_questions` | `POST /api/courses/generate-questions` |
| `live_contextual_questions` | lib contextual-questions |
