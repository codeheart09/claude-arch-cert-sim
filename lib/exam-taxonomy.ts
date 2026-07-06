/**
 * Exam taxonomy — the bridge between our enum slugs and the exam guide's own
 * vocabulary (db/corpus/exam-guide.md), plus the rules for pairing domains with
 * scenarios.
 *
 * Two jobs:
 *   1. Map slugs to the headings/titles the guide uses, so the generation agent
 *      can pull the right RAG grounding (the KB `domain` column stores the full
 *      "Domain N: …" heading — see lib/corpus.ts extractTags).
 *   2. Constrain which (domain, scenario) combinations are valid. The guide lists
 *      "Primary domains" per scenario; we only generate questions for those pairs
 *      so the content stays coherent and exam-aligned.
 */
import {
	DIFFICULTY_ENUM,
	type Difficulty,
	type Domain,
	type Scenario,
} from "../db/schema";

/** Total questions in a full certification exam. */
export const EXAM_QUESTION_COUNT = 60;

/** Total questions in a single-domain checkpoint session. */
export const DOMAIN_CHECKPOINT_COUNT = 20;

/** Slug → the exact "Domain N: …" heading used in the exam guide / KB `domain` column. */
export const DOMAIN_HEADINGS: Record<Domain, string> = {
	"agentic-architecture": "Domain 1: Agentic Architecture & Orchestration",
	"tool-design-mcp": "Domain 2: Tool Design & MCP Integration",
	"claude-code-config": "Domain 3: Claude Code Configuration & Workflows",
	"prompt-engineering": "Domain 4: Prompt Engineering & Structured Output",
	"context-reliability": "Domain 5: Context Management & Reliability",
};

/** Slug → the scenario title used in the exam guide's "Exam Scenarios" section. */
export const SCENARIO_TITLES: Record<Scenario, string> = {
	"customer-support-agent": "Customer Support Resolution Agent",
	"code-generation": "Code Generation with Claude Code",
	"multi-agent-research": "Multi-Agent Research System",
	"developer-productivity": "Developer Productivity with Claude",
	"ci-cd-integration": "Claude Code for Continuous Integration",
	"structured-data-extraction": "Structured Data Extraction",
};

/**
 * The "Primary domains" each scenario is tagged with in the exam guide. A
 * question is only generated for a (scenario, domain) pair listed here, keeping
 * generated content aligned with how the real exam pairs them.
 */
export const SCENARIO_PRIMARY_DOMAINS: Record<Scenario, Domain[]> = {
	"customer-support-agent": [
		"agentic-architecture",
		"tool-design-mcp",
		"context-reliability",
	],
	"code-generation": ["claude-code-config", "context-reliability"],
	"multi-agent-research": [
		"agentic-architecture",
		"tool-design-mcp",
		"context-reliability",
	],
	"developer-productivity": [
		"tool-design-mcp",
		"claude-code-config",
		"agentic-architecture",
	],
	"ci-cd-integration": ["claude-code-config", "prompt-engineering"],
	"structured-data-extraction": ["prompt-engineering", "context-reliability"],
};

/** One generation target: a valid domain/scenario pair plus a difficulty to aim for. */
export interface QuestionCombo {
	domain: Domain;
	scenario: Scenario;
	difficulty: Difficulty;
}

/** Every valid (scenario, domain) pair, in a stable order. */
export function validPairs(): { domain: Domain; scenario: Scenario }[] {
	const pairs: { domain: Domain; scenario: Scenario }[] = [];
	for (const scenario of Object.keys(SCENARIO_PRIMARY_DOMAINS) as Scenario[]) {
		for (const domain of SCENARIO_PRIMARY_DOMAINS[scenario]) {
			pairs.push({ domain, scenario });
		}
	}
	return pairs;
}

/**
 * Builds `count` generation targets. Shuffles the valid pairs so each run
 * visits them in a different order, and picks a random difficulty per combo so
 * the bank accumulates a balanced distribution across runs rather than always
 * starting at easy. With `count <= validPairs().length` every combo is a
 * distinct pair; beyond that, pairs repeat with freshly randomised difficulties.
 */
export function buildCombos(count: number): QuestionCombo[] {
	const pairs = shuffle(validPairs());
	const combos: QuestionCombo[] = [];
	for (let i = 0; i < count; i++) {
		const pair = pairs[i % pairs.length];
		const difficulty =
			DIFFICULTY_ENUM[Math.floor(Math.random() * DIFFICULTY_ENUM.length)];
		combos.push({ ...pair, difficulty });
	}
	return combos;
}

/** Fisher-Yates shuffle — returns a new array, does not mutate the input. */
function shuffle<T>(arr: T[]): T[] {
	const out = [...arr];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}
