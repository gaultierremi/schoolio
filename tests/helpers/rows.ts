/**
 * Évaluateur de filtres PostgREST en mémoire.
 *
 * Le faux client (supabase-mock.ts) journalise les filtres appliqués par une
 * route. Ce module les REJOUE sur un jeu de lignes, ce qui permet d'affirmer
 * des choses sur le résultat réel — « une question is_active=true SANS
 * validated_at est servie » — et pas seulement sur la forme de la requête.
 * Un test qui ne vérifie que « le filtre contient eq(is_active,true) » passerait
 * encore si quelqu'un ajoutait un second filtre restrictif ; celui qui rejoue
 * les filtres sur des lignes, non.
 */
import type { RecordedCall, FakeResponse } from "./supabase-mock";

export type Row = Record<string, unknown>;

export function applyFilters(rows: Row[], filters: RecordedCall["filters"]): Row[] {
  let out = rows;
  for (const [op, ...a] of filters) {
    const col = a[0] as string;
    switch (op) {
      case "eq":  out = out.filter((r) => r[col] === a[1]); break;
      case "neq": out = out.filter((r) => r[col] !== a[1]); break;
      case "in":  out = out.filter((r) => (a[1] as unknown[]).includes(r[col])); break;
      case "is":
        out = out.filter((r) => (a[1] === null ? r[col] == null : r[col] === a[1]));
        break;
      case "not":
        // .not(col, "is", null)  =>  col IS NOT NULL
        if (a[1] === "is") out = out.filter((r) => (a[2] === null ? r[col] != null : r[col] !== a[2]));
        break;
      case "lt":  out = out.filter((r) => (r[col] as never) < (a[1] as never)); break;
      case "gt":  out = out.filter((r) => (r[col] as never) > (a[1] as never)); break;
      case "limit": out = out.slice(0, a[0] as number); break;
      case "order": break; // l'ordre n'a pas d'incidence sur l'appartenance
      default: break;
    }
  }
  return out;
}

export type Dataset = Record<string, Row[]>;

/**
 * Handler générique piloté par un jeu de données : rejoue les filtres sur la
 * table demandée. Les écritures renvoient le payload (les routes font souvent
 * insert(...).select().single() et lisent la ligne retournée).
 * `overrides` permet d'intercepter un appel précis avant le comportement par
 * défaut (renvoyer undefined = laisser faire).
 */
export function datasetHandler(
  dataset: Dataset,
  overrides?: (call: RecordedCall) => FakeResponse | undefined,
) {
  return (call: RecordedCall): FakeResponse => {
    const o = overrides?.(call);
    if (o !== undefined) return o;

    if (call.op === "select") {
      const rows = applyFilters(dataset[call.table] ?? [], call.filters);
      if (call.isCount) return { count: rows.length, error: null };
      if (call.terminal === "single") {
        return rows[0]
          ? { data: rows[0], error: null }
          : { data: null, error: { code: "PGRST116", message: "0 rows" } };
      }
      if (call.terminal === "maybeSingle") return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    if (call.op === "insert" || call.op === "upsert" || call.op === "update") {
      const payload = call.args[0];
      const row = Array.isArray(payload) ? payload[0] : payload;
      const withId = row && typeof row === "object" && !("id" in (row as Row))
        ? { id: `gen-${call.table}-${Math.random().toString(36).slice(2, 8)}`, ...(row as Row) }
        : row;
      return { data: call.terminal === "await" ? (Array.isArray(payload) ? payload : [withId]) : withId, error: null };
    }

    return { data: null, error: null };
  };
}
