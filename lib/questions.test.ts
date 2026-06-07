import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	embedPassages: vi.fn(),
	importQuestion: vi.fn(),
	getGeneratedQuestionInputs: vi.fn(),
	getQuestionById: vi.fn(),
	softDeleteQuestion: vi.fn(),
	getClient: vi.fn().mockReturnValue({}),
	readFileSync: vi.fn(),
}));

vi.mock("./embeddings", () => ({
	embedPassages: mocks.embedPassages,
}));

vi.mock("../db/questions", () => ({
	importQuestion: mocks.importQuestion,
	getGeneratedQuestionInputs: mocks.getGeneratedQuestionInputs,
	getQuestionById: mocks.getQuestionById,
	softDeleteQuestion: mocks.softDeleteQuestion,
}));

vi.mock("../db/drizzle", () => ({
	getClient: mocks.getClient,
}));

vi.mock("node:fs", () => {
	const mod = { readFileSync: mocks.readFileSync };
	return { ...mod, default: mod };
});

async function loadSubject() {
	return import("./questions");
}

const baseInput = {
	question: "What is tool use?",
	alternatives: { a: "A", b: "B", c: "C", d: "D" },
	correct_alternative: "b" as const,
	insights: { a: "A wrong", b: "B right", c: "C wrong", d: "D wrong" },
	difficulty: "medium" as const,
	domain: "tool-design-mcp" as const,
	scenario: "customer-support-agent" as const,
};

describe("importSingleQuestion", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.embedPassages.mockReset();
		mocks.importQuestion.mockReset();
		mocks.getClient.mockReset().mockReturnValue({});
	});

	it("embeds the question text in a single-element array", async () => {
		const vector = new Float32Array(384);
		mocks.embedPassages.mockResolvedValue([vector]);
		mocks.importQuestion.mockReturnValue({ rowid: 1, wasInserted: true });
		const { importSingleQuestion } = await loadSubject();
		await importSingleQuestion(baseInput);
		expect(mocks.embedPassages).toHaveBeenCalledWith([baseInput.question]);
	});

	it("calls importQuestion with the db client, input, and embedded vector", async () => {
		const vector = new Float32Array(384);
		const mockDb = { __mock: true };
		mocks.getClient.mockReturnValue(mockDb);
		mocks.embedPassages.mockResolvedValue([vector]);
		mocks.importQuestion.mockReturnValue({ rowid: 5, wasInserted: true });
		const { importSingleQuestion } = await loadSubject();
		await importSingleQuestion(baseInput);
		expect(mocks.importQuestion).toHaveBeenCalledWith(
			mockDb,
			baseInput,
			vector,
		);
	});

	it("returns { id, wasNew } mapped from the ImportResult", async () => {
		const vector = new Float32Array(384);
		mocks.embedPassages.mockResolvedValue([vector]);
		mocks.importQuestion.mockReturnValue({ rowid: 7, wasInserted: true });
		const { importSingleQuestion } = await loadSubject();
		const result = await importSingleQuestion(baseInput);
		expect(result).toEqual({ id: 7, wasNew: true });
	});

	it("returns wasNew: false when the question already existed (not inserted)", async () => {
		const vector = new Float32Array(384);
		mocks.embedPassages.mockResolvedValue([vector]);
		mocks.importQuestion.mockReturnValue({ rowid: 3, wasInserted: false });
		const { importSingleQuestion } = await loadSubject();
		const result = await importSingleQuestion(baseInput);
		expect(result.wasNew).toBe(false);
	});
});

