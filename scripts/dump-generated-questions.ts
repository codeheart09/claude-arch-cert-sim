import { readFileSync, writeFileSync } from "node:fs";
import { closeDb } from "../db/drizzle";
import { hashQuestion, type QuestionInput } from "../db/questions";
import { getGeneratedQuestionsForJson } from "../lib/questions";

const QUESTIONS_FILE = "db/questions.json";

export function mergeQuestions(
	existing: readonly QuestionInput[],
	generated: readonly QuestionInput[],
): QuestionInput[] {
	const seen = new Set(
		existing.map((question) => hashQuestion(question.question)),
	);
	const merged = [...existing];

	for (const question of generated) {
		const hash = hashQuestion(question.question);
		if (seen.has(hash)) {
			continue;
		}
		merged.push(question);
		seen.add(hash);
	}

	return merged;
}

function main(): void {
	const existing = JSON.parse(
		readFileSync(QUESTIONS_FILE, "utf8"),
	) as QuestionInput[];
	const generated = getGeneratedQuestionsForJson();
	const questions = mergeQuestions(existing, generated);
	const appended = questions.length - existing.length;

	writeFileSync(
		QUESTIONS_FILE,
		`${JSON.stringify(questions, null, "\t")}\n`,
		"utf8",
	);
	console.log(
		`Appended ${appended} generated question(s) to ${QUESTIONS_FILE} (${questions.length} total entries).`,
	);
	closeDb();
}

if (import.meta.main) {
	try {
		main();
	} catch (error) {
		closeDb();
		throw error;
	}
}
