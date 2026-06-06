/**
 * Anthropic API client + generation-agent configuration.
 *
 * The question-generation agent (lib/question-generator.ts) is the only consumer
 * today. Config is read from the environment so the same code works from the CLI
 * runner and, later, from app/server code. See .env.example.
 */
import Anthropic from "@anthropic-ai/sdk";

/** Sensible default when ANTHROPIC_MODEL is unset. */
const DEFAULT_MODEL = "claude-sonnet-4-6";
/** Number of generation agents to run in parallel when not overridden. */
const DEFAULT_CONCURRENCY = 5;

let client: Anthropic | null = null;

/**
 * Returns a singleton Anthropic client. Throws a clear error if the API key is
 * missing rather than failing deep inside an API call.
 */
export function getAnthropic(): Anthropic {
	if (!client) {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if (!apiKey) {
			throw new Error(
				"ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and add your key.",
			);
		}
		client = new Anthropic({ apiKey });
	}
	return client;
}

/** The model the agent should use: ANTHROPIC_MODEL or the default. */
export function getDefaultModel(): string {
	return process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
}

/** Default batch parallelism: QUESTION_GEN_CONCURRENCY or the default. */
export function getDefaultConcurrency(): number {
	const raw = Number(process.env.QUESTION_GEN_CONCURRENCY);
	return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_CONCURRENCY;
}
