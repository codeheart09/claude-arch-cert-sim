"use server";

import { refresh } from "next/cache";
import type { AiConversationMessage } from "@/lib/conversations";
import {
	createConversation,
	getMessages,
	removeConversation,
} from "@/lib/conversations";

export async function createNewConversation(): Promise<number> {
	const conv = createConversation();
	refresh();
	return conv.id;
}

export async function deleteConversation(id: number): Promise<void> {
	removeConversation(id);
	refresh();
}

export async function getConversationMessages(
	id: number,
): Promise<AiConversationMessage[]> {
	return getMessages(id);
}
