import {
	type KnowledgeChunk,
	type SearchOptions,
	searchKnowledgeBase,
} from "../db/knowledge-base";

export type { KnowledgeChunk, SearchOptions };

/**
 * Retrieves knowledge-base grounding for agents and app code: the chunks most
 * semantically similar to `query`, optionally filtered by source/type/domain.
 *
 * The app layer calls this rather than the DB layer directly — see CLAUDE.md.
 */
export function retrieveGrounding(
	query: string,
	options?: SearchOptions,
): Promise<KnowledgeChunk[]> {
	return searchKnowledgeBase(query, options);
}
