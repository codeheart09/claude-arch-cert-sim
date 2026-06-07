import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getQuestionsByDomainScenario: vi.fn(),
	getRandomQuestions: vi.fn(),
	getQuestionById: vi.fn(),
	insertAnswer: vi.fn(),
	getAnswersByExamSimulationId: vi.fn(),
	insertExamSimulation: vi.fn(),
	updateExamSimulation: vi.fn(),
}));

vi.mock("../db/questions", () => ({
	getQuestionsByDomainScenario: mocks.getQuestionsByDomainScenario,
	getRandomQuestions: mocks.getRandomQuestions,
	getQuestionById: mocks.getQuestionById,
}));

vi.mock("../db/answers", () => ({
	insertAnswer: mocks.insertAnswer,
	getAnswersByExamSimulationId: mocks.getAnswersByExamSimulationId,
}));

vi.mock("../db/exam-simulations", () => ({
	insertExamSimulation: mocks.insertExamSimulation,
	updateExamSimulation: mocks.updateExamSimulation,
}));

async function loadSubject() {
	return import("./exam");
}

let idCounter = 0;

function makeRow(
	id?: number,
	overrides: Partial<{ domain: string | null; scenario: string | null }> = {},
) {
	const rowId = id ?? ++idCounter;
	return {
		id: rowId,
		question: `Question ${rowId}`,
		alternatives: JSON.stringify({
			a: "Opt A",
			b: "Opt B",
			c: "Opt C",
			d: "Opt D",
		}),
		difficulty: "medium" as const,
		domain: "agentic-architecture" as const,
		scenario: "customer-support-agent" as const,
		correctAlternative: "b",
		insights: JSON.stringify({
			a: "A wrong",
			b: "B right",
			c: "C wrong",
			d: "D wrong",
		}),
		contentHash: `hash-${rowId}`,
		source: "authored" as const,
		createdAt: new Date(),
		...overrides,
	};
}

function makeAnswer(
	overrides: Partial<{
		id: number;
		questionId: number;
		selectedAlternative: string;
		isCorrect: boolean;
		duration: number | null;
		examSimulationId: number;
	}> = {},
) {
	return {
		id: 1,
		questionId: 1,
		selectedAlternative: "b",
		isCorrect: true,
		duration: 5000,
		examSimulationId: 42,
		createdAt: new Date(),
		...overrides,
	};
}

