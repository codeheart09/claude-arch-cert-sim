import { asc, desc, eq, gte } from "drizzle-orm";
import { getDb } from "./drizzle";
import type { Domain, Scenario } from "./schema";
import { answers, examSimulations, questions } from "./schema";

export interface RawAnswer {
	id: number;
	isCorrect: boolean;
	duration: number | null;
	createdAt: Date;
	domain: Domain | null;
	scenario: Scenario | null;
}

export interface RawExam {
	id: number;
	completed: boolean;
	duration: number;
	score: number;
	createdAt: Date;
}

export type AnalyticsFilter =
	| { type: "time"; since: Date }
	| { type: "count"; limit: number }
	| { type: "all" };

const ANSWER_COLS = {
	id: answers.id,
	isCorrect: answers.isCorrect,
	duration: answers.duration,
	createdAt: answers.createdAt,
	domain: questions.domain,
	scenario: questions.scenario,
} as const;

export function getRawAnswers(filter: AnalyticsFilter): RawAnswer[] {
	const db = getDb();

	if (filter.type === "time") {
		return db
			.select(ANSWER_COLS)
			.from(answers)
			.innerJoin(questions, eq(answers.questionId, questions.id))
			.where(gte(answers.createdAt, filter.since))
			.orderBy(asc(answers.createdAt))
			.all() as RawAnswer[];
	}

	if (filter.type === "count") {
		const rows = db
			.select(ANSWER_COLS)
			.from(answers)
			.innerJoin(questions, eq(answers.questionId, questions.id))
			.orderBy(desc(answers.createdAt))
			.limit(filter.limit)
			.all() as RawAnswer[];
		return rows.reverse();
	}

	return db
		.select(ANSWER_COLS)
		.from(answers)
		.innerJoin(questions, eq(answers.questionId, questions.id))
		.orderBy(asc(answers.createdAt))
		.all() as RawAnswer[];
}

export function getRawExams(since?: Date): RawExam[] {
	const db = getDb();
	if (since) {
		return db
			.select()
			.from(examSimulations)
			.where(gte(examSimulations.createdAt, since))
			.all();
	}
	return db.select().from(examSimulations).all();
}
