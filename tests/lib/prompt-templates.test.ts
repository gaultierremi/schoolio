import { describe, it, expect } from "vitest";
import { renderTemplate } from "@/lib/prompt-templates";

describe("renderTemplate", () => {
  it("substitutes a single slot", () => {
    const result = renderTemplate("Tu as mis {value} dans V.", { value: "250" });
    expect(result).toBe("Tu as mis 250 dans V.");
  });

  it("substitutes multiple slots", () => {
    const result = renderTemplate(
      "{variable} = {a} × {b}",
      { variable: "n", a: "0,5", b: "0,25" }
    );
    expect(result).toBe("n = 0,5 × 0,25");
  });

  it("accepts number values and converts to string", () => {
    const result = renderTemplate("Concentration : {c} mol/L", { c: 0.5 });
    expect(result).toBe("Concentration : 0.5 mol/L");
  });

  it("leaves unknown slots intact (as warning marker)", () => {
    const result = renderTemplate("Hello {unknown}", {});
    expect(result).toBe("Hello {{unknown}}");
  });

  it("escapes literal braces with backslash", () => {
    const result = renderTemplate("Use \\{example\\}", {});
    expect(result).toBe("Use {example}");
  });

  it("escaped braces are independent of substitution", () => {
    const result = renderTemplate("Use \\{name\\}: {name}", { name: "V" });
    expect(result).toBe("Use {name}: V");
  });

  it("returns the template unchanged when there are no slots", () => {
    const result = renderTemplate("Pas de slot ici.", { ignored: "x" });
    expect(result).toBe("Pas de slot ici.");
  });
});
