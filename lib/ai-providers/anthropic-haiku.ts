// Anthropic Claude Haiku 4.5 provider — modèle rapide + low-cost.
// Utilisé pour les tâches simples (extraction TOC d'un PDF) où la qualité
// Sonnet est overkill. ~3-5x plus rapide que Sonnet, ~10x moins cher.
// Activable via RouteOptions.model='anthropic_haiku'.
//
// Implémentation partagée avec Sonnet via makeAnthropicProvider() pour
// éviter la duplication (CLAUDE.md règle 16).

import type { AIProvider } from "./types";
import { makeAnthropicProvider } from "./anthropic";

export const AnthropicHaikuProvider = (): AIProvider =>
  makeAnthropicProvider("claude-haiku-4-5-20251001", "anthropic_haiku");
