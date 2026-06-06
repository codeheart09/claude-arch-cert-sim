import { EmbeddingModel, FlagEmbedding } from "fastembed";

/** Dimensionality of BGE-small-en-v1.5 output vectors. vec0 tables must match. */
export const EMBEDDING_DIM = 384;

/** Where the local model weights are cached (git-ignored). No network at query time after first download. */
const CACHE_DIR = "db/.model-cache";

let modelPromise: Promise<FlagEmbedding> | null = null;

function getModel(): Promise<FlagEmbedding> {
	if (!modelPromise) {
		modelPromise = FlagEmbedding.init({
			model: EmbeddingModel.BGESmallENV15,
			cacheDir: CACHE_DIR,
		});
	}
	return modelPromise;
}

/**
 * Embeds documents/passages for storage in the knowledge base.
 * Use this for corpus chunks and exemplar questions.
 */
export async function embedPassages(texts: string[]): Promise<Float32Array[]> {
	const model = await getModel();
	const vectors: Float32Array[] = [];
	for await (const batch of model.embed(texts, 32)) {
		for (const vector of batch) {
			vectors.push(Float32Array.from(vector));
		}
	}
	return vectors;
}

/**
 * Embeds a search query. BGE models prepend a retrieval instruction to queries,
 * so this is NOT interchangeable with embedPassages — use it for the lookup side.
 */
export async function embedQuery(text: string): Promise<Float32Array> {
	const model = await getModel();
	const vector = await model.queryEmbed(text);
	return Float32Array.from(vector);
}
