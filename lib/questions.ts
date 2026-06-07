import { readFileSync } from "node:fs";
import { getClient } from "../db/drizzle";
import {
	type ImportResult,
	importQuestion,
	type QuestionInput,
} from "../db/questions";
import { embedPassages } from "./embeddings";

export type { QuestionInput } from "../db/questions";
export { getQuestionCount } from "../db/questions";

export interface ImportSingleResult {
	id: number;
	wasNew: boolean;
}

export interface ImportFileResult {
	imported: number;
	skipped: number;
}

/**
 * Embeds a single question and runs the idempotent import.
 * Reusable by the AI agent at runtime to store newly generated questions.
 */
export async function importSingleQuestion(
	input: QuestionInput,
): Promise<ImportSingleResult> {
	const [vector] = await embedPassages([input.question]);
	const result: ImportResult = importQuestion(getClient(), input, vector);
	return { id: result.rowid, wasNew: result.wasInserted };
}

/**
 * Reads a JSON file of QuestionInput records, batch-embeds all question texts
 * in a single model pass, then runs the idempotent import for each.
 */
export async function importQuestionsFromFile(
	filePath: string,
): Promise<ImportFileResult> {
	const raw = readFileSync(filePath, "utf8");
	const inputs = JSON.parse(raw) as QuestionInput[];

	if (inputs.length === 0) {
		return { imported: 0, skipped: 0 };
	}

	const vectors = await embedPassages(inputs.map((q) => q.question));
	const db = getClient();
	let imported = 0;
	let skipped = 0;

	for (let i = 0; i < inputs.length; i++) {
		const result = importQuestion(db, inputs[i], vectors[i]);
		if (result.wasInserted) {
			imported++;
		} else {
			skipped++;
		}
	}

	return { imported, skipped };
}
