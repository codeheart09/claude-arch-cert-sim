/**
 * Knowledge-base seed.
 *
 * Owns ONLY the knowledge-base tables (the RAG source). Re-runnable: it rebuilds
 * those tables from the committed corpus markdown and never touches runtime data
 * (generated questions, sessions, progress). See DATABASE.md.
 *
 * Run with: pnpm db:seed
 *
 * The KB tables — including the vec0 table — are owned BY THIS SEED, which drops
 * and recreates them on every run. They are deliberately NOT defined in Drizzle:
 * Drizzle owns only runtime tables, whose data must survive migrations. There is
 * nothing here for a migration to preserve. See DATABASE.md.
 *
 * Adding a document is a content change, not a code change: drop a new `.md` into
 * db/corpus/ and re-run this seed. The whole folder is ingested below.
 */
import { type CorpusChunk, loadCorpus } from "../lib/corpus";
import { EMBEDDING_DIM, embedPassages, embedQuery } from "../lib/embeddings";
import { openDb } from "./client";

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

	db.close();
}

seed().catch((error) => {
	console.error(error);
	process.exit(1);
});
