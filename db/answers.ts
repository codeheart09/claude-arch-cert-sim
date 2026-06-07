import { getDb } from "./drizzle";
import { type Answer, answers, type NewAnswer } from "./schema";

/** Persists a submitted practice answer and returns the inserted row. */
export function insertAnswer(input: NewAnswer): Answer {
	const answer = getDb().insert(answers).values(input).returning().get();

	if (!answer) {
		throw new Error("Failed to record answer.");
	}

	return answer;
}
