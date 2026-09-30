import { AsyncLocalStorage } from "node:async_hooks";
import postgres from "postgres";
import { getSqliteDatabaseSync } from "./sqlite-db";

export interface RunResult {
  changes: number;
}

export interface PreparedStatement {
  all<T = Record<string, unknown>>(...params: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(...params: unknown[]): Promise<T | undefined>;
  run(...params: unknown[]): Promise<RunResult>;
}

export interface AppDatabase {
  readonly dialect: "sqlite" | "postgres";
  prepare(query: string): PreparedStatement;
  exec(query: string): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

let instance: AppDatabase | null = null;

function configuredPostgresUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || null;
}

/**
 * Returns one async database interface for both environments:
 *
 * - local development and isolated tests keep using the existing SQLite file;
 * - Vercel uses the pooled Supabase Postgres connection supplied in DATABASE_URL.
 *
 * Keeping the local adapter is intentional: content preparation remains an offline workflow,
 * while the deployed application no longer relies on a writable local filesystem.
 */
export function getDatabase(): AppDatabase {
  if (instance) return instance;
  const postgresUrl = configuredPostgresUrl();
  instance = postgresUrl ? createPostgresDatabase(postgresUrl) : createSqliteDatabase();
  return instance;
}

function createSqliteDatabase(): AppDatabase {
  const sqlite = getSqliteDatabaseSync();

  return {
    dialect: "sqlite",
    prepare(query) {
      const statement = sqlite.prepare(query);
      return {
        async all<T>(...params: unknown[]) {
          return statement.all(...(params as never[])) as unknown as T[];
        },
        async get<T>(...params: unknown[]) {
          return statement.get(...(params as never[])) as unknown as T | undefined;
        },
        async run(...params: unknown[]) {
          const result = statement.run(...(params as never[]));
          return { changes: Number(result.changes) };
        },
      };
    },
    async exec(query) {
      sqlite.exec(query);
    },
    async transaction<T>(fn: () => Promise<T>) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const value = await fn();
        sqlite.exec("COMMIT");
        return value;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

type QueryExecutor = (query: string, params: unknown[]) => Promise<{
  rows: Record<string, unknown>[];
  count: number;
}>;

function createPostgresDatabase(url: string): AppDatabase {
  const client = postgres(url, {
    max: 1,
    prepare: false,
    ssl: "require",
    idle_timeout: 20,
    connect_timeout: 15,
  });
  const transactionExecutor = new AsyncLocalStorage<QueryExecutor>();

  const baseExecutor: QueryExecutor = async (query, params) => {
    const result = await client.unsafe(query, params as never[]);
    return {
      rows: Array.from(result) as Record<string, unknown>[],
      count: Number(result.count ?? 0),
    };
  };

  const execute: QueryExecutor = (query, params) =>
    (transactionExecutor.getStore() ?? baseExecutor)(toPostgresPlaceholders(query), params);

  return {
    dialect: "postgres",
    prepare(query) {
      return {
        async all<T>(...params: unknown[]) {
          const result = await execute(query, params);
          return result.rows as T[];
        },
        async get<T>(...params: unknown[]) {
          const result = await execute(query, params);
          return result.rows[0] as T | undefined;
        },
        async run(...params: unknown[]) {
          const result = await execute(query, params);
          return { changes: result.count };
        },
      };
    },
    async exec(query) {
      await execute(query, []);
    },
    async transaction<T>(fn: () => Promise<T>) {
      return client.begin(async (transaction) => {
        const txExecutor: QueryExecutor = async (query, params) => {
          const result = await transaction.unsafe(query, params as never[]);
          return {
            rows: Array.from(result) as Record<string, unknown>[],
            count: Number(result.count ?? 0),
          };
        };
        return transactionExecutor.run(txExecutor, fn);
      }) as Promise<T>;
    },
  };
}

/** Convert SQLite-style positional markers to postgres.js positional markers, skipping literals. */
function toPostgresPlaceholders(query: string): string {
  let result = "";
  let index = 0;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < query.length; i += 1) {
    const char = query[i];
    if (quote) {
      result += char;
      if (char === quote) {
        if (query[i + 1] === quote) {
          result += query[i + 1];
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      result += char;
    } else if (char === "?") {
      index += 1;
      result += `$${index}`;
    } else {
      result += char;
    }
  }

  return result;
}
