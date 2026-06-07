import { describe, expect, it } from "vitest";
import { questionRowToInput } from "./questions";
import type { Question } from "./schema";

describe("questionRowToInput", () => {
	it("maps a runtime question row to the questions.json schema only", () => {
		const row: Question = {
			id: 42,
			question: "Which tool design change most improves selection reliability?",
			difficulty: "medium",
			domain: "tool-design-mcp",
			scenario: "customer-support-agent",
			alternatives: JSON.stringify({
				a: "Add retries",
				b: "Improve tool descriptions",
				c: "Raise the temperature",
				d: "Use more tokens",
			}),
			correctAlternative: "b",
			insights: JSON.stringify({
				a: "Retries do not improve selection quality.",
				b: "Descriptions are the primary selection signal.",
				c: "Temperature changes variance, not tool semantics.",
				d: "More tokens do not fix ambiguous tool metadata.",
			}),
			contentHash: "hash",
			source: "generated",
			deleted: false,
			createdAt: new Date("2026-06-07T12:00:00.000Z"),
		};

		expect(questionRowToInput(row)).toEqual({
			question: row.question,
			difficulty: row.difficulty,
			domain: row.domain,
			scenario: row.scenario,
			alternatives: {
				a: "Add retries",
				b: "Improve tool descriptions",
				c: "Raise the temperature",
				d: "Use more tokens",
			},
			correct_alternative: "b",
			insights: {
				a: "Retries do not improve selection quality.",
				b: "Descriptions are the primary selection signal.",
				c: "Temperature changes variance, not tool semantics.",
				d: "More tokens do not fix ambiguous tool metadata.",
			},
		});
	});

	it("omits nullable domain and scenario fields from the exported shape", () => {
		const row: Question = {
			id: 43,
			question: "What should the agent do first?",
			difficulty: "easy",
			domain: null,
			scenario: null,
			alternatives: JSON.stringify({
				a: "A",
				b: "B",
				c: "C",
				d: "D",
			}),
			correctAlternative: "a",
			insights: JSON.stringify({
				a: "Correct.",
				b: "Incorrect.",
				c: "Incorrect.",
				d: "Incorrect.",
			}),
			contentHash: "hash-2",
			source: "generated",
			deleted: false,
			createdAt: new Date("2026-06-07T12:01:00.000Z"),
		};

		expect(questionRowToInput(row)).toEqual({
			question: row.question,
			difficulty: row.difficulty,
			domain: undefined,
			scenario: undefined,
			alternatives: { a: "A", b: "B", c: "C", d: "D" },
			correct_alternative: "a",
			insights: {
				a: "Correct.",
				b: "Incorrect.",
				c: "Incorrect.",
				d: "Incorrect.",
			},
		});
	});
});
