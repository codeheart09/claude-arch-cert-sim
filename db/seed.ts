/**
 * Seed script — knowledge base + pre-authored questions.
 *
 * Two responsibilities:
 *   1. Rebuild KB tables (kb_chunk, kb_chunk_vec) wholesale from corpus markdown.
 *   2. Import authored questions from db/questions.json into the runtime questions
 *      table (idempotent — skips already-present rows by content hash).
 *
 * Run with: pnpm db:seed
 *
 * KB tables are dropped and recreated on every run (owned by this seed).
 * The questions table is owned by Drizzle migrations; questions_vec is created
 * here with IF NOT EXISTS so it persists across re-runs. See DATABASE.md and
 * db/QUESTIONS.md.
 */
import { readFileSync } from "node:fs";
import { type CorpusChunk, loadCorpus } from "../lib/corpus";
import { EMBEDDING_DIM, embedPassages, embedQuery } from "../lib/embeddings";
import { openDb } from "./client";
import { importQuestion, type QuestionInput } from "./questions";

const CORPUS_DIR = "db/corpus";

/**
 * What we embed for a chunk: its heading trail plus its text. Folding the
 * structural context into the vector helps retrieval match on section/topic, not
 * just the prose. The stored `text` column stays the pure chunk for display.
 */
function embedInput(chunk: CorpusChunk): string {
	return `${chunk.headingTrail.join(" › ")}\n\n${chunk.text}`;
}

async function seed(): Promise<void> {
	const db = openDb();

	// Rebuild knowledge-base tables only. EMBEDDING_DIM is a trusted constant,
	// not user input — vec0 requires a literal dimension in its DDL.
	db.exec(`
		DROP TABLE IF EXISTS kb_chunk;
		DROP TABLE IF EXISTS kb_chunk_vec;
		CREATE TABLE kb_chunk (
			id INTEGER PRIMARY KEY,
			source TEXT NOT NULL,
			type TEXT NOT NULL,
			heading_trail TEXT NOT NULL,
			heading TEXT NOT NULL,
			chunk_index INTEGER NOT NULL,
			domain TEXT,
			task_statement TEXT,
			text TEXT NOT NULL
		);
		CREATE VIRTUAL TABLE kb_chunk_vec USING vec0(embedding float[${EMBEDDING_DIM}]);
	`);

	const chunks = loadCorpus(CORPUS_DIR);
	if (chunks.length === 0) {
		throw new Error(`No markdown documents found in ${CORPUS_DIR}/`);
	}

	const vectors = await embedPassages(chunks.map(embedInput));

	const insertChunk = db.prepare(`
		INSERT INTO kb_chunk
			(id, source, type, heading_trail, heading, chunk_index, domain, task_statement, text)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	const insertVec = db.prepare(
		"INSERT INTO kb_chunk_vec (rowid, embedding) VALUES (?, ?)",
	);
	const insertAll = db.transaction(() => {
		chunks.forEach((chunk, index) => {
			const rowid = BigInt(index + 1);
			insertChunk.run(
				rowid,
				chunk.source,
				chunk.type,
				JSON.stringify(chunk.headingTrail),
				chunk.heading,
				chunk.chunkIndex,
				chunk.domain,
				chunk.taskStatement,
				chunk.text,
			);
			insertVec.run(rowid, vectors[index]);
		});
	});
	insertAll();

	const counts = new Map<string, number>();
	for (const chunk of chunks) {
		counts.set(chunk.source, (counts.get(chunk.source) ?? 0) + 1);
	}
	console.log(`Seeded ${chunks.length} knowledge-base chunks:`);
	for (const [source, count] of counts) {
		console.log(`  ${source}: ${count} chunks`);
	}

	// Retrieval sanity check: embed a query and pull the nearest chunks.
	const queryVector = await embedQuery(
		"When should an agent escalate to a human instead of resolving autonomously?",
	);
	const matches = db
		.prepare(`
			WITH knn AS (
				SELECT rowid, distance
				FROM kb_chunk_vec
				WHERE embedding MATCH ?
				ORDER BY distance
				LIMIT 3
			)
			SELECT kb_chunk.heading, kb_chunk.domain, knn.distance
			FROM knn
			JOIN kb_chunk ON kb_chunk.id = knn.rowid
			ORDER BY knn.distance
		`)
		.all(queryVector);

	console.log("\nTop matches for sample query:");
	console.dir(matches, { depth: null });

	// ── Pre-authored questions ─────────────────────────────────────────────────

	// Create the vec0 companion table if it doesn't exist yet. Drizzle can't
	// express virtual tables, so this lives here rather than in a migration.
	// IF NOT EXISTS makes it a no-op on subsequent runs — vectors are never lost.
	db.exec(
		`CREATE VIRTUAL TABLE IF NOT EXISTS questions_vec USING vec0(embedding float[${EMBEDDING_DIM}])`,
	);

	const QUESTIONS_FILE = "db/questions.json";
	const rawQuestions = readFileSync(QUESTIONS_FILE, "utf8");
	const questionInputs = JSON.parse(rawQuestions) as QuestionInput[];

	if (questionInputs.length > 0) {
		const questionVectors = await embedPassages(
			questionInputs.map((q) => q.question),
		);
		let imported = 0;
		let skipped = 0;
		for (let i = 0; i < questionInputs.length; i++) {
			const result = importQuestion(db, questionInputs[i], questionVectors[i]);
			if (result.wasInserted) {
				imported++;
			} else {
				skipped++;
			}
		}
		console.log(
			`\nImported ${imported} authored questions, skipped ${skipped} already-present.`,
		);
	} else {
		console.log("\nNo authored questions in db/questions.json — skipping.");
	}

	db.close();
}

seed().catch((error) => {
	console.error(error);
	process.exit(1);
});
