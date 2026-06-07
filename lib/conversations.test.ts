import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getConversations: vi.fn(),
	getConversationById: vi.fn(),
	insertConversation: vi.fn(),
	deleteConversation: vi.fn(),
	insertMessage: vi.fn(),
	getMessagesByConversationId: vi.fn(),
	updateConversationTitle: vi.fn(),
}));

vi.mock("../db/conversations", () => ({
	getConversations: mocks.getConversations,
	getConversationById: mocks.getConversationById,
	insertConversation: mocks.insertConversation,
	deleteConversation: mocks.deleteConversation,
	insertMessage: mocks.insertMessage,
	getMessagesByConversationId: mocks.getMessagesByConversationId,
	updateConversationTitle: mocks.updateConversationTitle,
}));

async function loadSubject() {
	return import("./conversations");
}

const fakeConversation = {
	id: 1,
	title: "Test",
	createdAt: new Date(),
	updatedAt: new Date(),
};
const fakeMessage = {
	id: 10,
	conversationId: 1,
	role: "user" as const,
	content: "hi",
	createdAt: new Date(),
};

describe("conversations lib", () => {
	beforeEach(() => {
		vi.resetModules();
		for (const mock of Object.values(mocks)) mock.mockReset();
	});

	it("listConversations delegates to getConversations and returns its value", async () => {
		mocks.getConversations.mockReturnValue([fakeConversation]);
		const { listConversations } = await loadSubject();
		expect(listConversations()).toEqual([fakeConversation]);
		expect(mocks.getConversations).toHaveBeenCalledOnce();
	});

	it("findConversation delegates to getConversationById with the given id", async () => {
		mocks.getConversationById.mockReturnValue(fakeConversation);
		const { findConversation } = await loadSubject();
		expect(findConversation(1)).toBe(fakeConversation);
		expect(mocks.getConversationById).toHaveBeenCalledWith(1);
	});

	it("findConversation returns undefined when the conversation does not exist", async () => {
		mocks.getConversationById.mockReturnValue(undefined);
		const { findConversation } = await loadSubject();
		expect(findConversation(99)).toBeUndefined();
	});

	it("createConversation delegates to insertConversation with the optional title", async () => {
		mocks.insertConversation.mockReturnValue(fakeConversation);
		const { createConversation } = await loadSubject();
		expect(createConversation("My Chat")).toBe(fakeConversation);
		expect(mocks.insertConversation).toHaveBeenCalledWith("My Chat");
	});

	it("createConversation passes undefined title when none is given", async () => {
		mocks.insertConversation.mockReturnValue(fakeConversation);
		const { createConversation } = await loadSubject();
		createConversation();
		expect(mocks.insertConversation).toHaveBeenCalledWith(undefined);
	});

	it("removeConversation delegates to deleteConversation with the given id", async () => {
		const { removeConversation } = await loadSubject();
		removeConversation(1);
		expect(mocks.deleteConversation).toHaveBeenCalledWith(1);
	});

	it("addMessage delegates to insertMessage with the correct payload", async () => {
		mocks.insertMessage.mockReturnValue(fakeMessage);
		const { addMessage } = await loadSubject();
		const result = addMessage(1, "user", "hello");
		expect(result).toBe(fakeMessage);
		expect(mocks.insertMessage).toHaveBeenCalledWith({
			conversationId: 1,
			role: "user",
			content: "hello",
		});
	});

	it("getMessages delegates to getMessagesByConversationId with the given id", async () => {
		mocks.getMessagesByConversationId.mockReturnValue([fakeMessage]);
		const { getMessages } = await loadSubject();
		expect(getMessages(1)).toEqual([fakeMessage]);
		expect(mocks.getMessagesByConversationId).toHaveBeenCalledWith(1);
	});

	it("setConversationTitle delegates to updateConversationTitle with id and title", async () => {
		const { setConversationTitle } = await loadSubject();
		setConversationTitle(1, "New Title");
		expect(mocks.updateConversationTitle).toHaveBeenCalledWith(1, "New Title");
	});
});
