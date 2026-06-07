/**
 * Development seed script — presentation-only runtime data.
 *
 * Run with: pnpm db:seed:dev
 *
 * This intentionally resets only presentation progress tables (`answers` and
 * `exam_simulations`). It does not touch the knowledge base or question bank.
 */
import { asc, eq } from "drizzle-orm";
import { closeDb, getDb } from "../db/drizzle";
import {
	ALTERNATIVE_ENUM,
	type Alternative,
	answers,
	examSimulations,
	questions,
} from "../db/schema";

const EXAM_COUNT = 10;
const ANSWER_COUNT = 350;
const DAY_MS = 24 * 60 * 60 * 1000;
const SECOND_MS = 1000;

interface QuestionSeedRow {
	id: number;
	correctAlternative: Alternative;
}

function randomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(items: readonly T[]): T {
	const item = items[randomInt(0, items.length - 1)];
	if (item === undefined) {
		throw new Error("Cannot choose from an empty list.");
	}
	return item;
}

function toAlternative(value: string): Alternative {
	if (ALTERNATIVE_ENUM.includes(value as Alternative)) {
		return value as Alternative;
	}
	throw new Error(`Question has invalid correct alternative: ${value}`);
}

function makePresentationDate(index: number, total: number, today: Date): Date {
	const daysAgo = total - index - 1;
	const date = new Date(today.getTime() - daysAgo * DAY_MS);
	date.setHours(12, 0, 0, 0);
	return date;
}

function makeExamScore(index: number): number {
	if (index === 0) {
		return 600;
	}
	if (index === EXAM_COUNT - 1) {
		return 1000;
	}

	const baseline = 600 + (index * 400) / (EXAM_COUNT - 1);
	return Math.round(baseline + randomInt(-10, 10));
}

function makeExamDuration(index: number): number {
	const progress = index / (EXAM_COUNT - 1);
	const startMinutes = 116;
	const endMinutes = 62;
	const baselineSeconds = Math.round(
		(startMinutes - (startMinutes - endMinutes) * progress) * 60,
	);
	const jitterSeconds = randomInt(-90, 90);
	return Math.max(45 * 60, baselineSeconds + jitterSeconds) * SECOND_MS;
}

function makeAnswerDuration(index: number): number {
	const progress = index / (ANSWER_COUNT - 1);
	const windowEndSeconds = Math.round(180 - 120 * progress);
	const windowStartSeconds = Math.max(30, windowEndSeconds - 30);
	return randomInt(windowStartSeconds, windowEndSeconds) * SECOND_MS;
}

function makeSelectedAlternative(
	correctAlternative: Alternative,
	isCorrect: boolean,
): Alternative {
	if (isCorrect) {
		return correctAlternative;
	}

	const wrongAlternatives = ALTERNATIVE_ENUM.filter(
		(alternative) => alternative !== correctAlternative,
	);
	return randomChoice(wrongAlternatives);
}

function loadQuestions(): QuestionSeedRow[] {
	const rows = getDb()
		.select({
			id: questions.id,
			correctAlternative: questions.correctAlternative,
		})
		.from(questions)
		.where(eq(questions.deleted, false))
		.orderBy(asc(questions.id))
		.all();

	return rows.map((row) => ({
		id: row.id,
		correctAlternative: toAlternative(row.correctAlternative),
	}));
}

function seedDevRuntime(): void {
	const db = getDb();
	const questionRows = loadQuestions();

	if (questionRows.length === 0) {
		throw new Error(
			"No questions found. Run the main seed before the development runtime seed.",
		);
	}

	const today = new Date();

	const examRows = Array.from({ length: EXAM_COUNT }, (_, index) => ({
		completed: true,
		duration: makeExamDuration(index),
		score: makeExamScore(index),
		createdAt: makePresentationDate(index, EXAM_COUNT, today),
	}));

	const answerRows = Array.from({ length: ANSWER_COUNT }, (_, index) => {
		const question = randomChoice(questionRows);
		const progress = index / (ANSWER_COUNT - 1);
		const targetCorrectness = 0.56 + progress * 0.34;
		const isCorrect = Math.random() < targetCorrectness;

		return {
			questionId: question.id,
			selectedAlternative: makeSelectedAlternative(
				question.correctAlternative,
				isCorrect,
			),
			isCorrect,
			duration: makeAnswerDuration(index),
			examSimulationId: null,
			createdAt: makePresentationDate(index, ANSWER_COUNT, today),
		};
	});

	db.transaction((tx) => {
		tx.delete(answers).run();
		tx.delete(examSimulations).run();
		tx.insert(examSimulations).values(examRows).run();
		tx.insert(answers).values(answerRows).run();
	});

	console.log(
		`Seeded ${examRows.length} exam simulations and ${answerRows.length} answers.`,
	);
}

try {
	seedDevRuntime();
} finally {
	closeDb();
}
