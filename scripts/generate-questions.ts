/**
 * CLI entry point for the question-generation agent.
 *
 *   pnpm questions:generate        # generate QUESTION_GEN_CONCURRENCY questions
 *   pnpm questions:generate 8      # generate 8 in parallel
 *
 * Each question is a fresh, isolated agent session on a distinct domain/scenario
 * combination. Live per-event output is streamed as agents run in parallel so
 * you can follow what each one is doing. Output rows are source='generated' and
 * survive db:seed reruns. See db/QUESTIONS.md.
 */
import { closeDb } from "../db/drizzle";
import { getDefaultConcurrency, getDefaultModel } from "../lib/anthropic";
import {
	type GenerationResult,
	generateQuestionBatch,
} from "../lib/question-generator";

// Load .env.local so the API key/model are present without a shell export
// (process.loadEnvFile is Node ≥20.12; absent file or older Node → ignored).
const loadEnvFile = (process as { loadEnvFile?: (path?: string) => void })
	.loadEnvFile;
if (loadEnvFile) {
	try {
		loadEnvFile(".env.local");
	} catch {
		// .env.local is optional when the vars are already in the environment.
	}
}

function ts(): string {
	return new Date().toISOString().slice(11, 19); // HH:MM:SS
}

function log(message: string): void {
	console.log(`${ts()} ${message}`);
}

function truncate(text: string | undefined, max = 100): string {
	if (!text) return "";
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

function printResult(result: GenerationResult): void {
	const where = `${result.combo.scenario}/${result.combo.domain}/${result.combo.difficulty}`;
	const timing =
		result.elapsedMs !== undefined
			? ` (${(result.elapsedMs / 1000).toFixed(1)}s)`
			: "";

	if (result.status === "created") {
		console.log(`\n  ✓ CREATED  ${where}${timing}`);
		console.log(`    #${result.id}: ${truncate(result.question)}`);
	} else if (result.status === "duplicate") {
		console.log(`\n  ~ DUPLICATE ${where}${timing}`);
		console.log(`    ${result.detail ?? ""}`);
	} else {
		console.log(
			`\n  ✗ ${result.status.toUpperCase().padEnd(8)} ${where}${timing}`,
		);
		console.log(`    ${result.detail ?? ""}`);
	}
}

async function main(): Promise<void> {
	const arg = Number(process.argv[2]);
	const count =
		Number.isInteger(arg) && arg > 0 ? arg : getDefaultConcurrency();
	const model = getDefaultModel();

	console.log(`\nGenerating ${count} question(s) in parallel`);
	console.log(`Model: ${model}`);
	console.log("─".repeat(72));

	const summary = await generateQuestionBatch(count, { log });

	console.log("\n" + "─".repeat(72));
	console.log("Results:");
	for (const result of summary.results) {
		printResult(result);
	}
	console.log(
		`\nSummary: ${summary.created} created, ${summary.duplicates} duplicate(s), ${summary.failed} failed.\n`,
	);
	// Close the DB before exiting so sqlite-vec's native mutex tears down cleanly.
	// process.exit() would force-terminate without giving native modules a chance
	// to clean up, causing the mutex crash (exit code 134).
	closeDb();
	process.exitCode = summary.failed > 0 ? 1 : 0;
}

main().catch((error) => {
	console.error(error);
	closeDb();
	process.exitCode = 1;
});
