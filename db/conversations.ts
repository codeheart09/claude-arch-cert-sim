import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./drizzle";
import {
	type AiConversation,
	type AiConversationMessage,
	aiConversationMessages,
	aiConversations,
	type NewAiConversationMessage,
} from "./schema";

export function insertConversation(title?: string): AiConversation {
	const db = getDb();
	const [row] = db
		.insert(aiConversations)
		.values({ title: title ?? "New conversation" })
		.returning()
		.all();
	return row;
}

export function getConversations(): AiConversation[] {
	return getDb()
		.select()
		.from(aiConversations)
		.orderBy(desc(aiConversations.updatedAt))
		.all();
}

export function getConversationById(id: number): AiConversation | undefined {
	return getDb()
		.select()
		.from(aiConversations)
		.where(eq(aiConversations.id, id))
		.get();
}

export function deleteConversation(id: number): void {
	getDb().delete(aiConversations).where(eq(aiConversations.id, id)).run();
}

export function insertMessage(
	input: NewAiConversationMessage,
): AiConversationMessage {
	const db = getDb();
	const [row] = db
		.insert(aiConversationMessages)
		.values(input)
		.returning()
		.all();
	touchConversation(input.conversationId);
	return row;
}

export function getMessagesByConversationId(
	conversationId: number,
): AiConversationMessage[] {
	return getDb()
		.select()
		.from(aiConversationMessages)
		.where(eq(aiConversationMessages.conversationId, conversationId))
		.orderBy(asc(aiConversationMessages.createdAt))
		.all();
}

export function updateConversationTitle(id: number, title: string): void {
	getDb()
		.update(aiConversations)
		.set({ title, updatedAt: sql`(unixepoch())` })
		.where(eq(aiConversations.id, id))
		.run();
}

export function touchConversation(id: number): void {
	getDb()
		.update(aiConversations)
		.set({ updatedAt: sql`(unixepoch())` })
		.where(eq(aiConversations.id, id))
		.run();
}
