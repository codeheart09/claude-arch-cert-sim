import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const model = {
		embed: vi.fn(),
		queryEmbed: vi.fn(),
	};
	const init = vi.fn();

	return { init, model };
});

vi.mock("fastembed", () => ({
	EmbeddingModel: { BGESmallENV15: "BGESmallENV15" },
	FlagEmbedding: { init: mocks.init },
}));

async function loadSubject() {
	return import("./embeddings");
}

describe("embeddings", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.init.mockReset();
		mocks.model.embed.mockReset();
		mocks.model.queryEmbed.mockReset();
		mocks.init.mockResolvedValue(mocks.model);
	});

	it("exports the vector dimensionality expected by sqlite-vec tables", async () => {
		const { EMBEDDING_DIM } = await loadSubject();
		expect(EMBEDDING_DIM).toBe(384);
	});

	it("initializes the local BGE model with the project cache directory", async () => {
		const { embedQuery } = await loadSubject();
		mocks.model.queryEmbed.mockResolvedValue([0.1, 0.2, 0.3]);

		await embedQuery("tool selection");

		expect(mocks.init).toHaveBeenCalledTimes(1);
		expect(mocks.init).toHaveBeenCalledWith({
			model: "BGESmallENV15",
			cacheDir: "db/.model-cache",
		});
	});

	it("embeds passages in batches and returns Float32Array vectors", async () => {
		const { embedPassages } = await loadSubject();
		mocks.model.embed.mockImplementation(async function* (
			texts: string[],
			batchSize: number,
		) {
			expect(texts).toEqual(["first chunk", "second chunk", "third chunk"]);
			expect(batchSize).toBe(32);
			yield [
				[1, 2, 3],
				[4, 5, 6],
			];
			yield [[7, 8, 9]];
		});

		const vectors = await embedPassages([
			"first chunk",
			"second chunk",
			"third chunk",
		]);

		expect(vectors).toHaveLength(3);
		expect(vectors.every((vector) => vector instanceof Float32Array)).toBe(
			true,
		);
		expect(vectors.map((vector) => Array.from(vector))).toEqual([
			[1, 2, 3],
			[4, 5, 6],
			[7, 8, 9],
		]);
	});

	it("uses query embedding for lookup text and returns a Float32Array", async () => {
		const { embedQuery } = await loadSubject();
		mocks.model.queryEmbed.mockResolvedValue([0.25, 0.5, 0.75]);

		const vector = await embedQuery("when should the agent escalate?");

		expect(mocks.model.queryEmbed).toHaveBeenCalledWith(
			"when should the agent escalate?",
		);
		expect(vector).toBeInstanceOf(Float32Array);
		expect(Array.from(vector)).toEqual([0.25, 0.5, 0.75]);
	});

	it("reuses the initialized model across passage and query embeddings", async () => {
		const { embedPassages, embedQuery } = await loadSubject();
		mocks.model.embed.mockImplementation(async function* () {
			yield [[1, 1, 1]];
		});
		mocks.model.queryEmbed.mockResolvedValue([2, 2, 2]);

		await embedPassages(["chunk"]);
		await embedQuery("query");

		expect(mocks.init).toHaveBeenCalledTimes(1);
	});
});
