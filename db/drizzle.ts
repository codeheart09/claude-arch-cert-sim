import {
	type BetterSQLite3Database,
	drizzle,
} from "drizzle-orm/better-sqlite3";
import { openDb } from "./client";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

let _db: Db | undefined;

export function getDb(): Db {
	if (!_db) {
		_db = drizzle(openDb(), { schema });
	}
	return _db;
}
