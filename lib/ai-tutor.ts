import type Anthropic from "@anthropic-ai/sdk";
import { DOMAIN_ENUM } from "../db/schema";
import { getAnalyticsData } from "./analytics";
import { getAnthropic, getDefaultModel } from "./anthropic";
import type { AiConversationMessage } from "./conversations";
import { retrieveGrounding } from "./knowledge-base";
import { deleteQuestion } from "./questions";

const SYSTEM_PROMPT = `You are an expert AI tutor for engineers preparing for the Claude Certified Architect – Foundations certification exam. Your purpose is to help users achieve outstanding exam scores through targeted coaching, gap analysis, and clear concept instruction.

## Your expertise covers all five exam domains

- **Agentic Architecture & Orchestration** — multi-agent systems, subagent coordination, orchestration patterns, error handling and retry in agentic pipelines, human-in-the-loop checkpoints
- **Tool Design & MCP** — Model Context Protocol, tool schema design, safe tool invocation, capability boundaries, tool result handling, error propagation
- **Claude Code & Configuration** — Claude Code CLI, IDE integrations, hooks, slash commands, CLAUDE.md, project and user-level settings, memory management
- **Prompt Engineering** — prompt structure, instruction clarity, few-shot examples, chain-of-thought, XML tagging, evaluation methods, avoiding common failure modes
- **Context & Reliability** — context window management, RAG pipeline design, retrieval strategies, long-document handling, faithfulness, caching, context poisoning prevention

You also understand six real-world exam scenarios: Customer Support Agent, Code Generation, Multi-Agent Research, Developer Productivity, CI/CD Integration, and Structured Data Extraction.

## Available tools

- **search_knowledge_base** — Searches the authoritative exam guide and study corpus. Call this before explaining any concept or domain topic to ensure your answer is grounded in exam-specific material.
- **get_analytics** — Retrieves the user's real performance data: accuracy by domain/scenario, exam pass count, answer trends over time. Call this when the user asks about their progress, weak areas, or what to study.

## Coaching philosophy

1. **Diagnose before prescribing.** When a user asks "what should I study?", call get_analytics first, identify the weakest domain/scenario pair, then search_knowledge_base to surface the relevant content.
2. **Ground in authoritative material.** Always retrieve from search_knowledge_base before explaining a concept — never rely solely on training data when exam-specific material is available.
3. **Be specific.** Reference exact domain slugs and scenario names. Avoid vague study advice.
4. **Explain reasoning, not just answers.** For exam question walkthroughs, explain why each distractor is wrong and why the correct answer is right.
5. **Progressive difficulty.** When a domain is weak, start with fundamentals. When it's strong, push to edge cases and nuanced trade-offs.
6. **Keep responses scannable.** Use bullet points, short paragraphs, bold headings, and code blocks for API shapes or config examples.
7. **Be honest.** If a score needs significant improvement, say so — then give a concrete plan.
8. **Exam strategy.** Help users understand not just content but how to reason through exam questions under time pressure.

Never fabricate scores, question content, or exam guide material. If a search returns nothing relevant, say so and offer to try a different query.

## Challenging a question

When a conversation starts with a full question record and a challenge request, you must:
1. Search the knowledge base (\`search_knowledge_base\`) using the question text and domain to verify whether the question and its stated correct answer are accurate per the exam guide.
2. Present your findings and a clear verdict: is the question accurate, inaccurate, or ambiguous?
3. If you conclude the question should be removed, state this clearly — then ask the user explicitly: "Would you like me to delete this question from the question bank? Please reply with 'yes' to confirm."
4. Only call \`delete_question\` after the user has given an unambiguous confirmation. Never call it preemptively or without a clear 'yes'.`;

// ─── Tool definitions ─────────────────────────────────────────────────────────

