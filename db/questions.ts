import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { getDb } from "./drizzle";
import {
	type Alternative,
	type Difficulty,
	type Domain,
	type Question,
	questions,
	type Scenario,
} from "./schema";

/**
 * A candidate whose nearest existing neighbour sits below this vector distance is
 * treated as a duplicate. BGE-small vectors via sqlite-vec use L2 distance — this
 * is a conservative starting point; tune as the generated bank grows.
 */
export const DUP_DISTANCE_THRESHOLD = 0.15;

// ─── Input type ───────────────────────────────────────────────────────────────

/** Parsed in-memory shape of a question — matches the JSON file field names. */
export interface QuestionInput {
	question: string;
	difficulty: Difficulty;
	domain?: Domain;
	scenario?: Scenario;
	alternatives: Partial<Record<Alternative, string>>;
	correct_alternative: Alternative;
	insights: Partial<Record<Alternative, string>>;
}

export interface ImportResult {
	rowid: number;
	wasInserted: boolean;
}

/** Provenance of a question row — hand-authored seed vs AI-generated at runtime. */
export type QuestionSource = "authored" | "generated";

// ─── Hash ─────────────────────────────────────────────────────────────────────

/** SHA-256 hex of the question text — used as the idempotency key. */
export function hashQuestion(question: string): string {
	return createHash("sha256").update(question, "utf8").digest("hex");
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

/**
 * Returns up to `limit` random questions for a specific domain + scenario pair.
 * Used by the exam question-selection algorithm to build a balanced 60-question set.
 */
export function getQuestionsByDomainScenario(
	domain: Domain,
	scenario: Scenario,
	limit: number,
): Question[] {
	return getDb()
		.select()
		.from(questions)
		.where(and(eq(questions.domain, domain), eq(questions.scenario, scenario)))
		.orderBy(sql`RANDOM()`)
		.limit(limit)
		.all();
}

/**
 * Returns up to `limit` random questions, optionally excluding a set of IDs.
 * Used to fill the exam pool when domain/scenario pairs fall short of 60.
 */
export function getRandomQuestions(
	limit: number,
	excludeIds: readonly number[] = [],
): Question[] {
	if (excludeIds.length === 0) {
		return getDb()
			.select()
			.from(questions)
			.orderBy(sql`RANDOM()`)
			.limit(limit)
			.all();
	}

	return getDb()
		.select()
		.from(questions)
		.where(notInArray(questions.id, excludeIds))
		.orderBy(sql`RANDOM()`)
		.limit(limit)
		.all();
}

/**
 * A single uniformly-random question, optionally excluding already-served ids.
 * Returns undefined when the bank is empty or every row has been excluded.
 */
export function getRandomQuestion(
	excludeIds: readonly number[] = [],
): Question | undefined {
	if (excludeIds.length === 0) {
		return getDb()
			.select()
			.from(questions)
			.orderBy(sql`RANDOM()`)
			.limit(1)
			.get();
	}

	return getDb()
		.select()
		.from(questions)
		.where(notInArray(questions.id, excludeIds))
		.orderBy(sql`RANDOM()`)
		.limit(1)
		.get();
}

/** Fetch one question by its id, or undefined if no such row exists. */
export function getQuestionById(id: number): Question | undefined {
	return getDb().select().from(questions).where(eq(questions.id, id)).get();
}

export function findByContentHash(
	db: Database.Database,
	hash: string,
): { id: number } | undefined {
	return db
		.prepare("SELECT id FROM questions WHERE content_hash = ?")
		.get(hash) as { id: number } | undefined;
}

interface NearestRow {
	id: number;
	question: string;
	distance: number;
}

/**
 * Vector k-nearest-neighbour search over `questions_vec`, joined back to the
 * questions table for text. Used by the generation agent to detect near-duplicate
 * candidates before importing them. Mirrors the kNN pattern in db/knowledge-base.ts.
 * Returns an empty array if `questions_vec` does not exist yet (fresh DB).
 */
export function findNearestQuestions(
	db: Database.Database,
	vector: Float32Array,
	limit = 5,
): NearestRow[] {
	const tableExists = db
		.prepare(
			"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'questions_vec'",
		)
		.get();
	if (!tableExists) {
		return [];
	}

	return db
		.prepare(`
			WITH knn AS (
				SELECT rowid, distance
				FROM questions_vec
				WHERE embedding MATCH ?
				ORDER BY distance
				LIMIT ?
			)
			SELECT questions.id, questions.question, knn.distance
			FROM knn
			JOIN questions ON questions.id = knn.rowid
			ORDER BY knn.distance
		`)
		.all(vector, limit) as NearestRow[];
}

/**
 * Existing question texts for a given domain/scenario pair. Fed to the generation
 * prompt as an "avoid duplicating these" list to reduce collisions up front.
 */
export function findByDomainScenario(
	db: Database.Database,
	domain: Domain,
	scenario: Scenario,
	limit = 6,
): { question: string }[] {
	return db
		.prepare(
			"SELECT question FROM questions WHERE domain = ? AND scenario = ? ORDER BY created_at DESC LIMIT ?",
		)
		.all(domain, scenario, limit) as { question: string }[];
}

// ─── Inserts ──────────────────────────────────────────────────────────────────

/** Inserts a question row and returns the new rowid. Caller must verify the hash is not already present. */
export function insertQuestion(
	db: Database.Database,
	input: QuestionInput,
	source: QuestionSource = "authored",
): number {
	const result = db
		.prepare(
			`INSERT INTO questions
				(question, difficulty, domain, scenario, alternatives, correct_alternative, insights, content_hash, source)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			input.question,
			input.difficulty,
			input.domain ?? null,
			input.scenario ?? null,
			JSON.stringify(input.alternatives),
			input.correct_alternative,
			JSON.stringify(input.insights),
			hashQuestion(input.question),
			source,
		);
	return Number(result.lastInsertRowid);
}

export function insertQuestionVector(
	db: Database.Database,
	rowid: number,
	vector: Float32Array,
): void {
	db.prepare("INSERT INTO questions_vec (rowid, embedding) VALUES (?, ?)").run(
		BigInt(rowid),
		vector,
	);
}

/**
 * Idempotent import: skips if the question is already present (by content hash),
 * otherwise inserts the row and its vector in a single transaction.
 * This is the canonical write path for both authored and AI-generated questions.
 */
export function importQuestion(
	db: Database.Database,
	input: QuestionInput,
	vector: Float32Array,
	source: QuestionSource = "authored",
): ImportResult {
	const hash = hashQuestion(input.question);
	const existing = findByContentHash(db, hash);
	if (existing) {
		return { rowid: existing.id, wasInserted: false };
	}

	const doImport = db.transaction((): number => {
		const rowid = insertQuestion(db, input, source);
		insertQuestionVector(db, rowid, vector);
		return rowid;
	});

	return { rowid: doImport(), wasInserted: true };
}
