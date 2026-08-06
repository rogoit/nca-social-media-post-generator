import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import * as schema from "./schema.js";
import { migrate } from "./migrate.js";

/**
 * Shared SQLite connection (singleton). This is infrastructure — a
 * connection pool — not generation/chat state, so a module-level singleton
 * is correct here (unlike GenerationSession, which stays request-scoped).
 *
 * libsql is used instead of better-sqlite3 so the Alpine Docker image needs
 * no native build toolchain — @libsql/client is pure JavaScript and works
 * against a local `file:` URL.
 */
let _db: LibSQLDatabase<typeof schema> | null = null;
let _client: Client | null = null;

function resolveDbPath(): string {
  const fromEnv =
    (import.meta.env as Record<string, string | undefined>).DATABASE_PATH ??
    process.env.DATABASE_PATH ??
    "";
  const path = fromEnv || "./data/nca.db";
  return path.startsWith("file:") ? path.slice(5) : path;
}

export async function getDb(): Promise<LibSQLDatabase<typeof schema>> {
  if (_db) return _db;

  const filePath = resolveDbPath();
  const absolute = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  mkdirSync(dirname(absolute), { recursive: true });

  _client = createClient({ url: `file:${absolute}` });
  await _client.execute("PRAGMA journal_mode = WAL;");
  await _client.execute("PRAGMA foreign_keys = ON;");
  await migrate(_client);

  _db = drizzle(_client, { schema });
  return _db;
}

/** Exposed for tests and emergency teardown. Closes the underlying client. */
export async function closeDb(): Promise<void> {
  if (_client) {
    _client.close();
    _client = null;
  }
  _db = null;
}

/** Test-only: drop the in-memory singleton so the next getDb() reinitializes. */
export function __resetDbForTests(): void {
  _db = null;
  _client = null;
}
