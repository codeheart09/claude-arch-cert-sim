import type { RawAnswer } from "@/db/analytics";
import { getRawAnswers, getRawExams } from "@/db/analytics";
import type { Domain, Scenario } from "@/db/schema";

export type Period = "1d" | "7d" | "30d" | "60q" | "300q" | "all";

export interface GroupStat {
	slug: string;
	label: string;
	correct: number;
	total: number;
}

export interface Batch {
	label: string;
	value: number;
	count: number;
}

export interface AnalyticsData {
	totalAnswers: number;
	correctnessRate: number | null;
	examPassCount: number;
	avgAnswerDurationMs: number | null;
	avgExamDurationMs: number | null;
	correctnessByDomain: GroupStat[];
	correctnessByScenario: GroupStat[];
	correctnessBatches: Batch[];
	responseTimeBatches: Batch[];
}

const PASSING_SCORE = 720;
const MIN_BATCH_SIZE = 10;
const MAX_BATCHES = 30;

const DOMAIN_LABELS: Record<Domain, string> = {
	"agentic-architecture": "Agentic Architecture",
	"tool-design-mcp": "Tool Design & MCP",
	"claude-code-config": "Claude Code",
	"prompt-engineering": "Prompt Engineering",
	"context-reliability": "Context & Reliability",
};

const SCENARIO_LABELS: Record<Scenario, string> = {
	"customer-support-agent": "Customer Support",
	"code-generation": "Code Generation",
	"multi-agent-research": "Multi-Agent Research",
	"developer-productivity": "Dev Productivity",
	"ci-cd-integration": "CI/CD Integration",
	"structured-data-extraction": "Data Extraction",
};

export function getAnalyticsData(period: Period): AnalyticsData {
	const filter = periodToFilter(period);
	const rawAnswers = getRawAnswers(filter);

	// For count-based periods, scope exams to the same time window as the N answers
	const examSince =
		filter.type === "count" && rawAnswers.length > 0
			? rawAnswers[0].createdAt
			: filter.type === "time"
				? filter.since
				: undefined;

	const rawExams = getRawExams(examSince);

	return compute(rawAnswers, rawExams);
}

function periodToFilter(
	period: Period,
):
	| { type: "time"; since: Date }
	| { type: "count"; limit: number }
	| { type: "all" } {
	const now = new Date();
	switch (period) {
		case "1d":
			return { type: "time", since: new Date(now.getTime() - 86_400_000) };
		case "7d":
			return { type: "time", since: new Date(now.getTime() - 7 * 86_400_000) };
		case "30d":
			return { type: "time", since: new Date(now.getTime() - 30 * 86_400_000) };
		case "60q":
			return { type: "count", limit: 60 };
		case "300q":
			return { type: "count", limit: 300 };
		case "all":
			return { type: "all" };
	}
}

function compute(
	answers: RawAnswer[],
	exams: { score: number; duration: number; completed: boolean }[],
): AnalyticsData {
	const total = answers.length;
	const correctCount = answers.filter((a) => a.isCorrect).length;

	const correctnessRate = total > 0 ? (correctCount / total) * 100 : null;

	const examPassCount = exams.filter((e) => e.score >= PASSING_SCORE).length;

	const answersWithDuration = answers.filter((a) => a.duration !== null);
	const avgAnswerDurationMs =
		answersWithDuration.length > 0
			? answersWithDuration.reduce((s, a) => s + (a.duration ?? 0), 0) /
				answersWithDuration.length
			: null;

	const avgExamDurationMs =
		exams.length > 0
			? exams.reduce((s, e) => s + e.duration, 0) / exams.length
			: null;

	const batchSize =
		total > MAX_BATCHES * MIN_BATCH_SIZE
			? Math.ceil(total / MAX_BATCHES)
			: MIN_BATCH_SIZE;

	return {
		totalAnswers: total,
		correctnessRate,
		examPassCount,
		avgAnswerDurationMs,
		avgExamDurationMs,
		correctnessByDomain: computeGroupStats(answers, "domain", DOMAIN_LABELS),
		correctnessByScenario: computeGroupStats(
			answers,
			"scenario",
			SCENARIO_LABELS,
		),
		correctnessBatches: computeCorrectnessBatches(answers, batchSize),
		responseTimeBatches: computeResponseTimeBatches(answers, batchSize),
	};
}

function computeGroupStats(
	answers: RawAnswer[],
	key: "domain" | "scenario",
	labels: Record<string, string>,
): GroupStat[] {
	const map = new Map<string, { correct: number; total: number }>();

	for (const answer of answers) {
		const slug = answer[key];
		if (!slug) continue;
		const entry = map.get(slug) ?? { correct: 0, total: 0 };
		entry.total++;
		if (answer.isCorrect) entry.correct++;
		map.set(slug, entry);
	}

	return Object.entries(labels)
		.filter(([slug]) => map.has(slug))
		.map(([slug, label]) => ({
			slug,
			label,
			correct: map.get(slug)?.correct ?? 0,
			total: map.get(slug)?.total ?? 0,
		}));
}

function computeCorrectnessBatches(
	answers: RawAnswer[],
	batchSize: number,
): Batch[] {
	const batches: Batch[] = [];
	const completeBatches = Math.floor(answers.length / batchSize);
	for (let i = 0; i < completeBatches; i++) {
		const slice = answers.slice(i * batchSize, (i + 1) * batchSize);
		const correct = slice.filter((a) => a.isCorrect).length;
		batches.push({
			label: String(i + 1),
			value: Math.round((correct / slice.length) * 1000) / 10,
			count: slice.length,
		});
	}
	return batches;
}

function computeResponseTimeBatches(
	answers: RawAnswer[],
	batchSize: number,
): Batch[] {
	const batches: Batch[] = [];
	const completeBatches = Math.floor(answers.length / batchSize);
	for (let i = 0; i < completeBatches; i++) {
		const slice = answers
			.slice(i * batchSize, (i + 1) * batchSize)
			.filter((a) => a.duration !== null);
		const avg =
			slice.length > 0
				? slice.reduce((s, a) => s + (a.duration ?? 0), 0) / slice.length
				: 0;
		batches.push({
			label: String(i + 1),
			value: Math.round(avg),
			count: slice.length,
		});
	}
	return batches;
}
