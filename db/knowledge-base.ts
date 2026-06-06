/**
 * Knowledge-base retrieval (the RAG read side).
 *
 * Runs a vector k-nearest-neighbour search over the seed-owned `kb_chunk_vec`
 * table and joins back the chunk metadata. Metadata filters (source/type/domain)
 * are applied by over-fetching a candidate pool from the kNN match, joining the
 * regular table, then filtering — vec0's kNN cannot filter on a joined table's
 * columns directly. See DATABASE.md.
 *
 * This is the DB layer; app/agent code goes through lib/knowledge-base.ts.
 */
import { embedQuery } from "../lib/embeddings";
import { getClient } from "./drizzle";

export interface KnowledgeChunk {
	source: string;
	type: string;
	heading: string;
	headingTrail: string[];
	domain: string | null;
	taskStatement: string | null;
	text: string;
	/** Vector distance — smaller is closer. */
	distance: number;
}

export interface SearchOptions {
	/** Number of results to return (default 5). */
	limit?: number;
	source?: string;
	type?: string;
	domain?: string;
}

/** Candidate pool pulled from the kNN match before metadata filtering + final limit. */
const CANDIDATE_POOL = 100;

interface RawRow {
	source: string;
	type: string;
	heading: string;
	headingTrail: string;
	domain: string | null;
	taskStatement: string | null;
	text: string;
	distance: number;
}

/** Embeds the query and returns the nearest knowledge-base chunks, filtered by metadata. */
export async function searchKnowledgeBase(
	queryText: string,
	options: SearchOptions = {},
): Promise<KnowledgeChunk[]> {
	const { limit = 5, source, type, domain } = options;
	const embedding = await embedQuery(queryText);

	const filters: string[] = [];
	const params: unknown[] = [];
	if (source) {
		filters.push("kb_chunk.source = ?");
		params.push(source);
	}
	if (type) {
		filters.push("kb_chunk.type = ?");
		params.push(type);
	}
	if (domain) {
		filters.push("kb_chunk.domain = ?");
		params.push(domain);
	}
	const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

	// CANDIDATE_POOL is a trusted constant; vec0 needs a literal LIMIT for the kNN.
	const rows = getClient()
		.prepare(`
			WITH knn AS (
				SELECT rowid, distance
				FROM kb_chunk_vec
				WHERE embedding MATCH ?
				ORDER BY distance
				LIMIT ${CANDIDATE_POOL}
			)
			SELECT
				kb_chunk.source,
				kb_chunk.type,
				kb_chunk.heading,
				kb_chunk.heading_trail AS headingTrail,
				kb_chunk.domain,
				kb_chunk.task_statement AS taskStatement,
				kb_chunk.text,
				knn.distance
			FROM knn
			JOIN kb_chunk ON kb_chunk.id = knn.rowid
			${where}
			ORDER BY knn.distance
			LIMIT ?
		`)
		.all(embedding, ...params, limit) as RawRow[];

	return rows.map((row) => ({
		source: row.source,
		type: row.type,
		heading: row.heading,
		headingTrail: JSON.parse(row.headingTrail) as string[],
		domain: row.domain,
		taskStatement: row.taskStatement,
		text: row.text,
		distance: row.distance,
	}));
}
