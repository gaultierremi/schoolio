import { describe, it, expect } from "vitest";
import {
  renderHintTemplate,
  renderHints,
  type HintRow,
} from "@/lib/tutor/render-hints";

const row = (overrides: Partial<HintRow> = {}): HintRow => ({
  id: "h-1",
  question_id: "q-1",
  ordinal: 1,
  template: "Default template",
  kind: "guided_question",
  ...overrides,
});

describe("renderHintTemplate", () => {
  it("substitutes {wrong_answer}", () => {
    expect(
      renderHintTemplate("Tu as mis {wrong_answer}. Réfléchis.", { wrongAnswer: "250" }),
    ).toBe("Tu as mis 250. Réfléchis.");
  });

  it("substitutes multiple occurrences", () => {
    expect(
      renderHintTemplate("{wrong_answer} ? Vraiment {wrong_answer} ?", { wrongAnswer: "7 kg" }),
    ).toBe("7 kg ? Vraiment 7 kg ?");
  });

  it("leaves template unchanged when no slot", () => {
    expect(
      renderHintTemplate("Tu as bien commencé !", { wrongAnswer: "X" }),
    ).toBe("Tu as bien commencé !");
  });

  it("truncates very long wrong answers to 200 chars (anti-injection)", () => {
    const long = "x".repeat(500);
    const out = renderHintTemplate("Réponse : {wrong_answer}", { wrongAnswer: long });
    expect(out.length).toBe("Réponse : ".length + 200);
    expect(out.endsWith("x".repeat(200))).toBe(true);
  });

  it("handles empty wrongAnswer gracefully", () => {
    expect(
      renderHintTemplate("Tu as répondu : {wrong_answer}", { wrongAnswer: "" }),
    ).toBe("Tu as répondu : ");
  });
});

describe("renderHints", () => {
  it("sorts hints by ordinal", () => {
    const out = renderHints(
      [
        row({ id: "a", ordinal: 3, template: "Indice 3" }),
        row({ id: "b", ordinal: 1, template: "Indice 1" }),
        row({ id: "c", ordinal: 2, template: "Indice 2" }),
      ],
      { wrongAnswer: "" },
    );
    expect(out.map((h) => h.text)).toEqual(["Indice 1", "Indice 2", "Indice 3"]);
  });

  it("returns empty array when no hints", () => {
    expect(renderHints([], { wrongAnswer: "" })).toEqual([]);
  });

  it("preserves kind on each rendered hint", () => {
    const out = renderHints(
      [row({ kind: "encouragement", template: "T'inquiète." })],
      { wrongAnswer: "" },
    );
    expect(out[0].kind).toBe("encouragement");
  });
});
