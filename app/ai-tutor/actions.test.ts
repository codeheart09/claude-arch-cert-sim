import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createConversation: vi.fn(),
	removeConversation: vi.fn(),
	getMessages: vi.fn(),
	addMessage: vi.fn(),
	getFullQuestion: vi.fn(),
	refresh: vi.fn(),
}));

vi.mock("@/lib/conversations", () => ({
	createConversation: mocks.createConversation,
	removeConversation: mocks.removeConversation,
	getMessages: mocks.getMessages,
	addMessage: mocks.addMessage,
}));

vi.mock("@/lib/questions", () => ({
	getFullQuestion: mocks.getFullQuestion,
}));

vi.mock("next/cache", () => ({
	refresh: mocks.refresh,
}));

async function loadSubject() {
	return import("./actions");
}

const fakeConversation = {
	id: 7,
	title: undefined,
	createdAt: new Date(),
	updatedAt: new Date(),
};
const fakeMessages = [
	{
		id: 1,
		conversationId: 7,
		role: "user" as const,
		content: "Hello",
		createdAt: new Date(),
	},
];

describe("createNewConversation", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) mock.mockReset();
	});

	it("calls createConversation with no arguments", async () => {
		mocks.createConversation.mockReturnValue(fakeConversation);
		const { createNewConversation } = await loadSubject();
		await createNewConversation();
		expect(mocks.createConversation).toHaveBeenCalledWith();
	});

	it("returns the id of the created conversation", async () => {
		mocks.createConversation.mockReturnValue(fakeConversation);
		const { createNewConversation } = await loadSubject();
		expect(await createNewConversation()).toBe(7);
	});

	it("calls refresh after creating the conversation", async () => {
		mocks.createConversation.mockReturnValue(fakeConversation);
		const { createNewConversation } = await loadSubject();
		await createNewConversation();
		expect(mocks.refresh).toHaveBeenCalledOnce();
	});
});

describe("deleteConversation", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) mock.mockReset();
	});

	it("calls removeConversation with the given id", async () => {
		const { deleteConversation } = await loadSubject();
		await deleteConversation(7);
		expect(mocks.removeConversation).toHaveBeenCalledWith(7);
	});

	it("calls refresh after removing the conversation", async () => {
		const { deleteConversation } = await loadSubject();
		await deleteConversation(7);
		expect(mocks.refresh).toHaveBeenCalledOnce();
	});
});

describe("getConversationMessages", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) mock.mockReset();
	});

	it("calls getMessages with the given conversation id", async () => {
		mocks.getMessages.mockReturnValue(fakeMessages);
		const { getConversationMessages } = await loadSubject();
		await getConversationMessages(7);
		expect(mocks.getMessages).toHaveBeenCalledWith(7);
	});

	it("returns the messages from getMessages", async () => {
		mocks.getMessages.mockReturnValue(fakeMessages);
		const { getConversationMessages } = await loadSubject();
		expect(await getConversationMessages(7)).toBe(fakeMessages);
	});

	it("returns an empty array when there are no messages", async () => {
		mocks.getMessages.mockReturnValue([]);
		const { getConversationMessages } = await loadSubject();
		expect(await getConversationMessages(7)).toEqual([]);
	});
});

const fakeQuestion = {
	id: 42,
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
		a: "Wrong A",
		b: "Right B",
		c: "Wrong C",
		d: "Wrong D",
	}),
	contentHash: "abc123",
	source: "authored" as const,
	deleted: false,
	createdAt: new Date(),
};

const fakeConvForChallenge = {
	id: 99,
	title: "Challenge: Which approach best routes the agent's to",
	createdAt: new Date(),
	updatedAt: new Date(),
};

describe("challengeQuestion", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) mock.mockReset();
		mocks.createConversation.mockReturnValue(fakeConvForChallenge);
		mocks.getFullQuestion.mockReturnValue(fakeQuestion);
	});

	it("throws when the question is not found", async () => {
		mocks.getFullQuestion.mockReturnValue(undefined);
		const { challengeQuestion } = await loadSubject();
		await expect(challengeQuestion(999)).rejects.toThrow(/999/);
	});

	it("fetches the full question by id", async () => {
		const { challengeQuestion } = await loadSubject();
		await challengeQuestion(42);
		expect(mocks.getFullQuestion).toHaveBeenCalledWith(42);
	});

	it("creates a conversation titled 'Challenge: <question snippet>'", async () => {
		const { challengeQuestion } = await loadSubject();
		await challengeQuestion(42);
		const titleArg: string = mocks.createConversation.mock.calls[0][0];
		expect(titleArg).toMatch(/^Challenge: /);
		expect(titleArg).toContain("Which approach best routes");
	});

	it("seeds the conversation with a user message containing the challenge prompt", async () => {
		const { challengeQuestion } = await loadSubject();
		await challengeQuestion(42);
		const [, role, content] = mocks.addMessage.mock.calls[0];
		expect(role).toBe("user");
		expect(content).toMatch(/I want to challenge this question/);
	});

	it("includes the question ID, domain, scenario, difficulty and source in the message", async () => {
		const { challengeQuestion } = await loadSubject();
		await challengeQuestion(42);
		const content: string = mocks.addMessage.mock.calls[0][2];
		expect(content).toContain("**Question ID:** 42");
		expect(content).toContain("**Domain:** tool-design-mcp");
		expect(content).toContain("**Scenario:** customer-support-agent");
		expect(content).toContain("**Difficulty:** medium");
		expect(content).toContain("**Source:** authored");
	});

	it("includes all alternatives formatted as 'LETTER) text' in the message", async () => {
		const { challengeQuestion } = await loadSubject();
		await challengeQuestion(42);
		const content: string = mocks.addMessage.mock.calls[0][2];
		expect(content).toContain("A) Option A");
		expect(content).toContain("B) Option B");
	});

	it("includes the correct answer uppercased in the message", async () => {
		const { challengeQuestion } = await loadSubject();
		await challengeQuestion(42);
		const content: string = mocks.addMessage.mock.calls[0][2];
		expect(content).toContain("**Correct answer:** B");
	});

	it("includes per-alternative explanations in the message", async () => {
		const { challengeQuestion } = await loadSubject();
		await challengeQuestion(42);
		const content: string = mocks.addMessage.mock.calls[0][2];
		expect(content).toContain("A) Wrong A");
		expect(content).toContain("B) Right B");
	});

	it("seeds the message on the newly created conversation id", async () => {
		const { challengeQuestion } = await loadSubject();
		await challengeQuestion(42);
		const convIdArg = mocks.addMessage.mock.calls[0][0];
		expect(convIdArg).toBe(99);
	});

	it("returns the new conversation id", async () => {
		const { challengeQuestion } = await loadSubject();
		expect(await challengeQuestion(42)).toBe(99);
	});

	it("calls refresh after creating the conversation", async () => {
		const { challengeQuestion } = await loadSubject();
		await challengeQuestion(42);
		expect(mocks.refresh).toHaveBeenCalledOnce();
	});
});