const SEARCH_KNOWLEDGE_BASE_TOOL: Anthropic.Tool = {
	name: "search_knowledge_base",
	description:
		"Search the exam knowledge base (exam guide, domain blueprints, study material) for content relevant to a topic, concept, or domain. Use this before explaining any exam concept to ground your answer in authoritative material.",
	input_schema: {
		type: "object" as const,
		properties: {
			query: {
				type: "string",
				description:
					"The topic, concept, or question to look up — e.g. 'tool result error handling', 'agentic loop orchestration patterns', 'CLAUDE.md project memory'.",
			},
			domain: {
				type: "string",
				description:
					"Optional: restrict results to a specific exam domain slug.",
				enum: [...DOMAIN_ENUM],
			},
			limit: {
				type: "number",
				description: "Number of chunks to return (default 5, max 10).",
			},
		},
		required: ["query"],
		additionalProperties: false,
	},
};

const GET_ANALYTICS_TOOL: Anthropic.Tool = {
	name: "get_analytics",
	description:
		"Retrieve the user's exam performance analytics: overall accuracy, correctness by domain and scenario, exam pass count, and answer trends. Call this when the user asks about their progress, weak areas, or what to focus on — do not ask the user to tell you their scores when you can read them directly.",
	input_schema: {
		type: "object" as const,
		properties: {
			period: {
				type: "string",
				enum: ["1d", "7d", "30d", "60q", "300q", "all"],
				description:
					"Time or count window to analyse. '1d'=last 24h, '7d'=last 7 days, '30d'=last 30 days, '60q'=last 60 answers, '300q'=last 300 answers, 'all'=entire history (default).",
			},
		},
		required: [],
		additionalProperties: false,
	},
};

const DELETE_QUESTION_TOOL: Anthropic.Tool = {
	name: "delete_question",
	description:
		"Soft-delete a question from the question bank. IMPORTANT: You MUST evaluate the question's accuracy using search_knowledge_base first, clearly state your verdict, and ask the user for explicit confirmation ('yes') BEFORE calling this tool. Never call it without unambiguous consent from the user.",
	input_schema: {
		type: "object" as const,
		properties: {
			question_id: {
				type: "number",
				description: "The numeric ID of the question to soft-delete.",
			},
			reason: {
				type: "string",
				description: "Brief explanation of why the question is being removed.",
			},
		},
		required: ["question_id", "reason"],
		additionalProperties: false,
	},
};

export const AI_TUTOR_TOOLS: Anthropic.Tool[] = [
	SEARCH_KNOWLEDGE_BASE_TOOL,
	GET_ANALYTICS_TOOL,
	DELETE_QUESTION_TOOL,
];

// ─── Tool executors ───────────────────────────────────────────────────────────

interface SearchInput {
	query: string;
	domain?: string;
	limit?: number;
}

function isSearchInput(v: unknown): v is SearchInput {
	return (
		typeof v === "object" &&
		v !== null &&
		"query" in v &&
		typeof (v as Record<string, unknown>).query === "string"
	);
}

interface AnalyticsInput {
	period?: string;
}

function isAnalyticsInput(v: unknown): v is AnalyticsInput {
	return typeof v === "object" && v !== null;
}

async function executeSearchKnowledgeBase(input: unknown): Promise<string> {
	if (!isSearchInput(input)) {
		return JSON.stringify({ error: "Invalid tool input: query is required." });
	}
	const limit = Math.min(input.limit ?? 5, 10);
	const chunks = await retrieveGrounding(input.query, {
		domain: input.domain,
		limit,
	});
	if (chunks.length === 0) {
		return JSON.stringify({
			result: "No relevant content found for this query.",
		});
	}
	return JSON.stringify({
		chunks: chunks.map((c) => ({
			heading: c.heading,
			domain: c.domain,
			text: c.text,
		})),
	});
}

