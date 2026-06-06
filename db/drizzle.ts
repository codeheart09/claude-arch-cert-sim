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
