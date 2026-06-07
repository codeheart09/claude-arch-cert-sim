import { describe, expect, it } from "vitest";
import type { QuestionInput } from "../db/questions";
import { mergeQuestions } from "./dump-generated-questions";

const authoredQuestion: QuestionInput = {
	question: "What is the most reliable first step for tool selection?",
	difficulty: "easy",
	domain: "tool-design-mcp",
	scenario: "customer-support-agent",
	alternatives: {
		a: "Write more code",
		b: "Improve tool descriptions",
		c: "Use more temperature",
		d: "Reduce tokens",
	},
	correct_alternative: "b",
	insights: {
		a: "Incorrect.",
		b: "Correct.",
		c: "Incorrect.",
		d: "Incorrect.",
	},
};

const generatedQuestion: QuestionInput = {
	question: "Which coordinator change best improves subtask coverage?",
	difficulty: "medium",
	domain: "agentic-architecture",
	scenario: "multi-agent-research",
	alternatives: {
		a: "Add retries",
		b: "Broaden decomposition",
		c: "Increase context window",
		d: "Lower temperature",
	},
	correct_alternative: "b",
	insights: {
		a: "Retries do not fix narrow scope.",
		b: "Correct.",
		c: "Context size does not expand assigned scope.",
		d: "Sampling changes do not address decomposition.",
	},
};

describe("mergeQuestions", () => {
	it("preserves existing entries and appends generated ones after them", () => {
		const merged = mergeQuestions([authoredQuestion], [generatedQuestion]);

		expect(merged).toEqual([authoredQuestion, generatedQuestion]);
	});

	it("skips generated questions already present in the existing file", () => {
		const merged = mergeQuestions([authoredQuestion], [authoredQuestion]);

		expect(merged).toEqual([authoredQuestion]);
	});
});
