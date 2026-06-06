/**
 * Question-generation agent.
 *
 * One agent session produces one new exam question for a given domain/scenario
 * combination. It is grounded in the exam guide via RAG, forced to emit a
 * schema-valid question through tool use, validated, and checked for
 * near-duplicates against the existing bank (vector search over `questions_vec`)
 * before being imported. A batch runner fans out N independent agents in
 * parallel — each its own isolated API conversation. See AGENTS.md / DATABASE.md.
 */
import { readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { getClient } from "../db/drizzle";
import {
	DUP_DISTANCE_THRESHOLD,
	findByDomainScenario,
	findNearestQuestions,
	importQuestion,
	type QuestionInput,
} from "../db/questions";
import {
	type Alternative,
	DIFFICULTY_ENUM,
	DOMAIN_ENUM,
	SCENARIO_ENUM,
} from "../db/schema";
import {
	getAnthropic,
	getDefaultConcurrency,
	getDefaultModel,
} from "./anthropic";
import { embedPassages } from "./embeddings";
import {
	buildCombos,
	DOMAIN_HEADINGS,
	type QuestionCombo,
	SCENARIO_TITLES,
} from "./exam-taxonomy";
import { type KnowledgeChunk, retrieveGrounding } from "./knowledge-base";

/** Standard exam questions use four options. Generated questions always use a–d. */
const ANSWER_KEYS: Alternative[] = ["a", "b", "c", "d"];
const QUESTIONS_FILE = "db/questions.json";
const MAX_OUTPUT_TOKENS = 2048;
const DEFAULT_MAX_RETRIES = 3;

// ─── Structured-output tool ─────────────────────────────────────────────────

/** Letter-keyed object schema shared by `alternatives` and `insights`. */
const LETTER_MAP_SCHEMA = {
	type: "object" as const,
	properties: {
		a: { type: "string" },
		b: { type: "string" },
		c: { type: "string" },
		d: { type: "string" },
	},
	required: ["a", "b", "c", "d"],
	additionalProperties: false,
};

/**
 * The single tool the agent must call. Forcing this tool (tool_choice) guarantees
 * schema-shaped output — the same Domain-4 technique the exam itself teaches.
 */
const EMIT_QUESTION_TOOL: Anthropic.Tool = {
	name: "emit_question",
	description:
		"Emit the finished exam question. Call this exactly once with the complete, self-contained question.",
	input_schema: {
		type: "object",
		properties: {
			question: {
				type: "string",
				description:
					"The full question stem: a concrete production situation followed by the decision to make.",
			},
			difficulty: { type: "string", enum: [...DIFFICULTY_ENUM] },
			domain: { type: "string", enum: [...DOMAIN_ENUM] },
			scenario: { type: "string", enum: [...SCENARIO_ENUM] },
			alternatives: {
				...LETTER_MAP_SCHEMA,
				description: "Exactly four answer options, keyed a–d.",
			},
			correct_alternative: {
				type: "string",
				enum: [...ANSWER_KEYS],
				description: "The letter of the single correct option.",
			},
			insights: {
				...LETTER_MAP_SCHEMA,
				description:
					"One explanation per option (a–d): why the correct one is right and why each distractor is wrong.",
			},
		},
		required: [
			"question",
			"difficulty",
			"domain",
			"scenario",
			"alternatives",
			"correct_alternative",
			"insights",
		],
	},
};

// ─── Validation ─────────────────────────────────────────────────────────────

function parseLetterMap(
	raw: unknown,
	field: string,
): Partial<Record<Alternative, string>> {
	if (typeof raw !== "object" || raw === null) {
		throw new Error(`\`${field}\` must be an object`);
	}
	const obj = raw as Record<string, unknown>;
	const out: Partial<Record<Alternative, string>> = {};
	for (const key of ANSWER_KEYS) {
		const value = obj[key];
		if (typeof value !== "string" || value.trim().length === 0) {
			throw new Error(`\`${field}.${key}\` must be a non-empty string`);
		}
		out[key] = value.trim();
	}
	for (const key of Object.keys(obj)) {
		if (!ANSWER_KEYS.includes(key as Alternative)) {
			throw new Error(
				`\`${field}\` has an unexpected key "${key}" (only a–d allowed)`,
			);
		}
	}
	return out;
}

/**
 * Narrows raw tool input to a valid `QuestionInput`, enforcing the requested
 * combo. Throws a human-readable error used as retry feedback. Exported for tests.
 */
export function parseQuestion(
	raw: unknown,
	combo: QuestionCombo,
): QuestionInput {
	if (typeof raw !== "object" || raw === null) {
		throw new Error("tool input was not an object");
	}
	const obj = raw as Record<string, unknown>;

	const question = obj.question;
	if (typeof question !== "string" || question.trim().length < 20) {
		throw new Error("`question` must be a substantial string");
	}
	if (obj.difficulty !== combo.difficulty) {
		throw new Error(`\`difficulty\` must be "${combo.difficulty}"`);
	}
	if (obj.domain !== combo.domain) {
		throw new Error(`\`domain\` must be "${combo.domain}"`);
	}
	if (obj.scenario !== combo.scenario) {
		throw new Error(`\`scenario\` must be "${combo.scenario}"`);
	}

	const alternatives = parseLetterMap(obj.alternatives, "alternatives");
	const insights = parseLetterMap(obj.insights, "insights");

	const correct = obj.correct_alternative;
	if (
		typeof correct !== "string" ||
		!ANSWER_KEYS.includes(correct as Alternative)
	) {
		throw new Error("`correct_alternative` must be one of a, b, c, d");
	}
	if (!(correct in alternatives)) {
		throw new Error("`correct_alternative` must reference an existing option");
	}

	return {
		question: question.trim(),
		difficulty: combo.difficulty,
		domain: combo.domain,
		scenario: combo.scenario,
		alternatives,
		correct_alternative: correct as Alternative,
		insights,
	};
}

// ─── Prompt assembly ────────────────────────────────────────────────────────

function formatGrounding(chunks: KnowledgeChunk[]): string {
	return chunks
		.map((chunk) => `### ${chunk.heading}\n${chunk.text}`)
		.join("\n\n");
}

function formatExemplar(question: QuestionInput): string {
	const alts = ANSWER_KEYS.map(
		(key) => `  ${key}) ${question.alternatives[key] ?? ""}`,
	).join("\n");
	const insights = ANSWER_KEYS.map(
		(key) => `  ${key}: ${question.insights[key] ?? ""}`,
	).join("\n");
	return [
		`Question: ${question.question}`,
		`Alternatives:\n${alts}`,
		`Correct: ${question.correct_alternative}`,
		`Insights:\n${insights}`,
	].join("\n");
}

/** Picks up to `count` authored questions from distinct domains as quality references. */
function selectExemplars(count = 3): QuestionInput[] {
	const all = JSON.parse(
		readFileSync(QUESTIONS_FILE, "utf8"),
	) as QuestionInput[];
	const seenDomains = new Set<string>();
	const picked: QuestionInput[] = [];
	for (const question of all) {
		const domainKey = question.domain ?? "_";
		if (seenDomains.has(domainKey)) continue;
		seenDomains.add(domainKey);
		picked.push(question);
		if (picked.length >= count) break;
	}
	return picked;
}

const SYSTEM_PROMPT = `You are an expert psychometric item-writer authoring questions for the Claude Certified Architect – Foundations certification. You write single-best-answer multiple-choice questions that test practical architectural judgment, not recall.

Follow this rubric for every question:

1. TARGET ONE POINT. Pick exactly one specific knowledge/skill point from the provided task-statement extracts and test that. Do not test trivia or anything outside the provided domain context.
2. GROUND IT IN THE SCENARIO. Frame the question as a realistic production decision inside the given scenario, with concrete specifics (tools, metrics, file paths, percentages) — like the exemplars.
3. EXACTLY FOUR OPTIONS (a–d), constructed deliberately as:
   - one ANTI-PATTERN the exam guide explicitly warns against;
   - one WRONG-PROBLEM option: a real, plausible technique applied to the wrong problem (it solves something, just not this);
   - one NEAR-MISS: almost correct but with a single small disqualifying deviation;
   - one CORRECT answer that is unambiguously best.
   Randomise which letter is correct — do NOT default to "a".
4. PLAUSIBLE DISTRACTORS. Every wrong option must be tempting to someone with incomplete knowledge. No obviously absurd or strawman options. Keep all four options similar in length and specificity so length doesn't leak the answer.
5. INSIGHTS. Provide one insight per option. For the correct option, state why it is right; for each distractor, name the specific misconception and why it fails. Match the depth and voice of the exemplar insights.
6. RESPECT DIFFICULTY. Hit the requested difficulty: easy = single clear concept; medium = requires comparing trade-offs; hard = subtle distinctions among several defensible-looking options.
7. SELF-CONTAINED & ORIGINAL. The stem must stand alone. Do not reuse or lightly reword any question in the avoid-list.

Return the result only by calling the emit_question tool.`;

interface PromptParts {
	combo: QuestionCombo;
	domainContext: KnowledgeChunk[];
	scenarioContext: KnowledgeChunk[];
	exemplars: QuestionInput[];
	avoid: { question: string }[];
}

function buildUserPrompt(parts: PromptParts): string {
	const { combo, domainContext, scenarioContext, exemplars, avoid } = parts;
	const sections: string[] = [];

	sections.push(
		`Write ONE new exam question with these exact attributes:\n- domain: ${combo.domain} (${DOMAIN_HEADINGS[combo.domain]})\n- scenario: ${combo.scenario} (${SCENARIO_TITLES[combo.scenario]})\n- difficulty: ${combo.difficulty}`,
	);

	sections.push(
		`SCENARIO CONTEXT (the production setting your question must inhabit):\n${formatGrounding(scenarioContext)}`,
	);

	sections.push(
		`DOMAIN CONTEXT — task-statement knowledge & skills to draw from. Target exactly ONE point below:\n${formatGrounding(domainContext)}`,
	);

	sections.push(
		`QUALITY EXEMPLARS (different domains — match this craft, do not copy the topics):\n\n${exemplars
			.map(formatExemplar)
			.join("\n\n---\n\n")}`,
	);

	if (avoid.length > 0) {
		sections.push(
			`AVOID — existing ${combo.scenario}/${combo.domain} questions. Do not duplicate or lightly reword these:\n${avoid
				.map((item, index) => `${index + 1}. ${item.question}`)
				.join("\n")}`,
		);
	}

	sections.push("Now call emit_question with your question.");
	return sections.join("\n\n");
}

// ─── Generation ─────────────────────────────────────────────────────────────

export type GenerationStatus = "created" | "duplicate" | "invalid" | "error";

export interface GenerateOptions {
	/** Override the model (defaults to ANTHROPIC_MODEL / claude-sonnet-4-6). */
	model?: string;
	/** Max retry rounds after the first attempt (default 3). */
	maxRetries?: number;
	/**
	 * Called with a human-readable message at each meaningful event (grounding,
	 * API call, retry, result). Defaults to no-op — wire it up in the CLI script
	 * to get real-time per-agent output during a parallel batch.
	 */
	log?: (message: string) => void;
}

export interface GenerationResult {
	combo: QuestionCombo;
	status: GenerationStatus;
	id?: number;
	question?: string;
	detail?: string;
	/** Wall-clock milliseconds from start to completion (including retries). */
	elapsedMs?: number;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function elapsed(startMs: number): string {
	return `${((Date.now() - startMs) / 1000).toFixed(1)}s`;
}

/**
 * Runs one isolated agent session: grounds, prompts, validates, dedups (retrying
 * with feedback), and imports a single question. Never throws — failures are
 * returned as a result so a batch can surface them per-combo.
 */
export async function generateQuestion(
	combo: QuestionCombo,
	options: GenerateOptions = {},
): Promise<GenerationResult> {
	const model = options.model ?? getDefaultModel();
	const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
	const log = options.log ?? ((): void => {});
	const client = getAnthropic();
	const db = getClient();
	const startMs = Date.now();

	log("retrieving RAG context…");
	let domainContext: KnowledgeChunk[];
	let scenarioContext: KnowledgeChunk[];
	try {
		[domainContext, scenarioContext] = await Promise.all([
			retrieveGrounding(
				`${SCENARIO_TITLES[combo.scenario]} — ${DOMAIN_HEADINGS[combo.domain]}`,
				{
					source: "exam-guide",
					domain: DOMAIN_HEADINGS[combo.domain],
					limit: 6,
				},
			),
			retrieveGrounding(SCENARIO_TITLES[combo.scenario], {
				source: "exam-guide",
				limit: 3,
			}),
		]);
	} catch (error) {
		const detail = `grounding failed: ${errorMessage(error)}`;
		log(`error — ${detail}`);
		return { combo, status: "error", detail, elapsedMs: Date.now() - startMs };
	}
	log(
		`context ready (${domainContext.length} domain chunks, ${scenarioContext.length} scenario chunks)`,
	);

	const exemplars = selectExemplars();
	const avoid = findByDomainScenario(db, combo.domain, combo.scenario);
	if (avoid.length > 0) {
		log(`avoid-list: ${avoid.length} existing question(s) for this pair`);
	}

	const messages: Anthropic.MessageParam[] = [
		{
			role: "user",
			content: buildUserPrompt({
				combo,
				domainContext,
				scenarioContext,
				exemplars,
				avoid,
			}),
		},
	];

	let lastStatus: GenerationStatus = "error";
	let lastDetail = "no attempts ran";

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		log(`attempt ${attempt + 1}/${maxRetries + 1} — calling ${model}…`);
		let response: Anthropic.Message;
		try {
			response = await client.messages.create({
				model,
				max_tokens: MAX_OUTPUT_TOKENS,
				system: SYSTEM_PROMPT,
				tools: [EMIT_QUESTION_TOOL],
				tool_choice: { type: "tool", name: EMIT_QUESTION_TOOL.name },
				messages,
			});
		} catch (error) {
			const detail = `API error: ${errorMessage(error)}`;
			log(`error — ${detail}`);
			return {
				combo,
				status: "error",
				detail,
				elapsedMs: Date.now() - startMs,
			};
		}
		log(
			`response received (stop_reason: ${response.stop_reason}, tokens: ${response.usage.input_tokens}in + ${response.usage.output_tokens}out)`,
		);

		const toolUse = response.content.find(
			(block): block is Anthropic.ToolUseBlock =>
				block.type === "tool_use" && block.name === EMIT_QUESTION_TOOL.name,
		);
		if (!toolUse) {
			const detail =
				"model did not call emit_question despite forced tool choice";
			log(`error — ${detail}`);
			return {
				combo,
				status: "error",
				detail,
				elapsedMs: Date.now() - startMs,
			};
		}

		// Validate shape.
		let input: QuestionInput;
		try {
			input = parseQuestion(toolUse.input, combo);
		} catch (error) {
			lastStatus = "invalid";
			lastDetail = errorMessage(error);
			log(`validation failed — ${lastDetail} → sending retry feedback`);
			// Include what was actually returned so the model can see exactly what
			// it got wrong, rather than guessing from a bare error message.
			const received = JSON.stringify(toolUse.input, null, 2);
			pushFeedback(
				messages,
				toolUse,
				`Validation error: ${lastDetail}\n\nYou returned:\n${received}\n\nThe \`alternatives\` and \`insights\` fields must each be a JSON object with exactly the string keys "a", "b", "c", "d" — not an array, not a string. Example:\n{"a": "First option text", "b": "Second option text", "c": "Third option text", "d": "Fourth option text"}\n\nFix the issue and call emit_question again.`,
			);
			continue;
		}
		log("validated ✓ — checking dedup…");

		// Dedup against the existing bank.
		const [vector] = await embedPassages([input.question]);
		const nearest = findNearestQuestions(db, vector, 1)[0];
		if (nearest && nearest.distance < DUP_DISTANCE_THRESHOLD) {
			lastStatus = "duplicate";
			lastDetail = `too similar (distance ${nearest.distance.toFixed(3)}) to: "${nearest.question.slice(0, 80)}…"`;
			log(
				`dedup hit (distance ${nearest.distance.toFixed(3)}) → sending retry feedback`,
			);
			pushFeedback(
				messages,
				toolUse,
				`This duplicates an existing question (distance ${nearest.distance.toFixed(
					3,
				)}): "${nearest.question}". Write a materially different question testing a different point, then call emit_question.`,
			);
			continue;
		}

		const result = importQuestion(db, input, vector, "generated");
		if (!result.wasInserted) {
			log(`duplicate — exact hash already in bank`);
			return {
				combo,
				status: "duplicate",
				id: result.rowid,
				question: input.question,
				detail: "exact content-hash duplicate already in bank",
				elapsedMs: Date.now() - startMs,
			};
		}
		const ms = Date.now() - startMs;
		log(`created #${result.rowid} in ${elapsed(startMs)}`);
		return {
			combo,
			status: "created",
			id: result.rowid,
			question: input.question,
			elapsedMs: ms,
		};
	}

	log(`gave up after ${maxRetries + 1} attempt(s): ${lastDetail}`);
	return {
		combo,
		status: lastStatus,
		detail: `gave up after retries: ${lastDetail}`,
		elapsedMs: Date.now() - startMs,
	};
}

/** Appends the assistant tool_use turn and a user tool_result carrying retry feedback. */
function pushFeedback(
	messages: Anthropic.MessageParam[],
	toolUse: Anthropic.ToolUseBlock,
	feedback: string,
): void {
	messages.push({
		role: "assistant",
		content: [
			{
				type: "tool_use",
				id: toolUse.id,
				name: toolUse.name,
				input: toolUse.input,
			},
		],
	});
	messages.push({
		role: "user",
		content: [
			{
				type: "tool_result",
				tool_use_id: toolUse.id,
				content: feedback,
				is_error: true,
			},
		],
	});
}

// ─── Batch runner ───────────────────────────────────────────────────────────

export interface BatchSummary {
	created: number;
	duplicates: number;
	failed: number;
	results: GenerationResult[];
}

/**
 * Fans out `count` agents in parallel — one per distinct domain/scenario combo,
 * each its own isolated API conversation. Defaults to QUESTION_GEN_CONCURRENCY.
 *
 * Pass `options.log` to get live per-agent output as events fire. The batch
 * runner creates a prefixed log for each combo so parallel lines are readable.
 * If the caller supplies its own log function it is called as-is (the caller
 * owns the prefix).
 */
export async function generateQuestionBatch(
	count: number = getDefaultConcurrency(),
	options: GenerateOptions = {},
): Promise<BatchSummary> {
	const combos = buildCombos(count);
	const results = await Promise.all(
		combos.map((combo) => {
			const comboLabel = `${combo.scenario}/${combo.domain}/${combo.difficulty}`;
			const log = options.log
				? (msg: string): void =>
						(options.log as (m: string) => void)(`[${comboLabel}] ${msg}`)
				: undefined;
			return generateQuestion(combo, { ...options, log });
		}),
	);
	return {
		created: results.filter((r) => r.status === "created").length,
		duplicates: results.filter((r) => r.status === "duplicate").length,
		failed: results.filter(
			(r) => r.status === "invalid" || r.status === "error",
		).length,
		results,
	};
}
