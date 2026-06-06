/**
 * Knowledge-base seed — TEMPLATE.
 *
 * Owns ONLY the knowledge-base tables (the RAG source). Re-runnable: it rebuilds
 * those tables from source and never touches runtime data (generated questions,
 * sessions, progress). See DATABASE.md.
 *
 * Run with: pnpm db:seed
 *
 * The KB tables — including the vec0 table — are owned BY THIS SEED, which drops
 * and recreates them on every run. They are deliberately NOT defined in Drizzle:
 * Drizzle owns only runtime tables, whose data must survive migrations. There is
 * nothing here for a migration to preserve. See DATABASE.md.
 */
import { EMBEDDING_DIM, embedPassages, embedQuery } from "../lib/embeddings";
import { openDb } from "./client";

interface CorpusChunk {
	source: string;
	text: string;
}

// Placeholder content. Real chunks come from committed source markdown
// (exam guide, study material, exemplar questions).
const CORPUS: CorpusChunk[] = [
	{
		source: "exam-guide",
		text: "The Claude Certified Architect exam covers model selection, prompt engineering, tool use, and production safety.",
	},
	{
		source: "exam-guide",
		text: "Candidates must understand context window management and retrieval-augmented generation patterns.",
	},
	{
		source: "study-guide",
		text: "Effective prompts use clear role definitions, explicit constraints, and few-shot examples.",
	},
];

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
			text TEXT NOT NULL
		);
		CREATE VIRTUAL TABLE kb_chunk_vec USING vec0(embedding float[${EMBEDDING_DIM}]);
	`);

	const vectors = await embedPassages(CORPUS.map((chunk) => chunk.text));

	const insertChunk = db.prepare(
		"INSERT INTO kb_chunk (id, source, text) VALUES (?, ?, ?)",
	);
	const insertVec = db.prepare(
		"INSERT INTO kb_chunk_vec (rowid, embedding) VALUES (?, ?)",
	);
	const insertAll = db.transaction(() => {
		CORPUS.forEach((chunk, index) => {
			const rowid = BigInt(index + 1);
			insertChunk.run(rowid, chunk.source, chunk.text);
			insertVec.run(rowid, vectors[index]);
		});
	});
	insertAll();

	console.log(`Seeded ${CORPUS.length} knowledge-base chunks.`);

	// Retrieval sanity check: embed a query and pull the nearest chunks.
	const queryVector = await embedQuery("How should I write a good prompt?");
	const matches = db
		.prepare(`
			WITH knn AS (
				SELECT rowid, distance
				FROM kb_chunk_vec
				WHERE embedding MATCH ?
				ORDER BY distance
				LIMIT 2
			)
			SELECT kb_chunk.source, kb_chunk.text, knn.distance
			FROM knn
			JOIN kb_chunk ON kb_chunk.id = knn.rowid
			ORDER BY knn.distance
		`)
		.all(queryVector);

	console.log("Top matches for sample query:");
	console.dir(matches, { depth: null });

	db.close();
}

seed().catch((error) => {
	console.error(error);
	process.exit(1);
});
