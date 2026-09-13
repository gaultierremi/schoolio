/**
 * Faux client Supabase pour tester les route handlers App Router sans base.
 *
 * Pourquoi un builder maison plutôt que vi.fn().mockReturnThis() partout :
 * les routes enchaînent .from().select().eq().eq().single() ET parfois
 * `await admin.from(t).select("id", { count: "exact", head: true }).eq(...)`
 * — c'est-à-dire un builder awaité DIRECTEMENT, sans terminal. Le faux
 * builder doit donc être thenable. Il enregistre chaque appel (table,
 * opération, filtres, terminal) pour que les tests puissent affirmer non
 * seulement le résultat, mais aussi ce qui n'a PAS été fait (« aucun delete »,
 * « les compteurs n'ont pas été évalués avant l'ownership »).
 *
 * Usage :
 *   const db = createFakeSupabase((call) => {
 *     if (call.table === "classes" && call.terminal === "single") return { data: { id: "c1" } };
 *     if (call.isCount) return { count: 0 };
 *     return {};
 *   });
 *   // db.client -> à injecter via vi.mock ; db.calls -> journal des appels.
 */

export type Op = "select" | "insert" | "update" | "delete" | "upsert" | "rpc";
export type Terminal = "single" | "maybeSingle" | "await";

export type RecordedCall = {
  table: string;
  op: Op;
  /** Colonnes du select, ou payload de insert/update/upsert. */
  args: unknown[];
  /** Options du select (count/head) si présentes. */
  selectOptions?: { count?: string; head?: boolean };
  /** Filtres dans l'ordre d'appel : ["eq", "id", "c1"], ["in", "id", [...]], ... */
  filters: Array<[string, ...unknown[]]>;
  terminal: Terminal;
  /** Raccourci : select avec { count: "exact", head: true }. */
  isCount: boolean;
};

export type FakeResponse = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

export type Handler = (call: RecordedCall) => FakeResponse | Promise<FakeResponse>;

const CHAIN_FILTERS = [
  "eq", "neq", "in", "is", "not", "gt", "gte", "lt", "lte", "like", "ilike",
  "order", "limit", "range", "match", "contains",
] as const;

function normalize(res: FakeResponse | undefined): Required<FakeResponse> {
  return {
    data: res && "data" in res ? res.data : null,
    error: res && "error" in res ? res.error : null,
    count: res && "count" in res ? (res.count as number | null) : null,
  };
}

export function createFakeSupabase(handler: Handler) {
  const calls: RecordedCall[] = [];

  function makeBuilder(table: string) {
    const call: RecordedCall = {
      table,
      op: "select",
      args: [],
      filters: [],
      terminal: "await",
      isCount: false,
    };

    const resolve = async (terminal: Terminal) => {
      call.terminal = terminal;
      calls.push(call);
      return normalize(await handler(call));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select(cols?: unknown, opts?: { count?: string; head?: boolean }) {
        // select() après insert/update/upsert = projection du retour, pas une lecture.
        if (call.op === "select") {
          call.args = [cols];
          call.selectOptions = opts;
          call.isCount = !!opts && opts.count === "exact" && opts.head === true;
        }
        return builder;
      },
      insert(payload: unknown) { call.op = "insert"; call.args = [payload]; return builder; },
      update(payload: unknown) { call.op = "update"; call.args = [payload]; return builder; },
      upsert(payload: unknown, opts?: unknown) { call.op = "upsert"; call.args = [payload, opts]; return builder; },
      delete() { call.op = "delete"; return builder; },
      single() { return resolve("single"); },
      maybeSingle() { return resolve("maybeSingle"); },
      // Thenable : `await admin.from(...).select(...).eq(...)` sans terminal.
      then(onFulfilled: (v: Required<FakeResponse>) => unknown, onRejected?: (e: unknown) => unknown) {
        return resolve("await").then(onFulfilled, onRejected);
      },
    };
    for (const f of CHAIN_FILTERS) {
      builder[f] = (...a: unknown[]) => { call.filters.push([f, ...a]); return builder; };
    }
    return builder;
  }

  const client = {
    from: (table: string) => makeBuilder(table),
    rpc: async (fn: string, params?: unknown) => {
      const call: RecordedCall = {
        table: `rpc:${fn}`, op: "rpc", args: [params], filters: [], terminal: "await", isCount: false,
      };
      calls.push(call);
      return normalize(await handler(call));
    },
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      admin: {
        updateUserById: async (id: string, attrs: unknown) => {
          const call: RecordedCall = {
            table: "auth.users", op: "update", args: [id, attrs], filters: [], terminal: "await", isCount: false,
          };
          calls.push(call);
          return normalize(await handler(call));
        },
      },
    },
  };

  return {
    client,
    calls,
    /** Appels d'écriture (insert/update/upsert/delete), toutes tables. */
    writes: () => calls.filter((c) => c.op !== "select" && c.op !== "rpc"),
    /** Appels de comptage (select count exact head). */
    counts: () => calls.filter((c) => c.isCount),
    /** Appels sur une table donnée. */
    on: (table: string) => calls.filter((c) => c.table === table),
    reset: () => { calls.length = 0; },
  };
}

/** Client « authentifié » minimal : ce que @/lib/supabase-server renvoie. */
export function createFakeAuthClient(opts: {
  user: { id: string; email?: string; app_metadata?: Record<string, unknown> } | null;
  authError?: unknown;
  rpc?: Record<string, unknown>;
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user }, error: opts.authError ?? null }),
    },
    rpc: async (fn: string) => ({ data: opts.rpc?.[fn] ?? null, error: null }),
  };
}
