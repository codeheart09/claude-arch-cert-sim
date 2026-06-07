import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	createUser: vi.fn(),
	getRandomPracticeQuestion: vi.fn(),
	gradeAndRecordAnswer: vi.fn(),
	getExamQuestions: vi.fn(),
	startExamSession: vi.fn(),
	recordExamAnswer: vi.fn(),
	finalizeExamSession: vi.fn(),
	refresh: vi.fn(),
}));

vi.mock("@/lib/user", () => ({
	getUser: mocks.getUser,
	createUser: mocks.createUser,
}));

vi.mock("@/lib/practice", () => ({
	getRandomPracticeQuestion: mocks.getRandomPracticeQuestion,
	gradeAndRecordAnswer: mocks.gradeAndRecordAnswer,
}));

vi.mock("@/lib/exam", () => ({
	getExamQuestions: mocks.getExamQuestions,
	startExamSession: mocks.startExamSession,
	recordExamAnswer: mocks.recordExamAnswer,
	finalizeExamSession: mocks.finalizeExamSession,
}));

vi.mock("next/cache", () => ({
	refresh: mocks.refresh,
}));

async function loadSubject() {
	return import("./actions");
}

function makeFormData(name: string) {
	const fd = new FormData();
	fd.set("name", name);
	return fd;
}

describe("createLocalUser", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) mock.mockReset();
		mocks.getUser.mockReturnValue(undefined);
	});

	it("returns an error when name is empty string", async () => {
		const { createLocalUser } = await loadSubject();
		const result = await createLocalUser({}, makeFormData("   "));
		expect(result.error).toBeTruthy();
	});

	it("returns an error when name exceeds 80 characters", async () => {
		const { createLocalUser } = await loadSubject();
		const result = await createLocalUser({}, makeFormData("a".repeat(81)));
		expect(result.error).toBeTruthy();
	});

	it("accepts a name of exactly 80 characters", async () => {
		const { createLocalUser } = await loadSubject();
		const result = await createLocalUser({}, makeFormData("a".repeat(80)));
		expect(result.error).toBeUndefined();
	});

	it("calls createUser with the trimmed name when no user exists", async () => {
		mocks.getUser.mockReturnValue(undefined);
		const { createLocalUser } = await loadSubject();
		await createLocalUser({}, makeFormData("  Alice  "));
		expect(mocks.createUser).toHaveBeenCalledWith("Alice");
	});

	it("does not call createUser when a user already exists", async () => {
		mocks.getUser.mockReturnValue({
			id: 1,
			name: "Bob",
			createdAt: new Date(),
		});
		const { createLocalUser } = await loadSubject();
		await createLocalUser({}, makeFormData("Alice"));
		expect(mocks.createUser).not.toHaveBeenCalled();
	});

	it("calls refresh() after a successful action", async () => {
		const { createLocalUser } = await loadSubject();
		await createLocalUser({}, makeFormData("Alice"));
		expect(mocks.refresh).toHaveBeenCalledOnce();
	});

	it("returns an empty object on success", async () => {
		const { createLocalUser } = await loadSubject();
		const result = await createLocalUser({}, makeFormData("Alice"));
		expect(result).toEqual({});
	});

	it("collapses multiple internal spaces in the name", async () => {
		const { createLocalUser } = await loadSubject();
		await createLocalUser({}, makeFormData("Alice   Bob"));
		expect(mocks.createUser).toHaveBeenCalledWith("Alice Bob");
	});
});

describe("submitPracticeAnswer", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) mock.mockReset();
	});

	it("throws for an alternative not in the enum", async () => {
		const { submitPracticeAnswer } = await loadSubject();
		await expect(submitPracticeAnswer(1, "f" as never, 1000)).rejects.toThrow(
			/invalid alternative/i,
		);
	});

	it("delegates to gradeAndRecordAnswer for a valid alternative", async () => {
		mocks.gradeAndRecordAnswer.mockReturnValue({
			isCorrect: true,
			insight: "Good",
		});
		const { submitPracticeAnswer } = await loadSubject();
		const result = await submitPracticeAnswer(1, "a", 2000);
		expect(mocks.gradeAndRecordAnswer).toHaveBeenCalledWith(1, "a", 2000);
		expect(result).toEqual({ isCorrect: true, insight: "Good" });
	});

	it("accepts all valid alternatives a, b, c, d, e", async () => {
		mocks.gradeAndRecordAnswer.mockReturnValue({
			isCorrect: false,
			insight: "",
		});
		const { submitPracticeAnswer } = await loadSubject();
		for (const alt of ["a", "b", "c", "d", "e"] as const) {
			await expect(submitPracticeAnswer(1, alt)).resolves.not.toThrow();
		}
	});
});

describe("recordSingleExamAnswer", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) mock.mockReset();
	});

	it("throws for an alternative not in the enum", async () => {
		const { recordSingleExamAnswer } = await loadSubject();
		await expect(
			recordSingleExamAnswer(1, 1, "z" as never, 1000),
		).rejects.toThrow(/invalid alternative/i);
	});

	it("accepts all valid alternatives a through e", async () => {
		const { recordSingleExamAnswer } = await loadSubject();
		for (const alt of ["a", "b", "c", "d", "e"] as const) {
			await expect(
				recordSingleExamAnswer(1, 1, alt, 1000),
			).resolves.not.toThrow();
		}
	});

	it("delegates to recordExamAnswer with all four arguments for a valid alternative", async () => {
		const { recordSingleExamAnswer } = await loadSubject();
		await recordSingleExamAnswer(42, 7, "c", 3000);
		expect(mocks.recordExamAnswer).toHaveBeenCalledWith(42, 7, "c", 3000);
	});
});

describe("fetchRandomQuestion", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) mock.mockReset();
	});

	it("delegates to getRandomPracticeQuestion with the given exclude list", async () => {
		mocks.getRandomPracticeQuestion.mockReturnValue(null);
		const { fetchRandomQuestion } = await loadSubject();
		await fetchRandomQuestion([1, 2, 3]);
		expect(mocks.getRandomPracticeQuestion).toHaveBeenCalledWith([1, 2, 3]);
	});

	it("passes an empty array by default", async () => {
		mocks.getRandomPracticeQuestion.mockReturnValue(null);
		const { fetchRandomQuestion } = await loadSubject();
		await fetchRandomQuestion();
		expect(mocks.getRandomPracticeQuestion).toHaveBeenCalledWith([]);
	});
});

describe("startExamSimulation", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) mock.mockReset();
	});

	it("delegates to startExamSession and returns the simulation id", async () => {
		mocks.startExamSession.mockReturnValue(55);
		const { startExamSimulation } = await loadSubject();
		expect(await startExamSimulation()).toBe(55);
	});
});

describe("finalizeExamSimulation", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) mock.mockReset();
	});

	it("delegates to finalizeExamSession with all arguments and returns the result", async () => {
		const gradeResult = {
			examSimulationId: 1,
			score: 750,
			correctCount: 45,
			wrongCount: 15,
			percentage: 75,
			totalExamTimeMs: 3_600_000,
			avgQuestionTimeMs: 60_000,
			byDomain: [],
			byScenario: [],
			questionResults: [],
		};
		mocks.finalizeExamSession.mockReturnValue(gradeResult);
		const { finalizeExamSimulation } = await loadSubject();
		const result = await finalizeExamSimulation(1, 3_600_000, true);
		expect(mocks.finalizeExamSession).toHaveBeenCalledWith(1, 3_600_000, true);
		expect(result).toBe(gradeResult);
	});
});
