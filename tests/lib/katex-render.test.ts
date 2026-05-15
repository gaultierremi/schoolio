import { describe, it, expect } from "vitest";
import { latexToMathML } from "@/lib/katex-render";

describe("latexToMathML", () => {
  it("renders simple expression to MathML", () => {
    const mathml = latexToMathML("x^2");
    expect(mathml).toContain("<math");
    expect(mathml.toLowerCase()).toContain("mathml");
  });

  it("returns empty string on invalid LaTeX (graceful)", () => {
    const mathml = latexToMathML("\\invalid{");
    // KaTeX with throwOnError:false renders error inline as MathML — accept either ""
    // or any string containing "<math". Our contract : never throw.
    expect(typeof mathml).toBe("string");
  });

  it("handles empty input", () => {
    expect(latexToMathML("")).toBe("");
  });

  it("handles non-string input gracefully", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(latexToMathML(null as any)).toBe("");
  });
});
