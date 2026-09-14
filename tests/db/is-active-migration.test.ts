/**
 * Invariant 2 — la migration de sécurité 20260913000000_is_active_single_gate.sql.
 *
 * Exécute scripts/verify-migration-is-active-single-gate.sh sur un Postgres
 * jetable si les binaires sont disponibles, sinon SKIP explicite (pas un faux
 * vert). Le script seede l'état réel de la prod — DEFAULT TRUE, 986 jamais
 * relues, 179 validées, 4 rejetées actives, 1 éteinte à la main — et vérifie
 * qu'après migration seules les 179 restent assignables, qu'une nouvelle ligne
 * naît inactive, et que le rejeu est un no-op.
 *
 * Pourquoi ce test existe alors que la migration est « juste du SQL » : c'est
 * ELLE qui empêche 986 questions jamais relues d'atteindre des élèves mineurs à
 * la seconde du déploiement du fix. Et son cas critique (les 4 rejetées restées
 * actives) n'est PAS reproductible sur une base de dev fraîche.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const PG_BIN = process.env.PG_BIN ?? "/usr/lib/postgresql/16/bin";
const hasPostgres = existsSync(path.join(PG_BIN, "postgres")) && existsSync(path.join(PG_BIN, "initdb"));
const SCRIPT = path.resolve(__dirname, "../../scripts/verify-migration-is-active-single-gate.sh");

describe("migration is_active_single_gate", () => {
  it.skipIf(!hasPostgres)(
    "sur l'état de départ de la prod : seules les 179 validées+actives restent assignables, les rejetées et les jamais-relues s'éteignent, le default passe à false, le rejeu est un no-op",
    () => {
      const out = execFileSync("bash", [SCRIPT], { encoding: "utf8", timeout: 120_000, env: { ...process.env, PG_BIN } });
      expect(out).toContain("MIGRATION OK");
      expect(out).not.toContain("FAIL");
      // Les assertions nommées, pour que l'échec dise QUOI.
      expect(out).toMatch(/ok\s+rejetee_active actives = 0/);
      expect(out).toMatch(/ok\s+validee_active actives = 179/);
      expect(out).toMatch(/ok\s+nouvelle ligne active = f/);
    },
    150_000,
  );

  it.skipIf(hasPostgres)("PROTOCOLE MANUEL (Postgres absent ici) : voir l'en-tête de scripts/verify-migration-is-active-single-gate.sh", () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });
});
