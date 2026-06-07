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

// ─── Question enums ───────────────────────────────────────────────────────────
// Values derived from db/corpus/exam-guide.md.

export const DIFFICULTY_ENUM = ["easy", "medium", "hard"] as const;
export const ALTERNATIVE_ENUM = ["a", "b", "c", "d", "e"] as const;
export const DOMAIN_ENUM = [
	"agentic-architecture",
	"tool-design-mcp",
	"claude-code-config",
	"prompt-engineering",
	"context-reliability",
] as const;
export const SCENARIO_ENUM = [
	"customer-support-agent",
	"code-generation",
	"multi-agent-research",
	"developer-productivity",
	"ci-cd-integration",
	"structured-data-extraction",
] as const;

export type Difficulty = (typeof DIFFICULTY_ENUM)[number];
export type Alternative = (typeof ALTERNATIVE_ENUM)[number];
export type Domain = (typeof DOMAIN_ENUM)[number];
export type Scenario = (typeof SCENARIO_ENUM)[number];

/**
 * Exam questions — both pre-authored (source='authored') and AI-generated
 * (source='generated'). `alternatives` and `insights` are JSON-serialised
 * Partial<Record<Alternative, string>>. The companion `questions_vec` vec0 table
 * is created by the seed script (IF NOT EXISTS) since Drizzle can't express
 * virtual tables. See DATABASE.md and db/QUESTIONS.md.
 */
export const questions = sqliteTable("questions", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	question: text("question").notNull(),
	difficulty: text("difficulty", { enum: DIFFICULTY_ENUM }).notNull(),
	domain: text("domain", { enum: DOMAIN_ENUM }),
	scenario: text("scenario", { enum: SCENARIO_ENUM }),
	alternatives: text("alternatives").notNull(),
	correctAlternative: text("correct_alternative").notNull(),
	insights: text("insights").notNull(),
	contentHash: text("content_hash").notNull().unique(),
	source: text("source", { enum: ["authored", "generated"] })
		.notNull()
		.default("authored"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;

/**
 * A submitted answer in the Random Questions practice mode. One row per Submit.
 * `selectedAlternative` is the chosen option's letter; `isCorrect` is a real
 * boolean (stored 0/1). The FK to `questions` enables quick joins for analytics.
 */
export const answers = sqliteTable("answers", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	questionId: integer("question_id")
		.notNull()
		.references(() => questions.id),
	selectedAlternative: text("selected_alternative", {
		enum: ALTERNATIVE_ENUM,
	}).notNull(),
	isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export type Answer = typeof answers.$inferSelect;
export type NewAnswer = typeof answers.$inferInsert;
