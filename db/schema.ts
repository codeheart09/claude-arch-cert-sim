/**
 * Drizzle ORM schema — runtime tables only.
 *
 * Drizzle owns the runtime side of db/local.db: data created by app usage that
 * must survive schema changes (users, sessions, generated questions, progress).
 * Knowledge-base (`kb_*`) tables are NOT defined here — they are owned by the
 * seed, which rebuilds them wholesale. See DATABASE.md.
 *
 * After editing this file, run `pnpm db:generate` to create a migration, then
 * `pnpm db:migrate` to apply it.
 */
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** A local user of the simulator. Single-machine, no auth — see DATABASE.md. */
export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