function executeGetAnalytics(input: unknown): string {
	if (!isAnalyticsInput(input)) {
		return JSON.stringify({ error: "Invalid tool input." });
	}
	const validPeriods = ["1d", "7d", "30d", "60q", "300q", "all"] as const;
	type Period = (typeof validPeriods)[number];
	const period: Period = validPeriods.includes(input.period as Period)
		? (input.period as Period)
		: "all";
	try {
		const data = getAnalyticsData(period);
		return JSON.stringify(data);
	} catch {
		return JSON.stringify({ error: "Could not retrieve analytics data." });
	}
}

interface DeleteQuestionInput {
	question_id: number;
	reason: string;
}

function isDeleteQuestionInput(v: unknown): v is DeleteQuestionInput {
	return (
		typeof v === "object" &&
		v !== null &&
		typeof (v as Record<string, unknown>).question_id === "number" &&
		typeof (v as Record<string, unknown>).reason === "string"
	);
}

function executeDeleteQuestion(input: unknown): string {
	if (!isDeleteQuestionInput(input)) {
		return JSON.stringify({
			error: "Invalid tool input: question_id and reason are required.",
		});
	}
	try {
		deleteQuestion(input.question_id);
		return JSON.stringify({
			success: true,
			message: `Question ${input.question_id} has been removed from the question bank.`,
		});
	} catch (err) {
		return JSON.stringify({
			error: err instanceof Error ? err.message : "Could not delete question.",
		});
	}
}

// ─── Message history reconstruction ──────────────────────────────────────────

export function messagesToParams(
	messages: AiConversationMessage[],
): Anthropic.MessageParam[] {
	return messages.map((m) => ({
		role: m.role as "user" | "assistant",
		content: m.content,
	}));
}

// ─── Agentic streaming loop ───────────────────────────────────────────────────

export type OnTextCallback = (delta: string) => void;

/**
 * Runs the agentic loop for one user turn.
 *
 * Streams text deltas via onText, handles tool_use transparently (tool calls
 * are never surfaced to the caller), and resolves with the complete assistant
 * text for persistence. Recurses when Claude returns tool_use stop reason.
 */
export async function runAgentLoop(
	messages: Anthropic.MessageParam[],
	onText: OnTextCallback,
	accumulated = "",
): Promise<string> {
	const client = getAnthropic();

	// client.messages.stream() returns a MessageStream that emits high-level
	// events. We use .on('text', ...) for streaming deltas and .finalMessage()
	// for the complete content array (including tool_use blocks).
	const stream = client.messages.stream({
		model: getDefaultModel(),
		max_tokens: 4096,
		system: SYSTEM_PROMPT,
		tools: AI_TUTOR_TOOLS,
		messages,
	});

	stream.on("text", (textDelta) => {
		accumulated += textDelta;
		onText(textDelta);
	});

	const finalMessage = await stream.finalMessage();

	if (finalMessage.stop_reason !== "tool_use") {
		return accumulated;
	}

	// Execute all tool calls concurrently
	const toolUseBlocks = finalMessage.content.filter(
		(b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
	);

	const toolResults = await Promise.all(
		toolUseBlocks.map(async (block) => {
			let content: string;
			try {
				if (block.name === "search_knowledge_base") {
					content = await executeSearchKnowledgeBase(block.input);
				} else if (block.name === "get_analytics") {
					content = executeGetAnalytics(block.input);
				} else if (block.name === "delete_question") {
					content = executeDeleteQuestion(block.input);
				} else {
					content = JSON.stringify({ error: `Unknown tool: ${block.name}` });
				}
			} catch (err) {
				content = JSON.stringify({
					error: err instanceof Error ? err.message : "Tool execution failed.",
				});
			}
			const result: Anthropic.ToolResultBlockParam = {
				type: "tool_result",
				tool_use_id: block.id,
				content,
			};
			return result;
		}),
	);

	const newMessages: Anthropic.MessageParam[] = [
		...messages,
		{ role: "assistant", content: finalMessage.content },
		{ role: "user", content: toolResults },
	];

	return runAgentLoop(newMessages, onText, accumulated);
}
