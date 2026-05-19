import { describe, it, expect } from "vitest";
import {
  HINT_KINDS,
  isHintKind,
  validateHintPostBody,
  validateHintPutBody,
} from "@/lib/curation/validation";

const VALID_UUID = "0123abcd-0123-0123-0123-0123456789ab";
const TEMPLATE_OK = "Regarde la formule : que vaut 3 fois 4 ? Utilise le tableau."; // 60 chars

describe("isHintKind", () => {
  it("accepts canonical kinds", () => {
    for (const k of HINT_KINDS) {
      expect(isHintKind(k)).toBe(true);
    }
  });

  it("rejects unknown", () => {
    expect(isHintKind("hint")).toBe(false);
    expect(isHintKind("")).toBe(false);
    expect(isHintKind(null)).toBe(false);
    expect(isHintKind(undefined)).toBe(false);
    expect(isHintKind(42)).toBe(false);
  });
});

describe("validateHintPostBody", () => {
  it("accepts minimal valid payload", () => {
    const result = validateHintPostBody({
      template: TEMPLATE_OK,
      ordinal: 1,
      kind: "guided_question",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template).toBe(TEMPLATE_OK);
      expect(result.ordinal).toBe(1);
      expect(result.kind).toBe("guided_question");
      expect(result.misconceptionId).toBeNull();
    }
  });

  it("accepts optional misconception_id (UUID)", () => {
    const result = validateHintPostBody({
      template: TEMPLATE_OK,
      ordinal: 2,
      kind: "validation",
      misconception_id: VALID_UUID,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.misconceptionId).toBe(VALID_UUID);
  });

  it("accepts misconception_id = null (explicit detach)", () => {
    const result = validateHintPostBody({
      template: TEMPLATE_OK,
      ordinal: 1,
      kind: "guided_question",
      misconception_id: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.misconceptionId).toBeNull();
  });

  it("rejects non-object body", () => {
    expect(validateHintPostBody(null).ok).toBe(false);
    expect(validateHintPostBody("foo").ok).toBe(false);
    expect(validateHintPostBody(42).ok).toBe(false);
  });

  it("rejects template trop court (< 20 chars)", () => {
    const result = validateHintPostBody({
      template: "Court",
      ordinal: 1,
      kind: "guided_question",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects template trop long (> 1500 chars)", () => {
    const result = validateHintPostBody({
      template: "x".repeat(1501),
      ordinal: 1,
      kind: "guided_question",
    });
    expect(result.ok).toBe(false);
  });

  it("trim template avant comparaison length", () => {
    const result = validateHintPostBody({
      template: `   ${TEMPLATE_OK}   `,
      ordinal: 1,
      kind: "guided_question",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.template).toBe(TEMPLATE_OK);
  });

  it("rejects ordinal hors range 1-5", () => {
    for (const bad of [0, 6, 10, -1, 1.5]) {
      const result = validateHintPostBody({
        template: TEMPLATE_OK,
        ordinal: bad,
        kind: "guided_question",
      });
      expect(result.ok).toBe(false);
    }
  });

  it("rejects kind invalide", () => {
    const result = validateHintPostBody({
      template: TEMPLATE_OK,
      ordinal: 1,
      kind: "indice",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects misconception_id non-UUID", () => {
    const result = validateHintPostBody({
      template: TEMPLATE_OK,
      ordinal: 1,
      kind: "guided_question",
      misconception_id: "not-a-uuid",
    });
    expect(result.ok).toBe(false);
  });
});

describe("validateHintPutBody", () => {
  it("accepts partial update (template only)", () => {
    const result = validateHintPutBody({ template: TEMPLATE_OK });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.update.template).toBe(TEMPLATE_OK);
  });

  it("accepts approved: true (publish)", () => {
    const result = validateHintPutBody({ approved: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.update.approved).toBe(true);
  });

  it("accepts approved: false (re-brouillon)", () => {
    const result = validateHintPutBody({ approved: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.update.approved).toBe(false);
  });

  it("accepts misconception_id: null (détacher)", () => {
    const result = validateHintPutBody({ misconception_id: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.update.misconceptionId).toBeNull();
  });

  it("accepts misconception_id: UUID (attacher)", () => {
    const result = validateHintPutBody({ misconception_id: VALID_UUID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.update.misconceptionId).toBe(VALID_UUID);
  });

  it("rejects empty update", () => {
    const result = validateHintPutBody({});
    expect(result.ok).toBe(false);
  });

  it("rejects approved non-boolean", () => {
    expect(validateHintPutBody({ approved: "yes" }).ok).toBe(false);
    expect(validateHintPutBody({ approved: 1 }).ok).toBe(false);
  });

  it("rejects misconception_id ni null ni UUID", () => {
    expect(validateHintPutBody({ misconception_id: 42 }).ok).toBe(false);
    expect(validateHintPutBody({ misconception_id: "abc" }).ok).toBe(false);
  });

  it("rejects ordinal hors range", () => {
    expect(validateHintPutBody({ ordinal: 0 }).ok).toBe(false);
    expect(validateHintPutBody({ ordinal: 6 }).ok).toBe(false);
    expect(validateHintPutBody({ ordinal: 1.5 }).ok).toBe(false);
  });

  it("rejects kind invalide", () => {
    expect(validateHintPutBody({ kind: "hint" }).ok).toBe(false);
  });

  it("accepts combo update (template + approved)", () => {
    const result = validateHintPutBody({
      template: TEMPLATE_OK,
      approved: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.update.template).toBe(TEMPLATE_OK);
      expect(result.update.approved).toBe(true);
    }
  });
});
