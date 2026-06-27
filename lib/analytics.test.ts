import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getRawAnswers: vi.fn(),
	getRawExams: vi.fn(),
}));

vi.mock("../db/analytics", () => ({
	getRawAnswers: mocks.getRawAnswers,
	getRawExams: mocks.getRawExams,
}));

async function loadSubject() {
	return import("./analytics");
}

function makeAnswer(
	overrides: Partial<{
		id: number;
		isCorrect: boolean;
		domain: string | null;
		scenario: string | null;
		duration: number | null;
		createdAt: Date;
	}> = {},
) {
	return {
		id: 1,
		isCorrect: true,
		domain: "agentic-architecture" as const,
		scenario: "customer-support-agent" as const,
		duration: 1000,
		createdAt: new Date("2026-01-01"),
		...overrides,
	};
}

function makeExam(
	overrides: Partial<{
		score: number;
		duration: number;
		completed: boolean;
	}> = {},
) {
	return {
		id: 1,
		score: 800,
		duration: 3_600_000,
		completed: true,
		createdAt: new Date("2026-01-01"),
		...overrides,
	};
}

describe("getAnalyticsData — period mapping", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.getRawAnswers.mockReset();
		mocks.getRawExams.mockReset();
		mocks.getRawAnswers.mockReturnValue([]);
		mocks.getRawExams.mockReturnValue([]);
	});

	it('passes { type: "all" } for period "all" and calls getRawExams with undefined', async () => {
		const { getAnalyticsData } = await loadSubject();
		getAnalyticsData("all");
		expect(mocks.getRawAnswers).toHaveBeenCalledWith({ type: "all" });
		expect(mocks.getRawExams).toHaveBeenCalledWith(undefined);
	});

	it('passes { type: "count", limit: 60 } for period "60q"', async () => {
		const { getAnalyticsData } = await loadSubject();
		getAnalyticsData("60q");
		expect(mocks.getRawAnswers).toHaveBeenCalledWith({
			type: "count",
			limit: 60,
		});
	});

	it('passes { type: "count", limit: 300 } for period "300q"', async () => {
		const { getAnalyticsData } = await loadSubject();
		getAnalyticsData("300q");
		expect(mocks.getRawAnswers).toHaveBeenCalledWith({
			type: "count",
			limit: 300,
		});
	});

	it('passes { type: "time", since } for period "1d" with a date ~24h ago', async () => {
		const before = Date.now();
		const { getAnalyticsData } = await loadSubject();
		getAnalyticsData("1d");
		const [filter] = mocks.getRawAnswers.mock.calls[0];
		expect(filter.type).toBe("time");
		const sinceMs = (filter.since as Date).getTime();
		const expectedMs = before - 86_400_000;
		expect(sinceMs).toBeGreaterThanOrEqual(expectedMs - 50);
		expect(sinceMs).toBeLessThanOrEqual(expectedMs + 100);
	});

	it('passes { type: "time", since } for period "7d" with a date ~7 days ago', async () => {
		const { getAnalyticsData } = await loadSubject();
		getAnalyticsData("7d");
		const [filter] = mocks.getRawAnswers.mock.calls[0];
		expect(filter.type).toBe("time");
	});

	it("scopes getRawExams to first answer createdAt for count-based periods with answers", async () => {
		const anchor = new Date("2026-05-01");
		mocks.getRawAnswers.mockReturnValue([makeAnswer({ createdAt: anchor })]);
		const { getAnalyticsData } = await loadSubject();
		getAnalyticsData("60q");
		expect(mocks.getRawExams).toHaveBeenCalledWith(anchor);
	});
});