describe("importQuestionsFromFile", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.embedPassages.mockReset();
		mocks.importQuestion.mockReset();
		mocks.getClient.mockReset().mockReturnValue({});
		mocks.readFileSync.mockReset();
	});

	it("returns { imported: 0, skipped: 0 } immediately for an empty JSON array", async () => {
		mocks.readFileSync.mockReturnValue("[]");
		const { importQuestionsFromFile } = await loadSubject();
		const result = await importQuestionsFromFile("/data/questions.json");
		expect(result).toEqual({ imported: 0, skipped: 0 });
		expect(mocks.embedPassages).not.toHaveBeenCalled();
	});

	it("reads the file at the given path as utf8", async () => {
		mocks.readFileSync.mockReturnValue("[]");
		const { importQuestionsFromFile } = await loadSubject();
		await importQuestionsFromFile("/data/questions.json");
		expect(mocks.readFileSync).toHaveBeenCalledWith(
			"/data/questions.json",
			"utf8",
		);
	});

	it("embeds all question texts in a single batch call", async () => {
		const inputs = [baseInput, { ...baseInput, question: "Second question" }];
		mocks.readFileSync.mockReturnValue(JSON.stringify(inputs));
		const vectors = [new Float32Array(384), new Float32Array(384)];
		mocks.embedPassages.mockResolvedValue(vectors);
		mocks.importQuestion.mockReturnValue({ rowid: 1, wasInserted: true });
		const { importQuestionsFromFile } = await loadSubject();
		await importQuestionsFromFile("/data/questions.json");
		expect(mocks.embedPassages).toHaveBeenCalledOnce();
		expect(mocks.embedPassages).toHaveBeenCalledWith([
			baseInput.question,
			"Second question",
		]);
	});

	it("calls importQuestion once per question with its paired vector", async () => {
		const inputs = [baseInput, { ...baseInput, question: "Q2" }];
		mocks.readFileSync.mockReturnValue(JSON.stringify(inputs));
		const v0 = new Float32Array(384).fill(0.1);
		const v1 = new Float32Array(384).fill(0.9);
		mocks.embedPassages.mockResolvedValue([v0, v1]);
		mocks.importQuestion.mockReturnValue({ rowid: 1, wasInserted: true });
		const { importQuestionsFromFile } = await loadSubject();
		await importQuestionsFromFile("/data/questions.json");
		expect(mocks.importQuestion).toHaveBeenCalledTimes(2);
		expect(mocks.importQuestion).toHaveBeenNthCalledWith(
			1,
			expect.anything(),
			inputs[0],
			v0,
		);
		expect(mocks.importQuestion).toHaveBeenNthCalledWith(
			2,
			expect.anything(),
			inputs[1],
			v1,
		);
	});

	it("counts wasInserted true as imported and false as skipped", async () => {
		const inputs = [
			baseInput,
			{ ...baseInput, question: "Q2" },
			{ ...baseInput, question: "Q3" },
		];
		mocks.readFileSync.mockReturnValue(JSON.stringify(inputs));
		mocks.embedPassages.mockResolvedValue(
			inputs.map(() => new Float32Array(384)),
		);
		mocks.importQuestion
			.mockReturnValueOnce({ rowid: 1, wasInserted: true })
			.mockReturnValueOnce({ rowid: 2, wasInserted: false })
			.mockReturnValueOnce({ rowid: 3, wasInserted: true });
		const { importQuestionsFromFile } = await loadSubject();
		const result = await importQuestionsFromFile("/data/questions.json");
		expect(result).toEqual({ imported: 2, skipped: 1 });
	});
});

const fakeQuestion = {
	id: 42,
	question: "Which approach best routes the agent's tool calls?",
	difficulty: "medium" as const,
	domain: "tool-design-mcp" as const,
	scenario: "customer-support-agent" as const,
	alternatives: JSON.stringify({ a: "Option A", b: "Option B" }),
	correctAlternative: "b",
	insights: JSON.stringify({ a: "Wrong A", b: "Right B" }),
	contentHash: "abc123",
	source: "authored" as const,
	deleted: false,
	createdAt: new Date(),
};

describe("getFullQuestion", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.getQuestionById.mockReset();
	});

	it("delegates to getQuestionById with the given id", async () => {
		mocks.getQuestionById.mockReturnValue(fakeQuestion);
		const { getFullQuestion } = await loadSubject();
		getFullQuestion(42);
		expect(mocks.getQuestionById).toHaveBeenCalledWith(42);
	});

	it("returns the full Question row from the database", async () => {
		mocks.getQuestionById.mockReturnValue(fakeQuestion);
		const { getFullQuestion } = await loadSubject();
		expect(getFullQuestion(42)).toBe(fakeQuestion);
	});

	it("returns undefined when the question does not exist", async () => {
		mocks.getQuestionById.mockReturnValue(undefined);
		const { getFullQuestion } = await loadSubject();
		expect(getFullQuestion(99)).toBeUndefined();
	});
});

describe("deleteQuestion", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.softDeleteQuestion.mockReset();
	});

	it("delegates to softDeleteQuestion with the given id", async () => {
		const { deleteQuestion } = await loadSubject();
		deleteQuestion(42);
		expect(mocks.softDeleteQuestion).toHaveBeenCalledWith(42);
	});

	it("calls softDeleteQuestion exactly once per invocation", async () => {
		const { deleteQuestion } = await loadSubject();
		deleteQuestion(7);
		expect(mocks.softDeleteQuestion).toHaveBeenCalledOnce();
	});
});
