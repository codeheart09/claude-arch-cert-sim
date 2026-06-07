import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getRandomQuestion: vi.fn(),
	getQuestionById: vi.fn(),
	insertAnswer: vi.fn(),
}));

vi.mock("../db/questions", () => ({
	getRandomQuestion: mocks.getRandomQuestion,
	getQuestionById: mocks.getQuestionById,
}));

vi.mock("../db/answers", () => ({
	insertAnswer: mocks.insertAnswer,
}));

const row = {
	id: 7,
	question: "Which approach best routes the agent's tool calls?",
	difficulty: "medium" as const,
	domain: "tool-design-mcp" as const,
	scenario: "customer-support-agent" as const,
	alternatives: JSON.stringify({
		a: "Option A",
		b: "Option B",
		c: "Option C",
		d: "Option D",
	}),
	correctAlternative: "b",
	insights: JSON.stringify({
		a: "Wrong because A.",
		b: "Correct because B.",
		c: "Wrong because C.",
		d: "Wrong because D.",
	}),
	contentHash: "hash",
	source: "authored" as const,
	createdAt: new Date("2026-06-06T12:00:00.000Z"),
};

async function loadSubject() {
	return import("./practice");
}

describe("getRandomPracticeQuestion", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.getRandomQuestion.mockReset();
		mocks.getQuestionById.mockReset();
		mocks.insertAnswer.mockReset();
	});

	it("returns shuffled choices preserving the full set of alternatives", async () => {
		mocks.getRandomQuestion.mockReturnValue(row);
		const { getRandomPracticeQuestion } = await loadSubject();

		const result = getRandomPracticeQuestion();

		expect(result).not.toBeNull();
		const letters = result?.choices.map((c) => c.letter).sort();
		expect(letters).toEqual(["a", "b", "c", "d"]);
		const byLetter = Object.fromEntries(
			result?.choices.map((c) => [c.letter, c.text]) ?? [],
		);
		expect(byLetter.b).toBe("Option B");
	});

	it("passes excluded question ids through to the random question query", async () => {
		mocks.getRandomQuestion.mockReturnValue(row);
		const { getRandomPracticeQuestion } = await loadSubject();

		getRandomPracticeQuestion([1, 2, 3]);

		expect(mocks.getRandomQuestion).toHaveBeenCalledWith([1, 2, 3]);
	});

	it("never leaks the correct answer or insights to the client", async () => {
		mocks.getRandomQuestion.mockReturnValue(row);
		const { getRandomPracticeQuestion } = await loadSubject();

		const result = getRandomPracticeQuestion();

		expect(Object.keys(result ?? {}).sort()).toEqual([
			"choices",
			"id",
			"question",
		]);
		expect(JSON.stringify(result)).not.toContain("Correct because B.");
	});

	it("returns null when the question bank is empty", async () => {
		mocks.getRandomQuestion.mockReturnValue(undefined);
		const { getRandomPracticeQuestion } = await loadSubject();

		expect(getRandomPracticeQuestion()).toBeNull();
	});
});

describe("gradeAndRecordAnswer", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.getRandomQuestion.mockReset();
		mocks.getQuestionById.mockReset();
		mocks.insertAnswer.mockReset();
	});

	it("grades a correct answer and records it", async () => {
		mocks.getQuestionById.mockReturnValue(row);
		const { gradeAndRecordAnswer } = await loadSubject();

		const result = gradeAndRecordAnswer(7, "b");

		expect(result).toEqual({ isCorrect: true, insight: "Correct because B." });
		expect(mocks.insertAnswer).toHaveBeenCalledWith({
			questionId: 7,
			selectedAlternative: "b",
			isCorrect: true,
		});
	});

	it("grades an incorrect answer and returns its insight", async () => {
		mocks.getQuestionById.mockReturnValue(row);
		const { gradeAndRecordAnswer } = await loadSubject();

		const result = gradeAndRecordAnswer(7, "a");

		expect(result).toEqual({ isCorrect: false, insight: "Wrong because A." });
		expect(mocks.insertAnswer).toHaveBeenCalledWith({
			questionId: 7,
			selectedAlternative: "a",
			isCorrect: false,
		});
	});

	it("throws when the question no longer exists", async () => {
		mocks.getQuestionById.mockReturnValue(undefined);
		const { gradeAndRecordAnswer } = await loadSubject();

		expect(() => gradeAndRecordAnswer(99, "a")).toThrow(/not found/);
	});
});
