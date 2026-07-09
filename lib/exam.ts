import { getAnswersByExamSimulationId, insertAnswer } from "../db/answers";
import {
	insertExamSimulation,
	updateExamSimulation,
} from "../db/exam-simulations";
import {
	getQuestionById,
	getQuestionsByDomain,
	getQuestionsByDomainScenario,
	getRandomQuestions,
} from "../db/questions";
import type { Alternative, Difficulty, Domain, Scenario } from "../db/schema";
import {
	DOMAIN_CHECKPOINT_COUNT,
	EXAM_QUESTION_COUNT,
	SCENARIO_PRIMARY_DOMAINS,
} from "./exam-taxonomy";
import type { PracticeChoice } from "./practice";

export type { Alternative, Domain, Scenario };

export { DOMAIN_CHECKPOINT_COUNT, EXAM_QUESTION_COUNT };

const TARGET_PER_PAIR = 4;

export interface ExamQuestion {
	id: number;
	question: string;
	choices: PracticeChoice[];
	domain: Domain | null;
	scenario: Scenario | null;
	difficulty: Difficulty;
}

export interface DomainResult {
	domain: Domain;
	correct: number;
	total: number;
}

export interface ScenarioResult {
	scenario: Scenario;
	correct: number;
	total: number;
}

export interface ExamGradeResult {
	examSimulationId: number;
	score: number;
	correctCount: number;
	wrongCount: number;
	percentage: number;
	totalExamTimeMs: number;
	avgQuestionTimeMs: number;
	byDomain: DomainResult[];
	byScenario: ScenarioResult[];
	questionResults: {
		questionId: number;
		isCorrect: boolean;
		question: string;
		selectedAlternative: Alternative;
		correctAlternative: Alternative;
		selectedText: string;
		correctText: string;
		insight: string;
		correctInsight: string;
	}[];
}

