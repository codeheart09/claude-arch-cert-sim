import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getAnthropic: vi.fn(),
	getDefaultModel: vi.fn().mockReturnValue("claude-sonnet-4-6"),
	retrieveGrounding: vi.fn(),
	getAnalyticsData: vi.fn(),
}));

vi.mock("./anthropic", () => ({
	getAnthropic: mocks.getAnthropic,
	getDefaultModel: mocks.getDefaultModel,
}));

vi.mock("./knowledge-base", () => ({
	retrieveGrounding: mocks.retrieveGrounding,
}));

vi.mock("./analytics", () => ({
	getAnalyticsData: mocks.getAnalyticsData,
}));

type TextCallback = (delta: string) => void;

function makeStream(
	textDeltas: string[],
	finalContent: unknown[],
	stopReason: "end_turn" | "tool_use" = "end_turn",
) {
	const cbs: TextCallback[] = [];
	return {
		on: vi.fn((event: string, cb: TextCallback) => {
			if (event === "text") cbs.push(cb);
		}),
		finalMessage: vi.fn(async () => {
			for (const delta of textDeltas) {
				for (const cb of cbs) cb(delta);
			}
			return { stop_reason: stopReason, content: finalContent };
		}),
	};
}

async function loadSubject() {
	return import("./ai-tutor");
}

describe("messagesToParams", () => {
	it("returns an empty array for empty input", async () => {
		const { messagesToParams } = await loadSubject();
		expect(messagesToParams([])).toEqual([]);
	});

	it("maps messages to { role, content } pairs", async () => {
		const { messagesToParams } = await loadSubject();
		const messages = [
			{
				id: 1,
				conversationId: 1,
				role: "user" as const,
				content: "hello",
				createdAt: new Date(),
			},
			{
				id: 2,
				conversationId: 1,
				role: "assistant" as const,
				content: "hi",
				createdAt: new Date(),
			},
		];
		expect(messagesToParams(messages)).toEqual([
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "hi" },
		]);
	});
});

describe("runAgentLoop — text-only response", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) {
			if (typeof mock.mockReset === "function") mock.mockReset();
		}
		mocks.getDefaultModel.mockReturnValue("claude-sonnet-4-6");
	});

	it("streams text deltas via the onText callback", async () => {
		const stream = makeStream(["hello ", "world"], [], "end_turn");
		const mockClient = {
			messages: { stream: vi.fn().mockReturnValue(stream) },
		};
		mocks.getAnthropic.mockReturnValue(mockClient);

		const { runAgentLoop } = await loadSubject();
		const received: string[] = [];
		await runAgentLoop([], (delta) => received.push(delta));

		expect(received).toEqual(["hello ", "world"]);
	});

	it("returns the fully accumulated text", async () => {
		const stream = makeStream(["hello ", "world"], [], "end_turn");
		const mockClient = {
			messages: { stream: vi.fn().mockReturnValue(stream) },
		};
		mocks.getAnthropic.mockReturnValue(mockClient);

		const { runAgentLoop } = await loadSubject();
		const result = await runAgentLoop([], () => {});
		expect(result).toBe("hello world");
	});

	it("passes the accumulated text from a prior turn into the next recursive call", async () => {
		const stream = makeStream(["new text"], [], "end_turn");
		const mockClient = {
			messages: { stream: vi.fn().mockReturnValue(stream) },
		};
		mocks.getAnthropic.mockReturnValue(mockClient);

		const { runAgentLoop } = await loadSubject();
		const result = await runAgentLoop([], () => {}, "prior ");
		expect(result).toBe("prior new text");
	});

	it("calls client.messages.stream with the model and system prompt", async () => {
		const stream = makeStream([], [], "end_turn");
		const mockClient = {
			messages: { stream: vi.fn().mockReturnValue(stream) },
		};
		mocks.getAnthropic.mockReturnValue(mockClient);

		const { runAgentLoop } = await loadSubject();
		await runAgentLoop([{ role: "user", content: "hello" }], () => {});

		expect(mockClient.messages.stream).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "claude-sonnet-4-6",
				messages: [{ role: "user", content: "hello" }],
			}),
		);
	});
});

