import { createRequire } from "node:module";
import Database from "better-sqlite3";

const DEFAULT_DB_PATH = process.env.DATABASE_FILE ?? "db/local.db";
const require = createRequire(import.meta.url);
const sqliteVec = require("sqlite-vec") as typeof import("sqlite-vec");

/**
 * Opens the local SQLite database with the sqlite-vec extension loaded.
 *
 * Both responsibilities (knowledge base + generated content) share this single
 * connection — see DATABASE.md. Callers are responsible for closing the handle.
 */
export function openDb(path: string = DEFAULT_DB_PATH): Database.Database {
	const db = new Database(path);
	db.pragma("journal_mode = WAL");
	sqliteVec.load(db);
	return db;
}