describe("getExamQuestions", () => {
	beforeEach(() => {
		vi.resetModules();
		idCounter = 0;
		for (const mock of Object.values(mocks)) mock.mockReset();
		mocks.getRandomQuestions.mockReturnValue([]);
	});

	it("calls getQuestionsByDomainScenario once for each of the 15 valid domain/scenario pairs", async () => {
		mocks.getQuestionsByDomainScenario.mockReturnValue([]);
		const { getExamQuestions } = await loadSubject();
		getExamQuestions();
		// 6 scenarios × their primary domains: 3+2+3+3+2+2 = 15 pairs
		expect(mocks.getQuestionsByDomainScenario).toHaveBeenCalledTimes(15);
	});

	it("deduplicates questions that appear in multiple pairs", async () => {
		const shared = makeRow(1);
		let calls = 0;
		mocks.getQuestionsByDomainScenario.mockImplementation(() => {
			calls++;
			if (calls === 1) return [shared, makeRow()];
			if (calls === 2) return [shared, makeRow()]; // shared row duplicated
			return [];
		});
		const { getExamQuestions } = await loadSubject();
		const result = getExamQuestions();
		const ids = result.map((q) => q.id);
		expect(ids.filter((id) => id === 1)).toHaveLength(1);
	});

	it("calls getRandomQuestions with needed count and used IDs when pool is under 60", async () => {
		mocks.getQuestionsByDomainScenario.mockReturnValue([]);
		const { getExamQuestions, EXAM_QUESTION_COUNT } = await loadSubject();
		getExamQuestions();
		expect(mocks.getRandomQuestions).toHaveBeenCalledWith(
			EXAM_QUESTION_COUNT,
			[],
		);
	});

	it("does not call getRandomQuestions when the pool already has 60 questions", async () => {
		// Return 4 unique questions per call × 15 calls = 60 total
		let globalId = 0;
		mocks.getQuestionsByDomainScenario.mockImplementation(() => [
			makeRow(++globalId),
			makeRow(++globalId),
			makeRow(++globalId),
			makeRow(++globalId),
		]);
		const { getExamQuestions } = await loadSubject();
		getExamQuestions();
		expect(mocks.getRandomQuestions).not.toHaveBeenCalled();
	});

	it("returns at most EXAM_QUESTION_COUNT questions", async () => {
		let globalId = 0;
		mocks.getQuestionsByDomainScenario.mockImplementation(() => [
			makeRow(++globalId),
			makeRow(++globalId),
			makeRow(++globalId),
			makeRow(++globalId),
		]);
		const { getExamQuestions, EXAM_QUESTION_COUNT } = await loadSubject();
		const result = getExamQuestions();
		expect(result.length).toBeLessThanOrEqual(EXAM_QUESTION_COUNT);
	});

	it("returns ExamQuestions with id, question, choices, domain, scenario, difficulty", async () => {
		mocks.getQuestionsByDomainScenario.mockReturnValue([makeRow(1)]);
		const { getExamQuestions } = await loadSubject();
		const result = getExamQuestions();
		const q = result.find((r) => r.id === 1);
		expect(q).toBeDefined();
		expect(q?.choices.map((c) => c.letter).sort()).toEqual([
			"a",
			"b",
			"c",
			"d",
		]);
		expect(q?.domain).toBe("agentic-architecture");
	});

	it("does not expose correctAlternative on returned ExamQuestions", async () => {
		mocks.getQuestionsByDomainScenario.mockReturnValue([makeRow(1)]);
		const { getExamQuestions } = await loadSubject();
		const result = getExamQuestions();
		for (const q of result) {
			expect(Object.keys(q)).not.toContain("correctAlternative");
		}
	});
});

describe("startExamSession", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) mock.mockReset();
	});

	it("calls insertExamSimulation with placeholder values and returns the simulation id", async () => {
		mocks.insertExamSimulation.mockReturnValue({
			id: 42,
			completed: false,
			duration: 0,
			score: 0,
			createdAt: new Date(),
		});
		const { startExamSession } = await loadSubject();
		const id = startExamSession();
		expect(id).toBe(42);
		expect(mocks.insertExamSimulation).toHaveBeenCalledWith({
			completed: false,
			duration: 0,
			score: 0,
		});
	});
});

describe("recordExamAnswer", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) mock.mockReset();
	});

	it("throws when the question is not found", async () => {
		mocks.getQuestionById.mockReturnValue(undefined);
		const { recordExamAnswer } = await loadSubject();
		expect(() => recordExamAnswer(1, 99, "a", 3000)).toThrow(/99/);
	});

	it("records isCorrect: true when selected matches correctAlternative", async () => {
		mocks.getQuestionById.mockReturnValue(makeRow(1));
		const { recordExamAnswer } = await loadSubject();
		recordExamAnswer(42, 1, "b", 5000);
		expect(mocks.insertAnswer).toHaveBeenCalledWith(
			expect.objectContaining({
				isCorrect: true,
				selectedAlternative: "b",
				questionId: 1,
				examSimulationId: 42,
			}),
		);
	});

	it("records isCorrect: false when selected does not match correctAlternative", async () => {
		mocks.getQuestionById.mockReturnValue(makeRow(1));
		const { recordExamAnswer } = await loadSubject();
		recordExamAnswer(42, 1, "a", 5000);
		expect(mocks.insertAnswer).toHaveBeenCalledWith(
			expect.objectContaining({ isCorrect: false, selectedAlternative: "a" }),
		);
	});
});

