"use server";

import { refresh } from "next/cache";
import type { AiConversationMessage } from "@/lib/conversations";
import {
	addMessage,
	createConversation,
	getMessages,
	removeConversation,
} from "@/lib/conversations";
import type { Alternative } from "@/lib/practice";
import { getFullQuestion } from "@/lib/questions";

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

export async function challengeQuestion(questionId: number): Promise<number> {
	const question = getFullQuestion(questionId);
	if (!question) throw new Error(`Question ${questionId} not found.`);

	const alternatives = JSON.parse(question.alternatives) as Partial<
		Record<Alternative, string>
	>;
	const insights = JSON.parse(question.insights) as Partial<
		Record<Alternative, string>
	>;

	const altLines = Object.entries(alternatives)
		.map(([l, t]) => `${l.toUpperCase()}) ${t}`)
		.join("\n");
	const insightLines = Object.entries(insights)
		.map(([l, t]) => `${l.toUpperCase()}) ${t}`)
		.join("\n");

	const userMessage = [
		"I want to challenge this question. It doesn't seem correct/accurate for me. Check the exam guide scope, instructions and constraints and evaluate it.",
		"",
		"---",
		"",
		`**Question ID:** ${question.id}`,
		`**Domain:** ${question.domain ?? "unset"}`,
		`**Scenario:** ${question.scenario ?? "unset"}`,
		`**Difficulty:** ${question.difficulty}`,
		`**Source:** ${question.source}`,
		"",
		"**Question:**",
		question.question,
		"",
		"**Alternatives:**",
		altLines,
		"",
		`**Correct answer:** ${question.correctAlternative.toUpperCase()}`,
		"",
		"**Explanations per alternative:**",
		insightLines,
	].join("\n");

	const titleSnippet = question.question.slice(0, 55).trim();
	const conv = createConversation(`Challenge: ${titleSnippet}`);
	addMessage(conv.id, "user", userMessage);
	refresh();

	return conv.id;
}