function shuffle<T>(arr: readonly T[]): T[] {
	const out = [...arr];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/**
 * Builds a balanced 60-question exam set.
 *
 * Tries to pull TARGET_PER_PAIR questions from each of the 15 valid
 * domain/scenario pairs. If some pairs have fewer than TARGET_PER_PAIR
 * questions, the shortfall is filled by drawing extras from the full pool
 * (excluding already-selected IDs) so the total always reaches 60 (or
 * however many exist, if the bank is very sparse).
 */
export function getExamQuestions(): ExamQuestion[] {
	const pool: ExamQuestion[] = [];
	const usedIds = new Set<number>();

	for (const [scenario, domains] of Object.entries(
		SCENARIO_PRIMARY_DOMAINS,
	) as [Scenario, Domain[]][]) {
		for (const domain of domains) {
			const rows = getQuestionsByDomainScenario(
				domain,
				scenario,
				TARGET_PER_PAIR,
			);
			for (const row of rows) {
				if (!usedIds.has(row.id)) {
					usedIds.add(row.id);
					pool.push(toExamQuestion(row));
				}
			}
		}
	}

	if (pool.length < EXAM_QUESTION_COUNT) {
		const needed = EXAM_QUESTION_COUNT - pool.length;
		const extras = getRandomQuestions(needed, [...usedIds]);
		for (const row of extras) {
			pool.push(toExamQuestion(row));
		}
	}

	return shuffle(pool).slice(0, EXAM_QUESTION_COUNT);
}

/**
 * Builds a domain-scoped checkpoint set from a single domain, across all scenarios.
 * Used when the user picks a specific domain on the exam setup screen.
 */
export function getExamQuestionsByDomain(
	domain: Domain,
	count: number = DOMAIN_CHECKPOINT_COUNT,
): ExamQuestion[] {
	const rows = getQuestionsByDomain(domain, count);
	return rows.map(toExamQuestion);
}

function toExamQuestion(row: {
	id: number;
	question: string;
	alternatives: string;
	difficulty: Difficulty;
	domain: Domain | null;
	scenario: Scenario | null;
}): ExamQuestion {
	const alternatives = JSON.parse(row.alternatives) as Partial<
		Record<Alternative, string>
	>;
	const choices: PracticeChoice[] = shuffle(
		Object.entries(alternatives).map(([letter, text]) => ({
			letter: letter as Alternative,
			text: text ?? "",
		})),
	);
	return {
		id: row.id,
		question: row.question,
		choices,
		domain: row.domain,
		scenario: row.scenario,
		difficulty: row.difficulty,
	};
}

/**
 * Creates an exam simulation row at the start of an exam session.
 * `duration` and `score` are placeholder zeros — updated by `finalizeExamSession`.
 * Returns the new simulation ID to pass with every subsequent answer.
 */
export function startExamSession(): number {
	const sim = insertExamSimulation({
		completed: false,
		duration: 0,
		score: 0,
	});
	return sim.id;
}

/**
 * Persists a single answered question during an active exam.
 * Call this immediately when the user submits each question.
 */
export function recordExamAnswer(
	examSimulationId: number,
	questionId: number,
	selected: Alternative,
	durationMs: number,
): void {
	const question = getQuestionById(questionId);
	if (!question) throw new Error(`Question ${questionId} not found.`);

	insertAnswer({
		questionId,
		selectedAlternative: selected,
		isCorrect: selected === question.correctAlternative,
		duration: durationMs,
		examSimulationId,
	});
}

/**
 * Grades the exam by reading all persisted answers for this session,
 * then updates the `exam_simulations` row with the final score, duration,
 * and completion flag.
 *
 * `completed` should be true when all 60 questions were answered before
 * the timer expired.
 */
export function finalizeExamSession(
	examSimulationId: number,
	totalExamTimeMs: number,
	completed: boolean,
	totalQuestions: number = EXAM_QUESTION_COUNT,
): ExamGradeResult {
	const savedAnswers = getAnswersByExamSimulationId(examSimulationId);

	const domainMap = new Map<Domain, { correct: number; total: number }>();
	const scenarioMap = new Map<Scenario, { correct: number; total: number }>();
	const questionResults: ExamGradeResult["questionResults"] = [];

	let correctCount = 0;
	let totalDurationMs = 0;

	for (const answer of savedAnswers) {
		const question = getQuestionById(answer.questionId);
		if (!question) continue;

		if (answer.isCorrect) correctCount++;
		totalDurationMs += answer.duration ?? 0;

		const alternatives = JSON.parse(question.alternatives) as Partial<
			Record<Alternative, string>
		>;
		const insights = JSON.parse(question.insights) as Partial<
			Record<Alternative, string>
		>;
		const selected = answer.selectedAlternative as Alternative;
		const correct = question.correctAlternative as Alternative;
		questionResults.push({
			questionId: question.id,
			isCorrect: answer.isCorrect,
			question: question.question,
			selectedAlternative: selected,
			correctAlternative: correct,
			selectedText: alternatives[selected] ?? "",
			correctText: alternatives[correct] ?? "",
			insight: insights[selected] ?? "",
			correctInsight: insights[correct] ?? "",
		});

		if (question.domain) {
			const d = domainMap.get(question.domain) ?? { correct: 0, total: 0 };
			d.total++;
			if (answer.isCorrect) d.correct++;
			domainMap.set(question.domain, d);
		}

		if (question.scenario) {
			const s = scenarioMap.get(question.scenario) ?? {
				correct: 0,
				total: 0,
			};
			s.total++;
			if (answer.isCorrect) s.correct++;
			scenarioMap.set(question.scenario, s);
		}
	}

	const answeredCount = savedAnswers.length;
	const score = Math.round(correctCount * (1000 / totalQuestions));
	const percentage =
		answeredCount > 0
			? Math.round((correctCount / answeredCount) * 1000) / 10
			: 0;
	const avgQuestionTimeMs =
		answeredCount > 0 ? Math.round(totalDurationMs / answeredCount) : 0;

	updateExamSimulation(examSimulationId, {
		completed,
		duration: totalExamTimeMs,
		score,
	});

	return {
		examSimulationId,
		score,
		correctCount,
		wrongCount: answeredCount - correctCount,
		percentage,
		totalExamTimeMs,
		avgQuestionTimeMs,
		byDomain: [...domainMap.entries()].map(([domain, v]) => ({
			domain,
			...v,
		})),
		byScenario: [...scenarioMap.entries()].map(([scenario, v]) => ({
			scenario,
			...v,
		})),
		questionResults,
	};
}
