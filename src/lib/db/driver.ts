/**
 * One SQL interface, two backends.
 *
 * Inside the packaged app, queries go to a real SQLite file via
 * tauri-plugin-sql. Opened in a plain browser (`npm run dev`), they go to an
 * in-memory WASM SQLite instead. That second backend is not a toy: Windows
 * machines with Smart App Control enabled cannot compile Rust at all, so the
 * browser is the only place the app can run there, and it has to run the real
 * queries against a real SQLite to be worth anything.
 *
 * Canonical SQL is written with `$1`-style placeholders, which is what
 * tauri-plugin-sql documents. The browser backend rewrites them, rather than the
 * other way around, because that keeps the untestable path exactly as specified.
 */

export interface ExecuteResult {
  lastInsertId: number;
  rowsAffected: number;
}

export interface SqlDriver {
  select<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<ExecuteResult>;
  /** Whether this is the real, persisted database or the in-memory dev one. */
  readonly persistent: boolean;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** `$1, $2` -> `?, ?`. Safe only because no SQL in this app puts `$` in a literal. */
function toPositional(sql: string): string {
  return sql.replace(/\$\d+/g, "?");
}

async function createTauriDriver(): Promise<SqlDriver> {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  const db = await Database.load("sqlite:timesheet.db");
  return {
    persistent: true,
    select: (sql, params = []) => db.select(sql, params),
    async execute(sql, params = []) {
      const result = await db.execute(sql, params);
      return {
        lastInsertId: result.lastInsertId ?? 0,
        rowsAffected: result.rowsAffected,
      };
    },
  };
}

async function createBrowserDriver(): Promise<SqlDriver> {
  const sqlite3InitModule = (await import("@sqlite.org/sqlite-wasm")).default;
  const sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB(":memory:");

  return {
    persistent: false,
    async select<T>(sql: string, params: unknown[] = []) {
      return db.exec({
        sql: toPositional(sql),
        bind: params as never,
        rowMode: "object",
        returnValue: "resultRows",
      }) as T[];
    },
    async execute(sql: string, params: unknown[] = []) {
      db.exec({ sql: toPositional(sql), bind: params as never });
      return {
        lastInsertId: Number(db.selectValue("SELECT last_insert_rowid()") ?? 0),
        rowsAffected: db.changes(),
      };
    },
  };
}

let driverPromise: Promise<SqlDriver> | null = null;

/** Resolves the backend once, then hands the same one to every caller. */
export function getDriver(): Promise<SqlDriver> {
  driverPromise ??= isTauri() ? createTauriDriver() : createBrowserDriver();
  return driverPromise;
}
