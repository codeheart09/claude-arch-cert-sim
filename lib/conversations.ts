import {
	deleteConversation,
	getConversationById,
	getConversations,
	getMessagesByConversationId,
	insertConversation,
	insertMessage,
	updateConversationTitle,
} from "../db/conversations";
import type {
	AiConversation,
	AiConversationMessage,
	AiConversationRole,
} from "../db/schema";

export type { AiConversation, AiConversationMessage, AiConversationRole };

export function listConversations(): AiConversation[] {
	return getConversations();
}

export function findConversation(id: number): AiConversation | undefined {
	return getConversationById(id);
}

export function createConversation(title?: string): AiConversation {
	return insertConversation(title);
}

export function removeConversation(id: number): void {
	deleteConversation(id);
}

export function addMessage(
	conversationId: number,
	role: AiConversationRole,
	content: string,
): AiConversationMessage {
	return insertMessage({ conversationId, role, content });
}

export function getMessages(conversationId: number): AiConversationMessage[] {
	return getMessagesByConversationId(conversationId);
}

export function setConversationTitle(id: number, title: string): void {
	updateConversationTitle(id, title);
}