describe("runAgentLoop — search_knowledge_base tool", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) {
			if (typeof mock.mockReset === "function") mock.mockReset();
		}
		mocks.getDefaultModel.mockReturnValue("claude-sonnet-4-6");
	});

	it("calls retrieveGrounding and recurses with tool results", async () => {
		const toolUseBlock = {
			type: "tool_use",
			id: "tool-1",
			name: "search_knowledge_base",
			input: { query: "agentic architecture" },
		};
		const firstStream = makeStream([], [toolUseBlock], "tool_use");
		const secondStream = makeStream(["done"], [], "end_turn");

		let streamCall = 0;
		const mockClient = {
			messages: {
				stream: vi.fn().mockImplementation(() => {
					streamCall++;
					return streamCall === 1 ? firstStream : secondStream;
				}),
			},
		};
		mocks.getAnthropic.mockReturnValue(mockClient);
		mocks.retrieveGrounding.mockResolvedValue([
			{
				heading: "Overview",
				domain: "agentic-architecture",
				text: "Content here.",
			},
		]);

		const { runAgentLoop } = await loadSubject();
		const result = await runAgentLoop([], () => {});

		expect(mocks.retrieveGrounding).toHaveBeenCalledWith(
			"agentic architecture",
			{ domain: undefined, limit: 5 },
		);
		expect(result).toBe("done");
	});

	it("returns an error JSON result when the search_knowledge_base input is invalid", async () => {
		const toolUseBlock = {
			type: "tool_use",
			id: "tool-1",
			name: "search_knowledge_base",
			input: { notQuery: "oops" }, // missing required 'query'
		};
		const firstStream = makeStream([], [toolUseBlock], "tool_use");
		const secondStream = makeStream(["ok"], [], "end_turn");

		let streamCall = 0;
		const mockClient = {
			messages: {
				stream: vi.fn().mockImplementation(() => {
					streamCall++;
					return streamCall === 1 ? firstStream : secondStream;
				}),
			},
		};
		mocks.getAnthropic.mockReturnValue(mockClient);

		const { runAgentLoop } = await loadSubject();
		await runAgentLoop([], () => {});

		// The tool result message should contain an error
		const secondCallMessages =
			mockClient.messages.stream.mock.calls[1][0].messages;
		const toolResultMessage = secondCallMessages.at(-1);
		const toolResult = toolResultMessage.content[0];
		const parsed = JSON.parse(toolResult.content as string);
		expect(parsed).toHaveProperty("error");
	});

	it("returns a no-results JSON when retrieveGrounding returns empty", async () => {
		const toolUseBlock = {
			type: "tool_use",
			id: "tool-1",
			name: "search_knowledge_base",
			input: { query: "obscure topic" },
		};
		const firstStream = makeStream([], [toolUseBlock], "tool_use");
		const secondStream = makeStream(["response"], [], "end_turn");

		let streamCall = 0;
		const mockClient = {
			messages: {
				stream: vi.fn().mockImplementation(() => {
					streamCall++;
					return streamCall === 1 ? firstStream : secondStream;
				}),
			},
		};
		mocks.getAnthropic.mockReturnValue(mockClient);
		mocks.retrieveGrounding.mockResolvedValue([]);

		const { runAgentLoop } = await loadSubject();
		await runAgentLoop([], () => {});

		const secondCallMessages =
			mockClient.messages.stream.mock.calls[1][0].messages;
		const toolResultMessage = secondCallMessages.at(-1);
		const toolResult = toolResultMessage.content[0];
		const parsed = JSON.parse(toolResult.content as string);
		expect(parsed.result).toMatch(/no relevant/i);
	});
});

describe("runAgentLoop — get_analytics tool", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) {
			if (typeof mock.mockReset === "function") mock.mockReset();
		}
		mocks.getDefaultModel.mockReturnValue("claude-sonnet-4-6");
	});

	it("calls getAnalyticsData with the requested period", async () => {
		const toolUseBlock = {
			type: "tool_use",
			id: "tool-2",
			name: "get_analytics",
			input: { period: "7d" },
		};
		const firstStream = makeStream([], [toolUseBlock], "tool_use");
		const secondStream = makeStream(["analytics response"], [], "end_turn");

		let streamCall = 0;
		const mockClient = {
			messages: {
				stream: vi.fn().mockImplementation(() => {
					streamCall++;
					return streamCall === 1 ? firstStream : secondStream;
				}),
			},
		};
		mocks.getAnthropic.mockReturnValue(mockClient);
		mocks.getAnalyticsData.mockReturnValue({
			totalAnswers: 10,
			correctnessRate: 80,
		});

		const { runAgentLoop } = await loadSubject();
		await runAgentLoop([], () => {});

		expect(mocks.getAnalyticsData).toHaveBeenCalledWith("7d");
	});

	it("defaults to 'all' period when an invalid period is provided", async () => {
		const toolUseBlock = {
			type: "tool_use",
			id: "tool-2",
			name: "get_analytics",
			input: { period: "invalid-period" },
		};
		const firstStream = makeStream([], [toolUseBlock], "tool_use");
		const secondStream = makeStream(["done"], [], "end_turn");

		let streamCall = 0;
		const mockClient = {
			messages: {
				stream: vi.fn().mockImplementation(() => {
					streamCall++;
					return streamCall === 1 ? firstStream : secondStream;
				}),
			},
		};
		mocks.getAnthropic.mockReturnValue(mockClient);
		mocks.getAnalyticsData.mockReturnValue({});

		const { runAgentLoop } = await loadSubject();
		await runAgentLoop([], () => {});

		expect(mocks.getAnalyticsData).toHaveBeenCalledWith("all");
	});
});

describe("runAgentLoop — unknown tool", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) {
			if (typeof mock.mockReset === "function") mock.mockReset();
		}
		mocks.getDefaultModel.mockReturnValue("claude-sonnet-4-6");
	});

	it("returns an error result for an unknown tool and continues the loop", async () => {
		const toolUseBlock = {
			type: "tool_use",
			id: "tool-x",
			name: "nonexistent_tool",
			input: {},
		};
		const firstStream = makeStream([], [toolUseBlock], "tool_use");
		const secondStream = makeStream(["continued"], [], "end_turn");

		let streamCall = 0;
		const mockClient = {
			messages: {
				stream: vi.fn().mockImplementation(() => {
					streamCall++;
					return streamCall === 1 ? firstStream : secondStream;
				}),
			},
		};
		mocks.getAnthropic.mockReturnValue(mockClient);

		const { runAgentLoop } = await loadSubject();
		const result = await runAgentLoop([], () => {});

		expect(result).toBe("continued");

		const secondCallMessages =
			mockClient.messages.stream.mock.calls[1][0].messages;
		const toolResultMessage = secondCallMessages.at(-1);
		const toolResult = toolResultMessage.content[0];
		const parsed = JSON.parse(toolResult.content as string);
		expect(parsed.error).toMatch(/unknown tool/i);
	});
});
