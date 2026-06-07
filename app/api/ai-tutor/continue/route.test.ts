import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	connection: vi.fn().mockResolvedValue(undefined),
	getMessages: vi.fn(),
	addMessage: vi.fn(),
	messagesToParams: vi.fn(),
	runAgentLoop: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));

vi.mock("@/lib/conversations", () => ({
	getMessages: mocks.getMessages,
	addMessage: mocks.addMessage,
}));

vi.mock("@/lib/ai-tutor", () => ({
	messagesToParams: mocks.messagesToParams,
	runAgentLoop: mocks.runAgentLoop,
}));

async function loadSubject() {
	return import("./route");
}

function makeRequest(body: unknown) {
	return new Request("http://localhost/api/ai-tutor/continue", {
		method: "POST",
		body: JSON.stringify(body),
		headers: { "Content-Type": "application/json" },
	});
}

async function readBody(response: Response): Promise<string> {
	if (!response.body) return "";
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) chunks.push(value);
	}
	const totalLength = chunks.reduce((n, c) => n + c.length, 0);
	const merged = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.length;
	}
	return new TextDecoder().decode(merged);
}

const fakeHistory = [
	{
		id: 1,
		conversationId: 5,
		role: "user" as const,
		content: "I want to challenge this question.",
		createdAt: new Date(),
	},
];
const fakeParams = [
	{ role: "user" as const, content: "I want to challenge this question." },
];

describe("POST /api/ai-tutor/continue", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) {
			if (typeof mock.mockReset === "function") mock.mockReset();
		}
		mocks.connection.mockResolvedValue(undefined);
		mocks.getMessages.mockReturnValue(fakeHistory);
		mocks.messagesToParams.mockReturnValue(fakeParams);
		mocks.runAgentLoop.mockResolvedValue("assistant response");
	});

	it("returns 400 for unparseable JSON", async () => {
		const { POST } = await loadSubject();
		const req = new Request("http://localhost/api/ai-tutor/continue", {
			method: "POST",
			body: "not-json",
			headers: { "Content-Type": "application/json" },
		});
		const res = await POST(req);
		expect(res.status).toBe(400);
	});

	it("returns 400 when conversationId is missing", async () => {
		const { POST } = await loadSubject();
		const res = await POST(makeRequest({}));
		expect(res.status).toBe(400);
	});

	it("returns 400 when conversationId is not a number", async () => {
		const { POST } = await loadSubject();
		const res = await POST(makeRequest({ conversationId: "five" }));
		expect(res.status).toBe(400);
	});

	it("fetches the conversation history by id", async () => {
		const { POST } = await loadSubject();
		await POST(makeRequest({ conversationId: 5 }));
		await vi.waitFor(() => expect(mocks.getMessages).toHaveBeenCalledWith(5));
	});

	it("converts history to Anthropic message params", async () => {
		const { POST } = await loadSubject();
		await POST(makeRequest({ conversationId: 5 }));
		await vi.waitFor(() =>
			expect(mocks.messagesToParams).toHaveBeenCalledWith(fakeHistory),
		);
	});

	it("runs the agent loop with the converted params", async () => {
		const { POST } = await loadSubject();
		await POST(makeRequest({ conversationId: 5 }));
		await vi.waitFor(() =>
			expect(mocks.runAgentLoop).toHaveBeenCalledWith(
				fakeParams,
				expect.any(Function),
			),
		);
	});

	it("persists the assistant response after the loop completes", async () => {
		mocks.runAgentLoop.mockResolvedValue("full response text");
		const { POST } = await loadSubject();
		await POST(makeRequest({ conversationId: 5 }));
		await vi.waitFor(() =>
			expect(mocks.addMessage).toHaveBeenCalledWith(
				5,
				"assistant",
				"full response text",
			),
		);
	});

	it("streams text deltas as SSE events", async () => {
		mocks.runAgentLoop.mockImplementation(
			async (_msgs: unknown, onText: (d: string) => void) => {
				onText("hello ");
				onText("world");
				return "hello world";
			},
		);
		const { POST } = await loadSubject();
		const res = await POST(makeRequest({ conversationId: 5 }));
		const body = await readBody(res);
		expect(body).toContain(
			`data: ${JSON.stringify({ type: "text", delta: "hello " })}`,
		);
		expect(body).toContain(
			`data: ${JSON.stringify({ type: "text", delta: "world" })}`,
		);
	});

	it("sends the [DONE] sentinel after the stream completes", async () => {
		const { POST } = await loadSubject();
		const res = await POST(makeRequest({ conversationId: 5 }));
		const body = await readBody(res);
		expect(body).toContain("data: [DONE]");
	});

	it("streams an error SSE event when the agent loop throws", async () => {
		mocks.runAgentLoop.mockRejectedValue(new Error("Agent loop failed"));
		const { POST } = await loadSubject();
		const res = await POST(makeRequest({ conversationId: 5 }));
		const body = await readBody(res);
		const errorLine = body
			.split("\n")
			.filter((l) => l.startsWith("data: "))
			.map((l) => l.slice(6).trim())
			.find((p) => {
				try {
					return JSON.parse(p).type === "error";
				} catch {
					return false;
				}
			});
		expect(errorLine).toBeDefined();
		expect(JSON.parse(errorLine as string).message).toMatch(
			/Agent loop failed/,
		);
	});

	it("returns a response with text/event-stream content type", async () => {
		const { POST } = await loadSubject();
		const res = await POST(makeRequest({ conversationId: 5 }));
		expect(res.headers.get("Content-Type")).toBe("text/event-stream");
	});

	it("does not persist any user message (the message is already in the DB)", async () => {
		const { POST } = await loadSubject();
		await POST(makeRequest({ conversationId: 5 }));
		await vi.waitFor(() => expect(mocks.addMessage).toHaveBeenCalledOnce());
		// Only the assistant message is persisted — no second call for user
		expect(mocks.addMessage.mock.calls[0][1]).toBe("assistant");
	});
});
