import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import type { Alternative, Difficulty, Domain, Scenario } from "./schema";

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

// ─── Hash ─────────────────────────────────────────────────────────────────────

/** SHA-256 hex of the question text — used as the idempotency key. */
export function hashQuestion(question: string): string {
	return createHash("sha256").update(question, "utf8").digest("hex");
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

export function findByContentHash(
	db: Database.Database,
	hash: string,
): { id: number } | undefined {
	return db
		.prepare("SELECT id FROM questions WHERE content_hash = ?")
		.get(hash) as { id: number } | undefined;
}

// ─── Inserts ──────────────────────────────────────────────────────────────────

/** Inserts a question row and returns the new rowid. Caller must verify the hash is not already present. */
export function insertQuestion(
	db: Database.Database,
	input: QuestionInput,
): number {
	const result = db
		.prepare(
			`INSERT INTO questions
				(question, difficulty, domain, scenario, alternatives, correct_alternative, insights, content_hash)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
): ImportResult {
	const hash = hashQuestion(input.question);
	const existing = findByContentHash(db, hash);
	if (existing) {
		return { rowid: existing.id, wasInserted: false };
	}

	const doImport = db.transaction((): number => {
		const rowid = insertQuestion(db, input);
		insertQuestionVector(db, rowid, vector);
		return rowid;
	});

	return { rowid: doImport(), wasInserted: true };
}
