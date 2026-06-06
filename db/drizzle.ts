import type Database from "better-sqlite3";
import {
	type BetterSQLite3Database,
	drizzle,
} from "drizzle-orm/better-sqlite3";
import { openDb } from "./client";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & {
	$client: Database.Database;
};

let _db: Db | undefined;

export function getDb(): Db {
	if (!_db) {
		_db = drizzle(openDb(), { schema });
	}
	return _db;
}

/**
 * The underlying better-sqlite3 handle behind the shared Drizzle connection.
 * Used for raw `sqlite-vec` vector queries that Drizzle can't express. Reuses
 * the same connection (one sqlite-vec load) — see DATABASE.md.
 */
export function getClient(): Database.Database {
	return getDb().$client;
}

/**
 * Closes the singleton connection and clears the cache. Call this in long-lived
 * scripts (e.g. CLI runners) before process.exit() so sqlite-vec's native mutex
 * can tear down cleanly. Safe to call when no connection is open.
 */
export function closeDb(): void {
	if (_db) {
		_db.$client.close();
		_db = undefined;
	}
}