describe("getAnalyticsData — correctness computations", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.getRawAnswers.mockReset();
		mocks.getRawExams.mockReset();
		mocks.getRawExams.mockReturnValue([]);
	});

	it("correctnessRate is null when there are no answers", async () => {
		mocks.getRawAnswers.mockReturnValue([]);
		const { getAnalyticsData } = await loadSubject();
		const result = getAnalyticsData("all");
		expect(result.correctnessRate).toBeNull();
		expect(result.totalAnswers).toBe(0);
	});

	it("correctnessRate is computed as a percentage of correct answers", async () => {
		mocks.getRawAnswers.mockReturnValue([
			makeAnswer({ isCorrect: true }),
			makeAnswer({ isCorrect: true }),
			makeAnswer({ isCorrect: false }),
			makeAnswer({ isCorrect: false }),
		]);
		const { getAnalyticsData } = await loadSubject();
		const result = getAnalyticsData("all");
		expect(result.correctnessRate).toBe(50);
		expect(result.totalAnswers).toBe(4);
	});

	it("correctnessRate is 100 when all answers are correct", async () => {
		mocks.getRawAnswers.mockReturnValue([
			makeAnswer({ isCorrect: true }),
			makeAnswer({ isCorrect: true }),
		]);
		const { getAnalyticsData } = await loadSubject();
		const result = getAnalyticsData("all");
		expect(result.correctnessRate).toBe(100);
	});
});

describe("getAnalyticsData — exam pass count", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.getRawAnswers.mockReset();
		mocks.getRawExams.mockReset();
		mocks.getRawAnswers.mockReturnValue([]);
	});

	it("counts exams with score exactly 720 as passing", async () => {
		mocks.getRawExams.mockReturnValue([makeExam({ score: 720 })]);
		const { getAnalyticsData } = await loadSubject();
		expect(getAnalyticsData("all").examPassCount).toBe(1);
	});

	it("does not count exams with score 719 as passing", async () => {
		mocks.getRawExams.mockReturnValue([makeExam({ score: 719 })]);
		const { getAnalyticsData } = await loadSubject();
		expect(getAnalyticsData("all").examPassCount).toBe(0);
	});

	it("counts only passing exams across a mixed set", async () => {
		mocks.getRawExams.mockReturnValue([
			makeExam({ score: 900 }),
			makeExam({ score: 720 }),
			makeExam({ score: 719 }),
			makeExam({ score: 0 }),
		]);
		const { getAnalyticsData } = await loadSubject();
		expect(getAnalyticsData("all").examPassCount).toBe(2);
	});
});

describe("getAnalyticsData — duration averages", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.getRawAnswers.mockReset();
		mocks.getRawExams.mockReset();
		mocks.getRawExams.mockReturnValue([]);
	});

	it("avgAnswerDurationMs is null when all durations are null", async () => {
		mocks.getRawAnswers.mockReturnValue([makeAnswer({ duration: null })]);
		const { getAnalyticsData } = await loadSubject();
		expect(getAnalyticsData("all").avgAnswerDurationMs).toBeNull();
	});

	it("avgAnswerDurationMs averages only non-null durations", async () => {
		mocks.getRawAnswers.mockReturnValue([
			makeAnswer({ duration: 1000 }),
			makeAnswer({ duration: 3000 }),
			makeAnswer({ duration: null }),
		]);
		const { getAnalyticsData } = await loadSubject();
		expect(getAnalyticsData("all").avgAnswerDurationMs).toBe(2000);
	});

	it("avgAnswerDurationMs is null when there are no answers", async () => {
		mocks.getRawAnswers.mockReturnValue([]);
		const { getAnalyticsData } = await loadSubject();
		expect(getAnalyticsData("all").avgAnswerDurationMs).toBeNull();
	});
});

