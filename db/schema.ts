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
	deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;

/**
 * One completed (or time-expired) exam simulation session.
 * `completed` is true when all 60 questions were answered before time ran out.
 * `duration` is the actual elapsed ms at submission (not the configured limit).
 * `score` is 0–1000 (correct count × 1000/60, rounded).
 */
export const examSimulations = sqliteTable("exam_simulations", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	completed: integer("completed", { mode: "boolean" }).notNull(),
	duration: integer("duration").notNull(),
	score: integer("score").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export type ExamSimulation = typeof examSimulations.$inferSelect;
export type NewExamSimulation = typeof examSimulations.$inferInsert;

/**
 * A submitted answer — covers both practice mode and exam simulations.
 * `examSimulationId` is null for practice-mode answers; set for exam answers.
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
	duration: integer("duration"),
	examSimulationId: integer("exam_simulation_id").references(
		() => examSimulations.id,
	),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export type Answer = typeof answers.$inferSelect;
export type NewAnswer = typeof answers.$inferInsert;

// ─── AI Tutor conversation tables ─────────────────────────────────────────────

export const AI_CONVERSATION_ROLE_ENUM = ["user", "assistant"] as const;
export type AiConversationRole = (typeof AI_CONVERSATION_ROLE_ENUM)[number];

/** A single tutor chat session. Title is auto-set from the first user message. */
export const aiConversations = sqliteTable("ai_conversations", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	title: text("title").notNull().default("New conversation"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export type AiConversation = typeof aiConversations.$inferSelect;
export type NewAiConversation = typeof aiConversations.$inferInsert;

/**
 * One message in a tutor conversation. Only the final displayed text is stored —
 * tool call details are internal to the agent loop and not persisted.
 */
export const aiConversationMessages = sqliteTable("ai_conversation_messages", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	conversationId: integer("conversation_id")
		.notNull()
		.references(() => aiConversations.id, { onDelete: "cascade" }),
	role: text("role", { enum: AI_CONVERSATION_ROLE_ENUM }).notNull(),
	content: text("content").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

export type AiConversationMessage = typeof aiConversationMessages.$inferSelect;
export type NewAiConversationMessage =
	typeof aiConversationMessages.$inferInsert;