describe("finalizeExamSession", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) mock.mockReset();
	});

	it("returns a zero score and empty arrays when there are no saved answers", async () => {
		mocks.getAnswersByExamSimulationId.mockReturnValue([]);
		const { finalizeExamSession } = await loadSubject();
		const result = finalizeExamSession(1, 3_600_000, true);
		expect(result.score).toBe(0);
		expect(result.correctCount).toBe(0);
		expect(result.byDomain).toHaveLength(0);
		expect(result.byScenario).toHaveLength(0);
		expect(result.questionResults).toHaveLength(0);
	});

	it("computes score as round(correctCount * 1000 / 60)", async () => {
		// 45 correct out of 60 = score 750
		const answers = Array.from({ length: 45 }, (_, i) =>
			makeAnswer({
				id: i + 1,
				questionId: i + 1,
				isCorrect: true,
				selectedAlternative: "b",
			}),
		);
		const wrongAnswers = Array.from({ length: 15 }, (_, i) =>
			makeAnswer({
				id: 50 + i,
				questionId: 50 + i,
				isCorrect: false,
				selectedAlternative: "a",
			}),
		);
		mocks.getAnswersByExamSimulationId.mockReturnValue([
			...answers,
			...wrongAnswers,
		]);
		mocks.getQuestionById.mockImplementation((id: number) =>
			makeRow(id, {
				domain: "agentic-architecture",
				scenario: "customer-support-agent",
			}),
		);
		const { finalizeExamSession } = await loadSubject();
		const result = finalizeExamSession(1, 3_600_000, true);
		expect(result.score).toBe(750);
		expect(result.correctCount).toBe(45);
		expect(result.wrongCount).toBe(15);
	});

	it("computes percentage as round(correct/answered * 1000) / 10", async () => {
		const answers = [
			makeAnswer({ questionId: 1, isCorrect: true, selectedAlternative: "b" }),
			makeAnswer({ questionId: 2, isCorrect: false, selectedAlternative: "a" }),
		];
		mocks.getAnswersByExamSimulationId.mockReturnValue(answers);
		mocks.getQuestionById.mockImplementation((id: number) => makeRow(id));
		const { finalizeExamSession } = await loadSubject();
		const result = finalizeExamSession(1, 60_000, true);
		expect(result.percentage).toBe(50);
	});

	it("groups results by domain and scenario", async () => {
		const answers = [
			makeAnswer({ questionId: 1, isCorrect: true, selectedAlternative: "b" }),
			makeAnswer({ questionId: 2, isCorrect: false, selectedAlternative: "a" }),
		];
		mocks.getAnswersByExamSimulationId.mockReturnValue(answers);
		mocks.getQuestionById.mockImplementation((id: number) =>
			makeRow(id, {
				domain: "agentic-architecture",
				scenario: "customer-support-agent",
			}),
		);
		const { finalizeExamSession } = await loadSubject();
		const result = finalizeExamSession(1, 60_000, true);
		expect(result.byDomain).toHaveLength(1);
		expect(result.byDomain[0]).toEqual({
			domain: "agentic-architecture",
			correct: 1,
			total: 2,
		});
		expect(result.byScenario).toHaveLength(1);
		expect(result.byScenario[0]).toEqual({
			scenario: "customer-support-agent",
			correct: 1,
			total: 2,
		});
	});

	it("calls updateExamSimulation with score, duration, and completed flag", async () => {
		mocks.getAnswersByExamSimulationId.mockReturnValue([]);
		const { finalizeExamSession } = await loadSubject();
		finalizeExamSession(7, 5_000_000, false);
		expect(mocks.updateExamSimulation).toHaveBeenCalledWith(7, {
			completed: false,
			duration: 5_000_000,
			score: 0,
		});
	});

	it("skips questions not found in the database when computing results", async () => {
		mocks.getAnswersByExamSimulationId.mockReturnValue([
			makeAnswer({ questionId: 1 }),
			makeAnswer({ questionId: 999 }), // will return undefined
		]);
		mocks.getQuestionById.mockImplementation((id: number) =>
			id === 999 ? undefined : makeRow(id),
		);
		const { finalizeExamSession } = await loadSubject();
		const result = finalizeExamSession(1, 60_000, true);
		// only the found question contributes
		expect(result.questionResults).toHaveLength(1);
	});
});
