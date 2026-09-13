/**
 * Invariant 2 — Porte unique : les 4 chemins de création manuelle d'une question
 * (saisie, duplication, drafts PDF, import depuis la banque publique).
 *
 * Avec le nouveau DEFAULT false, une question tapée par le prof naîtrait
 * inactive — donc non assignable — et invisible dans la file « à relire »
 * (isPending exige une origine IA/PDF). Elle atterrirait dans « Validées » tout
 * en étant éteinte : le piège que le chantier ferme, resservi ailleurs. Une
 * question saisie par le prof est relue par définition : elle doit naître
 * is_active=true ET validated_at posé.
 *
 * TEST STRUCTUREL, assumé comme tel : useQuestionsPage est un hook React client
 * (useState/useEffect + @/lib/supabase-browser). Le rendre sous vitest
 * exigerait @testing-library/react, qui n'est pas dans les devDependencies, et
 * ajouter une dépendance est hors du périmètre de cette nuit. On vérifie donc
 * le SOURCE : chaque `.from("teacher_questions").insert(` du hook porte les deux
 * champs. Moins fort qu'un test comportemental, mais il casse dès qu'on retire
 * l'un des deux d'un payload — et il casse aussi si un 5e chemin de création
 * apparaît sans les poser.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = readFileSync(
  path.resolve(__dirname, "../../app/accueil/curation/_hooks/useQuestionsPage.ts"),
  "utf8",
);

/** Découpe le source en blocs commençant à chaque insert sur teacher_questions. */
function insertBlocks(src: string): string[] {
  const marker = /from\("teacher_questions"\)\s*\.insert\(/g;
  const starts: number[] = [];
  for (let m = marker.exec(src); m; m = marker.exec(src)) starts.push(m.index);
  return starts.map((s, i) => src.slice(s, starts[i + 1] ?? s + 1200));
}

describe("useQuestionsPage — les 4 chemins de création manuelle", () => {
  const blocks = insertBlocks(SRC);

  it("il existe exactement 4 inserts sur teacher_questions (saisie, duplication, drafts PDF, import)", () => {
    expect(blocks).toHaveLength(4);
  });

  it.each(blocks.map((b, i) => [i + 1, b] as const))(
    "l'insert n°%i pose is_active: true",
    (_i, block) => {
      // Soit dans le payload littéral, soit via le spread { ...payload, is_active: true }.
      expect(block).toMatch(/is_active:\s*true/);
    },
  );

  it.each(blocks.map((b, i) => [i + 1, b] as const))(
    "l'insert n°%i pose validated_at (horodatage)",
    (_i, block) => {
      expect(block).toMatch(/validated_at:\s*new Date\(\)\.toISOString\(\)/);
    },
  );

  it("aucun insert ne pose is_active: false ni validated_at: null (une question du prof n'est jamais créée éteinte)", () => {
    for (const b of blocks) {
      expect(b).not.toMatch(/is_active:\s*false/);
      expect(b).not.toMatch(/validated_at:\s*null/);
    }
  });

  it("le chemin de duplication est bien l'un des 4 (préfixe « Copie — »)", () => {
    expect(blocks.some((b) => b.includes("Copie —"))).toBe(true);
  });
});
