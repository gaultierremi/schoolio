import { describe, it, expect } from "vitest";
import {
  countStrugglingStudents,
  findStrongestConcept,
  findWeakestConcept,
  generateRemediationSuggestions,
  masteryCellClass,
  masteryLabel,
  masteryLevel,
  sortStudents,
  sortStudentsByDifficulty,
  statusLabel,
} from "@/lib/heatmap-mastery";

describe("masteryLevel", () => {
  it("returns 0 for non-evaluated (pct=0)", () => {
    expect(masteryLevel(0)).toBe(0);
  });

  it("maps according to mockup thresholds", () => {
    expect(masteryLevel(1)).toBe(1); // < 40
    expect(masteryLevel(39)).toBe(1);
    expect(masteryLevel(40)).toBe(2); // 40-54
    expect(masteryLevel(54)).toBe(2);
    expect(masteryLevel(55)).toBe(3); // 55-69
    expect(masteryLevel(69)).toBe(3);
    expect(masteryLevel(70)).toBe(4); // 70-84
    expect(masteryLevel(84)).toBe(4);
    expect(masteryLevel(85)).toBe(5); // 85-100
    expect(masteryLevel(100)).toBe(5);
  });
});

describe("masteryLabel", () => {
  it("returns a screen-reader friendly French label for each level", () => {
    expect(masteryLabel(0)).toBe("non évalué");
    expect(masteryLabel(1)).toMatch(/très faible/);
    expect(masteryLabel(2)).toMatch(/faible/);
    expect(masteryLabel(3)).toMatch(/moyen/);
    expect(masteryLabel(4)).toMatch(/bon/);
    expect(masteryLabel(5)).toMatch(/fort/);
  });
});

describe("masteryCellClass", () => {
  it("returns Tailwind classes for each level", () => {
    expect(masteryCellClass(0)).toMatch(/slate/);
    expect(masteryCellClass(1)).toMatch(/red/);
    expect(masteryCellClass(2)).toMatch(/orange/);
    expect(masteryCellClass(3)).toMatch(/yellow/);
    expect(masteryCellClass(4)).toMatch(/lime/);
    expect(masteryCellClass(5)).toMatch(/emerald/);
  });

  it("includes dark mode variants for all levels", () => {
    for (const lvl of [0, 1, 2, 3, 4, 5] as const) {
      expect(masteryCellClass(lvl)).toMatch(/dark:/);
    }
  });
});

describe("statusLabel", () => {
  it("returns French label + tone class per status", () => {
    expect(statusLabel("completed").label).toBe("Terminé");
    expect(statusLabel("in_progress").label).toBe("En cours");
    expect(statusLabel("not_started").label).toBe("Non commencé");
    expect(statusLabel("completed").toneClass).toMatch(/emerald/);
  });
});

describe("sortStudentsByDifficulty", () => {
  const students = [
    { display_name: "Alice", status: "completed" as const, masteries: [90, 85, 80] },
    { display_name: "Bob", status: "completed" as const, masteries: [40, 35, 30] },
    { display_name: "Charlie", status: "not_started" as const, masteries: [0, 0, 0] },
    { display_name: "Dani", status: "completed" as const, masteries: [65, 60, 55] },
  ];

  it("puts struggling students first, not_started at the bottom", () => {
    const sorted = sortStudentsByDifficulty(students);
    expect(sorted[0].display_name).toBe("Bob"); // lowest avg
    expect(sorted[1].display_name).toBe("Dani");
    expect(sorted[2].display_name).toBe("Alice");
    expect(sorted[3].display_name).toBe("Charlie"); // not_started pinned bottom
  });

  it("does not mutate input", () => {
    const copy = [...students];
    sortStudentsByDifficulty(students);
    expect(students).toEqual(copy);
  });
});

