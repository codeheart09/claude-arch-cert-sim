import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	function MockAnthropic(this: { _apiKey: string }, opts: { apiKey: string }) {
		this._apiKey = opts.apiKey;
	}
	return { AnthropicConstructor: vi.fn(MockAnthropic) };
});

vi.mock("@anthropic-ai/sdk", () => ({
	default: mocks.AnthropicConstructor,
}));

async function loadSubject() {
	return import("./anthropic");
}

describe("getDefaultModel", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('returns "claude-sonnet-4-6" when ANTHROPIC_MODEL is not set', async () => {
		const saved = process.env.ANTHROPIC_MODEL;
		delete process.env.ANTHROPIC_MODEL;
		try {
			const { getDefaultModel } = await loadSubject();
			expect(getDefaultModel()).toBe("claude-sonnet-4-6");
		} finally {
			if (saved !== undefined) process.env.ANTHROPIC_MODEL = saved;
		}
	});

	it("returns the value of ANTHROPIC_MODEL when set to a non-empty string", async () => {
		vi.stubEnv("ANTHROPIC_MODEL", "claude-opus-4-8");
		const { getDefaultModel } = await loadSubject();
		expect(getDefaultModel()).toBe("claude-opus-4-8");
	});
});

describe("getDefaultConcurrency", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 5 when QUESTION_GEN_CONCURRENCY is not set", async () => {
		const saved = process.env.QUESTION_GEN_CONCURRENCY;
		delete process.env.QUESTION_GEN_CONCURRENCY;
		try {
			const { getDefaultConcurrency } = await loadSubject();
			expect(getDefaultConcurrency()).toBe(5);
		} finally {
			if (saved !== undefined) process.env.QUESTION_GEN_CONCURRENCY = saved;
		}
	});

	it("returns the integer value of QUESTION_GEN_CONCURRENCY when set", async () => {
		vi.stubEnv("QUESTION_GEN_CONCURRENCY", "10");
		const { getDefaultConcurrency } = await loadSubject();
		expect(getDefaultConcurrency()).toBe(10);
	});

	it("falls back to 5 when QUESTION_GEN_CONCURRENCY is a non-integer string", async () => {
		vi.stubEnv("QUESTION_GEN_CONCURRENCY", "abc");
		const { getDefaultConcurrency } = await loadSubject();
		expect(getDefaultConcurrency()).toBe(5);
	});

	it("falls back to 5 when QUESTION_GEN_CONCURRENCY is a float", async () => {
		vi.stubEnv("QUESTION_GEN_CONCURRENCY", "2.5");
		const { getDefaultConcurrency } = await loadSubject();
		expect(getDefaultConcurrency()).toBe(5);
	});

	it("falls back to 5 when QUESTION_GEN_CONCURRENCY is zero", async () => {
		vi.stubEnv("QUESTION_GEN_CONCURRENCY", "0");
		const { getDefaultConcurrency } = await loadSubject();
		expect(getDefaultConcurrency()).toBe(5);
	});

	it("falls back to 5 when QUESTION_GEN_CONCURRENCY is negative", async () => {
		vi.stubEnv("QUESTION_GEN_CONCURRENCY", "-3");
		const { getDefaultConcurrency } = await loadSubject();
		expect(getDefaultConcurrency()).toBe(5);
	});
});

describe("getAnthropic", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.AnthropicConstructor.mockClear();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("throws a descriptive error when ANTHROPIC_API_KEY is not set", async () => {
		const saved = process.env.ANTHROPIC_API_KEY;
		delete process.env.ANTHROPIC_API_KEY;
		try {
			const { getAnthropic } = await loadSubject();
			expect(() => getAnthropic()).toThrow(/ANTHROPIC_API_KEY/);
		} finally {
			if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
		}
	});

	it("returns an Anthropic client when ANTHROPIC_API_KEY is set", async () => {
		vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
		const { getAnthropic } = await loadSubject();
		const client = getAnthropic();
		expect(client).toBeDefined();
		expect(mocks.AnthropicConstructor).toHaveBeenCalledWith({
			apiKey: "test-key",
		});
	});

	it("returns the same singleton instance on repeated calls", async () => {
		vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
		const { getAnthropic } = await loadSubject();
		const first = getAnthropic();
		const second = getAnthropic();
		expect(first).toBe(second);
		expect(mocks.AnthropicConstructor).toHaveBeenCalledTimes(1);
	});
});
