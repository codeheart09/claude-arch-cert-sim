import { describe, expect, it } from "vitest";
import type { QuestionCombo } from "./exam-taxonomy";
import { parseQuestion } from "./question-generator";

const combo: QuestionCombo = {
	domain: "tool-design-mcp",
	scenario: "customer-support-agent",
	difficulty: "medium",
};

const valid = {
	question:
		"Production logs show the agent misroutes order lookups. What is the most effective first step?",
	difficulty: "medium",
	domain: "tool-design-mcp",
	scenario: "customer-support-agent",
	alternatives: { a: "Option A", b: "Option B", c: "Option C", d: "Option D" },
	correct_alternative: "b",
	insights: {
		a: "Wrong because A.",
		b: "Correct because B.",
		c: "Wrong because C.",
		d: "Wrong because D.",
	},
};

describe("parseQuestion", () => {
	it("accepts a well-formed question matching the combo", () => {
		const result = parseQuestion(valid, combo);
		expect(result.correct_alternative).toBe("b");
		expect(Object.keys(result.alternatives)).toEqual(["a", "b", "c", "d"]);
		expect(result.domain).toBe("tool-design-mcp");
	});

	it("rejects a difficulty that does not match the requested combo", () => {
		expect(() =>
			parseQuestion({ ...valid, difficulty: "hard" }, combo),
		).toThrow(/difficulty/);
	});

	it("rejects a domain that does not match the requested combo", () => {
		expect(() =>
			parseQuestion({ ...valid, domain: "prompt-engineering" }, combo),
		).toThrow(/domain/);
	});

	it("rejects when correct_alternative is not one of a–d", () => {
		expect(() =>
			parseQuestion({ ...valid, correct_alternative: "e" }, combo),
		).toThrow(/correct_alternative/);
	});

	it("rejects a missing alternative option", () => {
		const missing = { ...valid, alternatives: { a: "A", b: "B", c: "C" } };
		expect(() => parseQuestion(missing, combo)).toThrow(/alternatives\.d/);
	});

	it("rejects an extra alternative key beyond a–d", () => {
		const extra = {
			...valid,
			alternatives: { ...valid.alternatives, e: "extra" },
		};
		expect(() => parseQuestion(extra, combo)).toThrow(/unexpected key/);
	});

	it("rejects insights with an empty entry", () => {
		const blank = { ...valid, insights: { ...valid.insights, c: "" } };
		expect(() => parseQuestion(blank, combo)).toThrow(/insights\.c/);
	});

	it("rejects non-object input", () => {
		expect(() => parseQuestion(null, combo)).toThrow();
		expect(() => parseQuestion("nope", combo)).toThrow();
	});
});
