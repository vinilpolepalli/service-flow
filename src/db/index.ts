import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import * as pgSchema from "./schema.pg";

type Orm = BetterSQLite3Database<typeof schema>;
export type Schema = typeof schema;

/**
 * Data-layer handle. SQLite is the default; Postgres is used when DATABASE_URL is a postgres URL.
 * The Postgres tables/ORM are typed as their SQLite twins: both builders share the awaited API the
 * service layer uses (never .all/.get/.run). Always query through `t` (driver-specific tables).
 */
export interface Db {
  kind: "sqlite" | "postgres";
  orm: Orm;
  t: Schema;
  /** Runs fn atomically. SQLite relies on `exclusive` serialization (one connection). */
  tx<T>(fn: (c: Db) => Promise<T>): Promise<T>;
  /** Serializes work on SQLite (single connection, manual BEGIN/COMMIT); passthrough on Postgres. */
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
}

const DDL = `
CREATE TABLE IF NOT EXISTS tickets (id TEXT NOT NULL, owner TEXT NOT NULL, customer TEXT NOT NULL, category TEXT NOT NULL, appliance TEXT NOT NULL, issue TEXT NOT NULL, symptom TEXT NOT NULL, stage TEXT NOT NULL, promised_by TEXT NOT NULL, diagnosed INTEGER NOT NULL DEFAULT 0, tech TEXT, PRIMARY KEY (owner, id));
CREATE TABLE IF NOT EXISTS parts (id TEXT PRIMARY KEY, owner TEXT NOT NULL, ticket_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, eta TEXT);
CREATE TABLE IF NOT EXISTS visits (owner TEXT NOT NULL, ticket_id TEXT NOT NULL, tech TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, PRIMARY KEY (owner, ticket_id));
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, ticket_id TEXT NOT NULL, at TEXT NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS write_log (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS tickets_owner_idx ON tickets (owner, id);
CREATE INDEX IF NOT EXISTS visits_owner_tech_idx ON visits (owner, tech, start);
CREATE INDEX IF NOT EXISTS events_ticket_idx ON events (owner, ticket_id);
CREATE INDEX IF NOT EXISTS write_log_idx ON write_log (owner, at);
`;

const PG_DDL = [
  `CREATE TABLE IF NOT EXISTS tickets (id TEXT NOT NULL, owner TEXT NOT NULL, customer TEXT NOT NULL, category TEXT NOT NULL, appliance TEXT NOT NULL, issue TEXT NOT NULL, symptom TEXT NOT NULL, stage TEXT NOT NULL, promised_by TEXT NOT NULL, diagnosed BOOLEAN NOT NULL DEFAULT FALSE, tech TEXT, PRIMARY KEY (owner, id))`,
  `CREATE TABLE IF NOT EXISTS parts (id TEXT PRIMARY KEY, owner TEXT NOT NULL, ticket_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, eta TEXT)`,
  `CREATE TABLE IF NOT EXISTS visits (owner TEXT NOT NULL, ticket_id TEXT NOT NULL, tech TEXT NOT NULL, start TEXT NOT NULL, "end" TEXT NOT NULL, PRIMARY KEY (owner, ticket_id))`,
  `CREATE TABLE IF NOT EXISTS events (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, owner TEXT NOT NULL, ticket_id TEXT NOT NULL, at TEXT NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS write_log (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, owner TEXT NOT NULL, at BIGINT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS tickets_owner_idx ON tickets (owner, id)`,
  `CREATE INDEX IF NOT EXISTS visits_owner_tech_idx ON visits (owner, tech, start)`,
  `CREATE INDEX IF NOT EXISTS events_ticket_idx ON events (owner, ticket_id)`,
  `CREATE INDEX IF NOT EXISTS write_log_idx ON write_log (owner, at)`,
];

const PG_URL = /^postgres(ql)?:\/\//i;

/** SQLite connection (sync open). Default driver; also used by tests with ":memory:". */
export function createDb(file: string): Db {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(DDL);
  const orm = drizzle(sqlite, { schema });
  let chain: Promise<unknown> = Promise.resolve();
  let inTx = false;
  const c: Db = {
    kind: "sqlite", orm, t: schema,
    async tx(fn) {
      if (inTx) return fn(c); // nested: join the outer transaction
      inTx = true;
      orm.run(sql`BEGIN`);
      try {
        const r = await fn(c);
        orm.run(sql`COMMIT`);
        return r;
      } catch (e) {
        orm.run(sql`ROLLBACK`);
        throw e;
      } finally { inTx = false; }
    },
    exclusive(fn) {
      const run = chain.then(fn, fn);
      chain = run.catch(() => undefined);
      return run;
    },
  };
  return c;
}

async function createPgDb(url: string): Promise<Db> {
  const [{ default: postgres }, { drizzle: pgDrizzle }] = await Promise.all([import("postgres"), import("drizzle-orm/postgres-js")]);
  const client = postgres(url, { max: 5, onnotice: () => {} });
  try {
    for (const stmt of PG_DDL) await client.unsafe(stmt);
  } catch (e) { await client.end({ timeout: 1 }).catch(() => {}); throw e; }
  const mk = (orm: Orm): Db => ({
    kind: "postgres", orm, t: pgSchema as unknown as Schema,
    tx: (fn) => (orm as unknown as { transaction: (f: (tx: Orm) => Promise<never>) => Promise<never> })
      .transaction((tx) => fn(mk(tx)) as Promise<never>),
    exclusive: (fn) => fn(),
  });
  return mk(pgDrizzle(client, { schema: pgSchema }) as unknown as Orm);
}

const g = globalThis as unknown as { __sfDb?: Promise<Db> };
export function getDb(): Promise<Db> {
  if (!g.__sfDb) {
    const url = process.env.DATABASE_URL;
    g.__sfDb = (url && PG_URL.test(url) ? createPgDb(url) : Promise.resolve(createDb(process.env.SF_DB_PATH || "serviceflow.db")))
      .catch((e) => { g.__sfDb = undefined; throw e; });
  }
  return g.__sfDb;
}
export { schema };
