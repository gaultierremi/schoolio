/**
 * Sprint 2B — Validation helpers pour la vue concept unifiée.
 *
 * Pures functions sans dépendance Supabase, testables en isolation.
 * Utilisées par les routes /api/curation/concept/[id]/{theory,misconceptions}.
 */

export const SECTION_KINDS = [
  "definition",
  "formules",
  "exemples",
  "prerequis",
  "pieges",
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Section kind reconnue (5 valeurs canoniques, cohérent avec CHECK migration). */
export function isSectionKind(x: unknown): x is SectionKind {
  return typeof x === "string" && (SECTION_KINDS as readonly string[]).includes(x);
}

export function isValidUuid(x: unknown): x is string {
  return typeof x === "string" && UUID_REGEX.test(x);
}

/**
 * Valide un payload PUT theory.
 * Retourne { ok: true, ... } ou { ok: false, error, status }.
 */
export type TheoryPutValidation =
  | { ok: true; sectionKind: SectionKind; content: string }
  | { ok: false; error: string; status: number };

export function validateTheoryPutBody(body: unknown): TheoryPutValidation {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body JSON invalide", status: 400 };
  }
  const obj = body as Record<string, unknown>;

  if (!isSectionKind(obj.section_kind)) {
    return { ok: false, error: "section_kind invalide", status: 400 };
  }
  if (typeof obj.content !== "string") {
    return { ok: false, error: "content doit être un string", status: 400 };
  }
  if (obj.content.length < 1 || obj.content.length > 4000) {
    return {
      ok: false,
      error: "content doit être un string de 1-4000 caractères",
      status: 400,
    };
  }
  return { ok: true, sectionKind: obj.section_kind, content: obj.content };
}

/**
 * Valide un payload POST misconception.
 */
export type MisconceptionPostValidation =
  | { ok: true; label: string }
  | { ok: false; error: string; status: number };

export function validateMisconceptionPostBody(body: unknown): MisconceptionPostValidation {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body JSON invalide", status: 400 };
  }
  const obj = body as Record<string, unknown>;

  if (typeof obj.label !== "string") {
    return { ok: false, error: "label doit être un string", status: 400 };
  }
  const trimmed = obj.label.trim();
  if (trimmed.length < 1 || trimmed.length > 300) {
    return { ok: false, error: "label doit faire 1-300 caractères", status: 400 };
  }
  return { ok: true, label: trimmed };
}

/**
 * Valide un payload PUT misconception : au moins un champ (label ou ordinal) doit être fourni.
 */
export type MisconceptionPutValidation =
  | { ok: true; update: { label?: string; ordinal?: number } }
  | { ok: false; error: string; status: number };

export function validateMisconceptionPutBody(body: unknown): MisconceptionPutValidation {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body JSON invalide", status: 400 };
  }
  const obj = body as Record<string, unknown>;
  const update: { label?: string; ordinal?: number } = {};

  if (obj.label !== undefined) {
    if (typeof obj.label !== "string") {
      return { ok: false, error: "label doit être un string", status: 400 };
    }
    const trimmed = obj.label.trim();
    if (trimmed.length < 1 || trimmed.length > 300) {
      return { ok: false, error: "label doit faire 1-300 caractères", status: 400 };
    }
    update.label = trimmed;
  }

  if (obj.ordinal !== undefined) {
    if (
      typeof obj.ordinal !== "number" ||
      !Number.isInteger(obj.ordinal) ||
      obj.ordinal < 1 ||
      obj.ordinal > 10
    ) {
      return { ok: false, error: "ordinal doit être un entier 1-10", status: 400 };
    }
    update.ordinal = obj.ordinal;
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "Au moins un champ (label ou ordinal) requis", status: 400 };
  }
  return { ok: true, update };
}

/**
 * Auto-ordinal helper : prend l'ordinal max existant et retourne le suivant,
 * ou null si on dépasse la borne (10 par défaut pour misconceptions / théorie).
 */
export function nextOrdinal(
  currentMax: number | null | undefined,
  max: number = 10,
): number | null {
  const next = (currentMax ?? 0) + 1;
  return next > max ? null : next;
}