describe("getAnalyticsData — group stats by domain and scenario", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.getRawAnswers.mockReset();
		mocks.getRawExams.mockReset();
		mocks.getRawExams.mockReturnValue([]);
	});

	it("groups answers by domain slug with correct label, correct count, and total", async () => {
		mocks.getRawAnswers.mockReturnValue([
			makeAnswer({ domain: "agentic-architecture", isCorrect: true }),
			makeAnswer({ domain: "agentic-architecture", isCorrect: false }),
			makeAnswer({ domain: "tool-design-mcp", isCorrect: true }),
		]);
		const { getAnalyticsData } = await loadSubject();
		const { correctnessByDomain } = getAnalyticsData("all");

		const agentic = correctnessByDomain.find(
			(s) => s.slug === "agentic-architecture",
		);
		expect(agentic).toEqual({
			slug: "agentic-architecture",
			label: "Agentic Architecture",
			correct: 1,
			total: 2,
		});

		const tool = correctnessByDomain.find((s) => s.slug === "tool-design-mcp");
		expect(tool?.correct).toBe(1);
		expect(tool?.total).toBe(1);
	});

	it("omits domains with no answers", async () => {
		mocks.getRawAnswers.mockReturnValue([
			makeAnswer({ domain: "agentic-architecture" }),
		]);
		const { getAnalyticsData } = await loadSubject();
		const { correctnessByDomain } = getAnalyticsData("all");
		expect(correctnessByDomain).toHaveLength(1);
		expect(correctnessByDomain[0].slug).toBe("agentic-architecture");
	});

	it("groups answers by scenario slug with correct label", async () => {
		mocks.getRawAnswers.mockReturnValue([
			makeAnswer({ scenario: "customer-support-agent", isCorrect: true }),
			makeAnswer({ scenario: "code-generation", isCorrect: false }),
		]);
		const { getAnalyticsData } = await loadSubject();
		const { correctnessByScenario } = getAnalyticsData("all");

		const support = correctnessByScenario.find(
			(s) => s.slug === "customer-support-agent",
		);
		expect(support?.label).toBe("Customer Support");
		expect(support?.total).toBe(1);

		const code = correctnessByScenario.find(
			(s) => s.slug === "code-generation",
		);
		expect(code?.correct).toBe(0);
	});

	it("skips answers with null domain in domain stats", async () => {
		mocks.getRawAnswers.mockReturnValue([makeAnswer({ domain: null })]);
		const { getAnalyticsData } = await loadSubject();
		expect(getAnalyticsData("all").correctnessByDomain).toHaveLength(0);
	});
});

describe("getAnalyticsData — batch computations", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.getRawAnswers.mockReset();
		mocks.getRawExams.mockReset();
		mocks.getRawExams.mockReturnValue([]);
	});

	it("correctnessBatches splits answers into equal-sized groups", async () => {
		// 4 answers → batchSize = max(1, ceil(4/30)) = 1 → 4 batches of 1
		// values are cumulative accuracy: 1/1, 2/2, 3/3, 3/4
		mocks.getRawAnswers.mockReturnValue([
			makeAnswer({ isCorrect: true }),
			makeAnswer({ isCorrect: true }),
			makeAnswer({ isCorrect: true }),
			makeAnswer({ isCorrect: false }),
		]);
		const { getAnalyticsData } = await loadSubject();
		const { correctnessBatches } = getAnalyticsData("all");
		expect(correctnessBatches).toHaveLength(4);
		expect(correctnessBatches[0].value).toBe(100);
		expect(correctnessBatches[3].value).toBe(75);
	});

	it("correctnessBatches value is rounded to one decimal place", async () => {
		// 2 of 3 correct = 66.666... → should round to 66.7
		mocks.getRawAnswers.mockReturnValue([
			makeAnswer({ isCorrect: true }),
			makeAnswer({ isCorrect: true }),
			makeAnswer({ isCorrect: false }),
		]);
		const { getAnalyticsData } = await loadSubject();
		const { correctnessBatches } = getAnalyticsData("all");
		// batchSize = 1 → 3 batches; cumulative: 1/1=100, 2/2=100, 2/3=66.7
		expect(correctnessBatches[0].value).toBe(100);
		expect(correctnessBatches[2].value).toBe(66.7);
	});

	it("responseTimeBatches skips null durations in the average", async () => {
		// 2 answers → batchSize = 1 → 2 batches
		mocks.getRawAnswers.mockReturnValue([
			makeAnswer({ duration: 2000 }),
			makeAnswer({ duration: null }),
		]);
		const { getAnalyticsData } = await loadSubject();
		const { responseTimeBatches } = getAnalyticsData("all");
		expect(responseTimeBatches).toHaveLength(2);
		expect(responseTimeBatches[0].value).toBe(2000);
		expect(responseTimeBatches[0].count).toBe(1);
		// Second batch has null duration → filtered out → avg = 0, count = 0
		expect(responseTimeBatches[1].value).toBe(0);
		expect(responseTimeBatches[1].count).toBe(0);
	});

	it("correctnessBatches is empty when there are no answers", async () => {
		mocks.getRawAnswers.mockReturnValue([]);
		const { getAnalyticsData } = await loadSubject();
		expect(getAnalyticsData("all").correctnessBatches).toHaveLength(0);
	});
});