describe("sortStudents", () => {
  const students = [
    { display_name: "Charlie", status: "completed" as const, masteries: [50, 60] },
    { display_name: "Alice", status: "completed" as const, masteries: [90, 95] },
    { display_name: "Bob", status: "completed" as const, masteries: [30, 40] },
  ];

  it("alphabetical sort", () => {
    const sorted = sortStudents(students, "alphabetical");
    expect(sorted.map((s) => s.display_name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("score sort (highest avg first)", () => {
    const sorted = sortStudents(students, "score");
    expect(sorted.map((s) => s.display_name)).toEqual(["Alice", "Charlie", "Bob"]);
  });

  it("difficulty sort (lowest avg first)", () => {
    const sorted = sortStudents(students, "difficulty");
    expect(sorted.map((s) => s.display_name)).toEqual(["Bob", "Charlie", "Alice"]);
  });
});

describe("findWeakestConcept", () => {
  const concepts = [
    { id: "1", name: "Atomes" },
    { id: "2", name: "Stœchiométrie" },
    { id: "3", name: "Tableau périodique" },
  ];

  it("returns the concept with lowest class average", () => {
    const result = findWeakestConcept(concepts, [78, 38, 81]);
    expect(result?.concept.name).toBe("Stœchiométrie");
    expect(result?.pct).toBe(38);
  });

  it("ignores concepts with 0% (non évalués)", () => {
    const result = findWeakestConcept(concepts, [0, 70, 80]);
    expect(result?.concept.name).toBe("Stœchiométrie");
    expect(result?.pct).toBe(70);
  });

  it("returns null when all concepts are 0%", () => {
    const result = findWeakestConcept(concepts, [0, 0, 0]);
    expect(result).toBeNull();
  });
});

describe("findStrongestConcept", () => {
  const concepts = [
    { id: "1", name: "Atomes" },
    { id: "2", name: "Stœchiométrie" },
    { id: "3", name: "Tableau périodique" },
  ];

  it("returns the concept with highest class average", () => {
    const result = findStrongestConcept(concepts, [78, 38, 81]);
    expect(result?.concept.name).toBe("Tableau périodique");
    expect(result?.pct).toBe(81);
  });

  it("returns null when all concepts are 0%", () => {
    const result = findStrongestConcept(concepts, [0, 0, 0]);
    expect(result).toBeNull();
  });
});

describe("generateRemediationSuggestions", () => {
  const concepts = [
    { id: "1", name: "Atomes" },
    { id: "2", name: "Stœchiométrie" },
    { id: "3", name: "Solutions" },
    { id: "4", name: "Acides" },
  ];

  it("flags not_started students as 'info' severity with relance message", () => {
    const students = [
      {
        user_id: "u1",
        display_name: "Lou Beaumont",
        status: "not_started" as const,
        masteries: [0, 0, 0, 0],
      },
    ];
    const result = generateRemediationSuggestions(students, concepts);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("info");
    expect(result[0].reason).toMatch(/relance/);
    expect(result[0].redConceptNames).toHaveLength(0);
  });

  it("flags 3+ red concepts as 'high' severity with entretien individuel", () => {
    const students = [
      {
        user_id: "u1",
        display_name: "Mathéo Vandenbroucke",
        status: "completed" as const,
        masteries: [30, 25, 35, 70], // 3 red (< 40), 1 OK
      },
    ];
    const result = generateRemediationSuggestions(students, concepts);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("high");
    expect(result[0].reason).toMatch(/entretien individuel/);
    expect(result[0].redConceptNames).toEqual(["Atomes", "Stœchiométrie", "Solutions"]);
  });

  it("flags 1-2 red concepts as 'medium' severity with specific concepts to retry", () => {
    const students = [
      {
        user_id: "u1",
        display_name: "Kylian Dupuis",
        status: "completed" as const,
        masteries: [70, 22, 28, 70], // 2 red
      },
    ];
    const result = generateRemediationSuggestions(students, concepts);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("medium");
    expect(result[0].reason).toMatch(/Stœchiométrie \+ Solutions à reprendre/);
  });

  it("skips students with no red concepts (all >= 40%)", () => {
    const students = [
      {
        user_id: "u1",
        display_name: "Inès Charlier",
        status: "completed" as const,
        masteries: [88, 92, 82, 78],
      },
    ];
    const result = generateRemediationSuggestions(students, concepts);
    expect(result).toHaveLength(0);
  });

  it("sorts by severity (high > medium > info)", () => {
    const students = [
      {
        user_id: "u1",
        display_name: "Lou (info)",
        status: "not_started" as const,
        masteries: [0, 0, 0, 0],
      },
      {
        user_id: "u2",
        display_name: "Kylian (medium)",
        status: "completed" as const,
        masteries: [70, 22, 70, 70],
      },
      {
        user_id: "u3",
        display_name: "Mathéo (high)",
        status: "completed" as const,
        masteries: [30, 25, 35, 38],
      },
    ];
    const result = generateRemediationSuggestions(students, concepts);
    expect(result.map((s) => s.studentDisplayName)).toEqual([
      "Mathéo (high)",
      "Kylian (medium)",
      "Lou (info)",
    ]);
  });

  it("respects maxResults cap", () => {
    const students = Array.from({ length: 10 }, (_, i) => ({
      user_id: `u${i}`,
      display_name: `Élève ${i}`,
      status: "completed" as const,
      masteries: [20, 25, 30, 35], // tous "high" (4 red)
    }));
    const result = generateRemediationSuggestions(students, concepts, 3);
    expect(result).toHaveLength(3);
  });

  it("ignores 0% mastery (non évalué) when counting red concepts", () => {
    const students = [
      {
        user_id: "u1",
        display_name: "Victor (en cours)",
        status: "in_progress" as const,
        masteries: [25, 0, 0, 0], // 1 red, 3 non évalués (pas comptés)
      },
    ];
    const result = generateRemediationSuggestions(students, concepts);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("medium");
    expect(result[0].redConceptNames).toEqual(["Atomes"]);
  });
});

describe("countStrugglingStudents", () => {
  it("counts only students with non-zero avg < 50% (excludes not_started)", () => {
    const students = [
      { status: "completed" as const, masteries: [30, 35, 40] }, // avg 35 → struggling
      { status: "completed" as const, masteries: [80, 75, 70] }, // avg 75 → ok
      { status: "completed" as const, masteries: [45, 50, 55] }, // avg 50 → NOT < 50 (excluded)
      { status: "not_started" as const, masteries: [0, 0, 0] }, // excluded
      { status: "in_progress" as const, masteries: [25, 0, 0] }, // avg 25 → struggling
    ];
    expect(countStrugglingStudents(students)).toBe(2);
  });

  it("returns 0 when no one is struggling", () => {
    const students = [
      { status: "completed" as const, masteries: [80, 85, 90] },
      { status: "not_started" as const, masteries: [0, 0, 0] },
    ];
    expect(countStrugglingStudents(students)).toBe(0);
  });
});
