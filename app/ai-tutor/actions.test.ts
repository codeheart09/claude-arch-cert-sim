import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createConversation: vi.fn(),
	removeConversation: vi.fn(),
	getMessages: vi.fn(),
	refresh: vi.fn(),
}));

vi.mock("@/lib/conversations", () => ({
	createConversation: mocks.createConversation,
	removeConversation: mocks.removeConversation,
	getMessages: mocks.getMessages,
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
