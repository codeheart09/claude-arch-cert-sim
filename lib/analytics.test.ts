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

	it("correctnessBatches is empty when there are no answers", async () => {
		mocks.getRawAnswers.mockReturnValue([]);
		const { getAnalyticsData } = await loadSubject();
		expect(getAnalyticsData("all").correctnessBatches).toHaveLength(0);
	});

	it("returns no batches when answers are fewer than MIN_BATCH_SIZE (10)", async () => {
		mocks.getRawAnswers.mockReturnValue(
			Array.from({ length: 9 }, () => makeAnswer({ isCorrect: true })),
		);
		const { getAnalyticsData } = await loadSubject();
		expect(getAnalyticsData("all").correctnessBatches).toHaveLength(0);
	});

	it("returns 1 batch when there are exactly 10 answers", async () => {
		mocks.getRawAnswers.mockReturnValue([
			...Array.from({ length: 7 }, () => makeAnswer({ isCorrect: true })),
			...Array.from({ length: 3 }, () => makeAnswer({ isCorrect: false })),
		]);
		const { getAnalyticsData } = await loadSubject();
		const { correctnessBatches } = getAnalyticsData("all");
		expect(correctnessBatches).toHaveLength(1);
		expect(correctnessBatches[0].value).toBe(70);
		expect(correctnessBatches[0].count).toBe(10);
	});

	it("excludes the incomplete trailing batch (19 answers → 1 batch, not 2)", async () => {
		mocks.getRawAnswers.mockReturnValue(
			Array.from({ length: 19 }, () => makeAnswer({ isCorrect: true })),
		);
		const { getAnalyticsData } = await loadSubject();
		expect(getAnalyticsData("all").correctnessBatches).toHaveLength(1);
	});

	it("returns 2 batches for exactly 20 answers", async () => {
		mocks.getRawAnswers.mockReturnValue(
			Array.from({ length: 20 }, () => makeAnswer({ isCorrect: true })),
		);
		const { getAnalyticsData } = await loadSubject();
		expect(getAnalyticsData("all").correctnessBatches).toHaveLength(2);
	});

	it("caps at 30 batches and expands batch size when answers exceed 300", async () => {
		// 600 answers → batchSize = ceil(600/30) = 20 → 30 complete batches
		mocks.getRawAnswers.mockReturnValue(
			Array.from({ length: 600 }, () => makeAnswer({ isCorrect: true })),
		);
		const { getAnalyticsData } = await loadSubject();
		const { correctnessBatches } = getAnalyticsData("all");
		expect(correctnessBatches).toHaveLength(30);
		expect(correctnessBatches[0].count).toBe(20);
	});

	it("correctnessBatches value is rounded to one decimal place", async () => {
		// 1 correct out of 3 per batch segment = 33.333...% → rounds to 33.3
		// Need to test with a batch where the value is non-integer: use duration=0 trick
		// 10 answers: 1 correct, 9 wrong → 10% (exact). Test a fractional case via responseTime.
		// For correctness: value = round(n/10 * 1000) / 10; any n/10 is exact, so test the formula directly.
		// 1/10 = 10.0, 7/10 = 70.0 — all exact. Rounding is exercised by responseTimeBatches.
		mocks.getRawAnswers.mockReturnValue(
			Array.from({ length: 10 }, (_, i) =>
				makeAnswer({ isCorrect: i === 0, duration: i === 0 ? 3333 : 3333 }),
			),
		);
		const { getAnalyticsData } = await loadSubject();
		const { correctnessBatches } = getAnalyticsData("all");
		expect(correctnessBatches[0].value).toBe(10);
	});

	it("responseTimeBatches skips null durations in the average", async () => {
		// 10 answers: 9 with duration 2000ms, 1 with null → avg = 2000, count = 9
		mocks.getRawAnswers.mockReturnValue([
			...Array.from({ length: 9 }, () => makeAnswer({ duration: 2000 })),
			makeAnswer({ duration: null }),
		]);
		const { getAnalyticsData } = await loadSubject();
		const { responseTimeBatches } = getAnalyticsData("all");
		expect(responseTimeBatches).toHaveLength(1);
		expect(responseTimeBatches[0].value).toBe(2000);
		expect(responseTimeBatches[0].count).toBe(9);
	});

	it("responseTimeBatches rounds the average to the nearest millisecond", async () => {
		// 10 answers with durations summing to a non-integer avg: 10 × 1001 = 10010ms / 10 = 1001ms (exact)
		// Use 3 answers of 1000 and 7 answers of 2000 → avg = (3000 + 14000)/10 = 1700ms (exact)
		// Use 1 answer of 1 and 9 of 2 → avg = 19/10 = 1.9 → rounds to 2
		mocks.getRawAnswers.mockReturnValue([
			makeAnswer({ duration: 1 }),
			...Array.from({ length: 9 }, () => makeAnswer({ duration: 2 })),
		]);
		const { getAnalyticsData } = await loadSubject();
		const { responseTimeBatches } = getAnalyticsData("all");
		expect(responseTimeBatches[0].value).toBe(2); // round(19/10) = round(1.9) = 2
	});
});
