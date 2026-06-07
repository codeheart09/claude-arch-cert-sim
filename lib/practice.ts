import { insertAnswer } from "../db/answers";
import { getQuestionById, getRandomQuestion } from "../db/questions";
import type { Alternative } from "../db/schema";

export type { Alternative } from "../db/schema";

// ─── Practice mode (Random Questions page) ──────────────────────────────────
//
// Kept separate from lib/questions.ts so the web runtime can read/grade
// questions without pulling in the embedding pipeline (fastembed + native
// tokenizers), which is only needed by the import/seed path.

/** One answer choice as shown to the user — the letter is kept for grading
 *  but never surfaced in the UI. */
export interface PracticeChoice {
	letter: Alternative;
	text: string;
}

/** A question prepared for practice: shuffled choices, no correct answer or
 *  insights leaked to the client. */
export interface PracticeQuestion {
	id: number;
	question: string;
	choices: PracticeChoice[];
}

/** Outcome of grading a submitted answer, returned to the client on submit. */
export interface AnswerResult {
	isCorrect: boolean;
	insight: string;
}

/** Fisher–Yates shuffle returning a new array; leaves the input untouched. */
function shuffle<T>(items: readonly T[]): T[] {
	const result = [...items];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

/**
 * Picks a random question and prepares it for practice: parses its alternatives,
 * shuffles them, and strips everything the client shouldn't see (the correct
 * answer and per-choice insights). Returns null when the bank is empty.
 */
export function getRandomPracticeQuestion(
	excludeIds: readonly number[] = [],
): PracticeQuestion | null {
	const question = getRandomQuestion(excludeIds);
	if (!question) {
		return null;
	}

	const alternatives = JSON.parse(question.alternatives) as Partial<
		Record<Alternative, string>
	>;
	const choices: PracticeChoice[] = shuffle(
		Object.entries(alternatives).map(([letter, text]) => ({
			letter: letter as Alternative,
			text,
		})),
	);

	return { id: question.id, question: question.question, choices };
}

/**
 * Grades a submitted answer against the stored correct alternative, records it
 * in the `answers` table, and returns the result plus the insight for the
 * selected choice. Throws if the question no longer exists.
 */
export function gradeAndRecordAnswer(
	questionId: number,
	selected: Alternative,
	durationMs?: number,
): AnswerResult {
	const question = getQuestionById(questionId);
	if (!question) {
		throw new Error(`Question ${questionId} not found.`);
	}

	const isCorrect = selected === question.correctAlternative;
	const insights = JSON.parse(question.insights) as Partial<
		Record<Alternative, string>
	>;

	insertAnswer({
		questionId,
		selectedAlternative: selected,
		isCorrect,
		duration: durationMs ?? null,
	});

	return { isCorrect, insight: insights[selected] ?? "" };
}
