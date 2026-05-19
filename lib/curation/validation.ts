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

// ============================================================================
// Sprint 5 PR S5-2 — Hints CRUD
// ============================================================================

/**
 * Kinds canoniques cohérent CHECK migration `question_hints.kind`.
 * - validation : "Tu as bien utilisé X 👍" (renforce ce qui est correct)
 * - guided_question : "Regarde Y : ... Combien font ... ?" (méthode socratique)
 * - encouragement : "C'est une erreur classique en X, tu vas y arriver"
 * - strong_hint : indice direct juste avant la réponse (réservé ordinal 4-5)
 */
export const HINT_KINDS = [
  "validation",
  "guided_question",
  "encouragement",
  "strong_hint",
] as const;
export type HintKind = (typeof HINT_KINDS)[number];

export function isHintKind(x: unknown): x is HintKind {
  return typeof x === "string" && (HINT_KINDS as readonly string[]).includes(x);
}

const HINT_TEMPLATE_MIN = 20;
const HINT_TEMPLATE_MAX = 1500;
const HINT_ORDINAL_MIN = 1;
const HINT_ORDINAL_MAX = 5;

/**
 * Valide un payload POST hint.
 *
 * Champs requis : template, ordinal, kind.
 * Champ optionnel : misconception_id (UUID ou null pour explicit detach).
 *
 * Note : approved_at NON exposé en POST — on force NULL côté API
 * (brouillon par défaut, le prof doit explicitement publier via PUT).
 */
export type HintPostValidation =
  | {
      ok: true;
      template: string;
      ordinal: number;
      kind: HintKind;
      misconceptionId: string | null;
    }
  | { ok: false; error: string; status: number };

export function validateHintPostBody(body: unknown): HintPostValidation {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body JSON invalide", status: 400 };
  }
  const obj = body as Record<string, unknown>;

  if (typeof obj.template !== "string") {
    return { ok: false, error: "template doit être un string", status: 400 };
  }
  const template = obj.template.trim();
  if (template.length < HINT_TEMPLATE_MIN || template.length > HINT_TEMPLATE_MAX) {
    return {
      ok: false,
      error: `template doit faire ${HINT_TEMPLATE_MIN}-${HINT_TEMPLATE_MAX} caractères`,
      status: 400,
    };
  }

  if (
    typeof obj.ordinal !== "number" ||
    !Number.isInteger(obj.ordinal) ||
    obj.ordinal < HINT_ORDINAL_MIN ||
    obj.ordinal > HINT_ORDINAL_MAX
  ) {
    return {
      ok: false,
      error: `ordinal doit être un entier ${HINT_ORDINAL_MIN}-${HINT_ORDINAL_MAX}`,
      status: 400,
    };
  }

  if (!isHintKind(obj.kind)) {
    return {
      ok: false,
      error: `kind doit être l'un de : ${HINT_KINDS.join(", ")}`,
      status: 400,
    };
  }

  let misconceptionId: string | null = null;
  if (obj.misconception_id !== undefined && obj.misconception_id !== null) {
    if (!isValidUuid(obj.misconception_id)) {
      return { ok: false, error: "misconception_id doit être un UUID valide", status: 400 };
    }
    misconceptionId = obj.misconception_id;
  }

  return {
    ok: true,
    template,
    ordinal: obj.ordinal,
    kind: obj.kind,
    misconceptionId,
  };
}

/**
 * Valide un payload PUT hint (édition partielle).
 *
 * Au moins un champ requis. `approved_at` accepte true/false :
 *   - true → publie (timestamptz NOW côté DB)
 *   - false → re-brouillon (NULL côté DB)
 *   - undefined → laisse intact
 *
 * `misconception_id` accepte null (détacher) ou UUID (attacher) ou undefined.
 */
export type HintPutValidation =
  | {
      ok: true;
      update: {
        template?: string;
        ordinal?: number;
        kind?: HintKind;
        misconceptionId?: string | null;
        approved?: boolean;
      };
    }
  | { ok: false; error: string; status: number };

export function validateHintPutBody(body: unknown): HintPutValidation {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body JSON invalide", status: 400 };
  }
  const obj = body as Record<string, unknown>;
  const update: {
    template?: string;
    ordinal?: number;
    kind?: HintKind;
    misconceptionId?: string | null;
    approved?: boolean;
  } = {};

  if (obj.template !== undefined) {
    if (typeof obj.template !== "string") {
      return { ok: false, error: "template doit être un string", status: 400 };
    }
    const trimmed = obj.template.trim();
    if (trimmed.length < HINT_TEMPLATE_MIN || trimmed.length > HINT_TEMPLATE_MAX) {
      return {
        ok: false,
        error: `template doit faire ${HINT_TEMPLATE_MIN}-${HINT_TEMPLATE_MAX} caractères`,
        status: 400,
      };
    }
    update.template = trimmed;
  }

  if (obj.ordinal !== undefined) {
    if (
      typeof obj.ordinal !== "number" ||
      !Number.isInteger(obj.ordinal) ||
      obj.ordinal < HINT_ORDINAL_MIN ||
      obj.ordinal > HINT_ORDINAL_MAX
    ) {
      return {
        ok: false,
        error: `ordinal doit être un entier ${HINT_ORDINAL_MIN}-${HINT_ORDINAL_MAX}`,
        status: 400,
      };
    }
    update.ordinal = obj.ordinal;
  }

  if (obj.kind !== undefined) {
    if (!isHintKind(obj.kind)) {
      return {
        ok: false,
        error: `kind doit être l'un de : ${HINT_KINDS.join(", ")}`,
        status: 400,
      };
    }
    update.kind = obj.kind;
  }

  if (obj.misconception_id !== undefined) {
    if (obj.misconception_id === null) {
      update.misconceptionId = null;
    } else if (!isValidUuid(obj.misconception_id)) {
      return { ok: false, error: "misconception_id doit être un UUID valide ou null", status: 400 };
    } else {
      update.misconceptionId = obj.misconception_id;
    }
  }

  if (obj.approved !== undefined) {
    if (typeof obj.approved !== "boolean") {
      return { ok: false, error: "approved doit être un boolean", status: 400 };
    }
    update.approved = obj.approved;
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "Au moins un champ à mettre à jour requis", status: 400 };
  }
  return { ok: true, update };
}
