import { describe, it, expect } from "vitest";
import { formatIsoDateInBelgium, isValidIsoDate } from "@/lib/plan-maia-date";

describe("formatIsoDateInBelgium (B3 fix)", () => {
  it("respects Europe/Brussels timezone (summer, UTC+2)", () => {
    // 17 mai 2026 22:30 UTC = 18 mai 00:30 Belgique (été UTC+2)
    const utcLateNight = new Date("2026-05-17T22:30:00Z");
    expect(formatIsoDateInBelgium(utcLateNight)).toBe("2026-05-18");
  });

  it("respects Europe/Brussels timezone (winter, UTC+1)", () => {
    // 17 janvier 2026 23:30 UTC = 18 janvier 00:30 Belgique (hiver UTC+1)
    const utcLateNight = new Date("2026-01-17T23:30:00Z");
    expect(formatIsoDateInBelgium(utcLateNight)).toBe("2026-01-18");
  });

  it("returns same date when UTC and Belgium are on the same day", () => {
    // Mi-journée : pas d'ambiguïté
    const noon = new Date("2026-05-18T12:00:00Z");
    expect(formatIsoDateInBelgium(noon)).toBe("2026-05-18");
  });

  it("handles DST transition (last Sunday of October, UTC+2 → UTC+1)", () => {
    // 26 oct 2025 = dernier dimanche d'octobre, fin de l'été
    // 23:30 UTC = 00:30 Belgique mais après transition c'est UTC+1
    const dst = new Date("2025-10-26T22:30:00Z");
    // 22:30 UTC = 23:30 (hiver UTC+1, après transition à 3h locale) le 26 oct
    expect(formatIsoDateInBelgium(dst)).toBe("2025-10-26");
  });
});

describe("isValidIsoDate", () => {
  it("accepts valid YYYY-MM-DD strings", () => {
    expect(isValidIsoDate("2026-05-18")).toBe(true);
    expect(isValidIsoDate("2026-01-01")).toBe(true);
    expect(isValidIsoDate("2026-12-31")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true); // leap year
  });

  it("rejects invalid date values", () => {
    expect(isValidIsoDate("2026-02-30")).toBe(false); // pas de 30 février
    expect(isValidIsoDate("2025-02-29")).toBe(false); // non-leap year
    expect(isValidIsoDate("2026-13-01")).toBe(false); // mois 13
    expect(isValidIsoDate("2026-00-15")).toBe(false); // mois 0
    expect(isValidIsoDate("2026-06-32")).toBe(false); // jour 32
  });

  it("rejects malformed strings", () => {
    expect(isValidIsoDate("2026-5-18")).toBe(false); // un seul digit
    expect(isValidIsoDate("18-05-2026")).toBe(false); // wrong format
    expect(isValidIsoDate("2026/05/18")).toBe(false); // wrong separator
    expect(isValidIsoDate("not-a-date")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});
