// A tiny in-memory stand-in for the Supabase client, just rich enough for the components under
// test: chainable table queries, rpc(), realtime channels and storage URLs.
type Row = Record<string, unknown>;
type Result = { data: unknown; error: null };

type RpcHandler = unknown | ((args: Row) => unknown);

export type FakeOptions = {
  user?: { id: string; email: string } | null;
  tables?: Record<string, Row[]>;
  rpc?: Record<string, RpcHandler>;
};

export function createFakeSupabase(options: FakeOptions = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(options.tables ?? {})) {
    tables[name] = rows.map((row) => ({ ...row }));
  }
  const log = {
    inserts: [] as { table: string; row: Row }[],
    deletes: [] as { table: string; filters: [string, unknown][] }[],
    rpc: [] as { name: string; args: Row }[],
  };

  class FakeQuery implements PromiseLike<Result> {
    private filters: [string, unknown][] = [];
    private listFilters: [string, unknown[]][] = [];
    private deleting = false;
    private inserted: Row | undefined;
    private sort: { column: string; ascending: boolean } | undefined;

    constructor(private readonly table: string) {}

    private matching() {
      return (tables[this.table] ?? []).filter(
        (row) =>
          this.filters.every(([column, value]) => row[column] === value) &&
          this.listFilters.every(([column, values]) => values.includes(row[column])),
      );
    }

    select() {
      return this;
    }
    order(column: string, options?: { ascending?: boolean }) {
      this.sort = { column, ascending: options?.ascending ?? true };
      return this;
    }
    limit() {
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push([column, value]);
      return this;
    }
    in(column: string, values: unknown[]) {
      this.listFilters.push([column, values]);
      return this;
    }
    insert(row: Row) {
      const stored = { id: crypto.randomUUID(), ...row };
      (tables[this.table] ??= []).push(stored);
      log.inserts.push({ table: this.table, row });
      this.inserted = stored;
      return this;
    }
    delete() {
      this.deleting = true;
      return this;
    }
    async maybeSingle(): Promise<Result> {
      return { data: this.inserted ?? this.matching()[0] ?? null, error: null };
    }
    async single(): Promise<Result> {
      return this.maybeSingle();
    }
    private run(): Result {
      if (this.deleting) {
        const doomed = new Set(this.matching());
        tables[this.table] = (tables[this.table] ?? []).filter((row) => !doomed.has(row));
        log.deletes.push({ table: this.table, filters: this.filters });
        return { data: null, error: null };
      }
      const rows = this.inserted ? [this.inserted] : this.matching();
      const { sort } = this;
      if (sort) {
        rows.sort((a, b) => {
          const x = String(a[sort.column] ?? "");
          const y = String(b[sort.column] ?? "");
          return (x < y ? -1 : x > y ? 1 : 0) * (sort.ascending ? 1 : -1);
        });
      }
      return { data: rows, error: null };
    }
    then<A = Result, B = never>(
      onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
      onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
    ): PromiseLike<A | B> {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    }
  }

  const channel = {
    on() {
      return channel;
    },
    subscribe() {
      return channel;
    },
  };

  const client = {
    auth: {
      getSession: async () => ({
        data: { session: options.user ? { user: options.user } : null },
        error: null,
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
    },
    from: (table: string) => new FakeQuery(table),
    rpc: async (name: string, args: Row = {}) => {
      log.rpc.push({ name, args });
      const handler = options.rpc?.[name];
      const data = typeof handler === "function" ? (handler as (a: Row) => unknown)(args) : handler;
      return { data: data ?? null, error: null };
    },
    channel: () => channel,
    removeChannel: async () => "ok",
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.test/${bucket}/${path}` },
        }),
      }),
    },
  };

  return { client, tables, log };
}
