import { describe, expect, it } from "vitest";
import {
	type CorpusChunk,
	chunkMarkdown,
	extractTags,
	parseFrontmatter,
} from "./corpus";

/** Mirror of the hard cap in corpus.ts (kept under the 512-token embedding limit). */
const MAX_CHARS = 1900;

const EXAM_GUIDE_SAMPLE = `---
source: exam-guide
title: Sample Exam Guide
type: exam-guide
---

# Sample Exam Guide

## Domain 1: Agentic Architecture & Orchestration

### Task Statement 1.1: Design agentic loops

**Knowledge of:**

- The agentic loop lifecycle and stop_reason handling.
- How tool results are appended to conversation history.

### Task Statement 1.2: Orchestrate multi-agent systems

- Hub-and-spoke coordinator patterns.

## Sample Questions

### Scenario: Customer Support

#### Question 1

What is the best escalation strategy?

- A) Always escalate.
- B) Escalate on policy gaps.

**Correct Answer:** B
`;

describe("parseFrontmatter", () => {
	it("reads source, type, and title, and strips the frontmatter from the body", () => {
		const { meta, body } = parseFrontmatter(EXAM_GUIDE_SAMPLE, "fallback");
		expect(meta).toEqual({
			source: "exam-guide",
			type: "exam-guide",
			title: "Sample Exam Guide",
		});
		expect(body.startsWith("\n# Sample Exam Guide")).toBe(true);
		expect(body).not.toContain("---");
	});

	it("defaults source to the fallback and type to 'document' when absent", () => {
		const { meta, body } = parseFrontmatter("# Heading\n\nBody.", "my-doc");
		expect(meta).toEqual({ source: "my-doc", type: "document" });
		expect(body).toBe("# Heading\n\nBody.");
	});
});

describe("extractTags", () => {
	it("derives domain and task-statement id from the heading trail", () => {
		expect(
			extractTags([
				"Domain 2: Tool Design & MCP Integration",
				"Task Statement 2.3: Distribute tools",
			]),
		).toEqual({
			domain: "Domain 2: Tool Design & MCP Integration",
			taskStatement: "2.3",
		});
	});

	it("returns nulls for documents without that vocabulary", () => {
		expect(extractTags(["Getting Started", "Installation"])).toEqual({
			domain: null,
			taskStatement: null,
		});
	});
});

describe("chunkMarkdown", () => {
	const chunks = chunkMarkdown(EXAM_GUIDE_SAMPLE, "fallback");
	const byHeading = (h: string): CorpusChunk | undefined =>
		chunks.find((c) => c.heading === h);

	it("emits a chunk only for headings that have direct content", () => {
		// The title and the Domain/Sample-Questions/Scenario headings have no direct
		// body, so they should not produce chunks of their own.
		const headings = chunks.map((c) => c.heading);
		expect(headings).toContain("Task Statement 1.1: Design agentic loops");
		expect(headings).toContain(
			"Task Statement 1.2: Orchestrate multi-agent systems",
		);
		expect(headings).toContain("Question 1");
		expect(headings).not.toContain("Sample Exam Guide");
		expect(headings).not.toContain(
			"Domain 1: Agentic Architecture & Orchestration",
		);
	});

	it("captures the full heading trail and propagates doc metadata", () => {
		const task = byHeading("Task Statement 1.1: Design agentic loops");
		expect(task?.headingTrail).toEqual([
			"Sample Exam Guide",
			"Domain 1: Agentic Architecture & Orchestration",
			"Task Statement 1.1: Design agentic loops",
		]);
		expect(task?.source).toBe("exam-guide");
		expect(task?.type).toBe("exam-guide");
	});

	it("derives domain/task tags and leaves them null where absent", () => {
		const task = byHeading(
			"Task Statement 1.2: Orchestrate multi-agent systems",
		);
		expect(task?.domain).toBe("Domain 1: Agentic Architecture & Orchestration");
		expect(task?.taskStatement).toBe("1.2");

		const question = byHeading("Question 1");
		expect(question?.domain).toBeNull();
		expect(question?.taskStatement).toBeNull();
	});

	it("preserves order via a 0-based running chunkIndex and never emits empty text", () => {
		expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
		for (const chunk of chunks) {
			expect(chunk.text.trim().length).toBeGreaterThan(0);
		}
	});

	it("keeps the question stem, options, and answer together in one chunk", () => {
		const question = byHeading("Question 1");
		expect(question?.text).toContain("best escalation strategy");
		expect(question?.text).toContain("A) Always escalate.");
		expect(question?.text).toContain("**Correct Answer:** B");
	});

	it("splits oversized sections into multiple chunks under the cap", () => {
		const paragraph = `${"word ".repeat(120).trim()}.`;
		const big = `# Doc\n\n## Big Section\n\n${Array.from({ length: 8 }, () => paragraph).join("\n\n")}\n`;
		const result = chunkMarkdown(big, "big");
		expect(result.length).toBeGreaterThan(1);
		for (const chunk of result) {
			expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHARS);
			expect(chunk.heading).toBe("Big Section");
		}
	});

	it("handles a non-exam-guide document with unrelated headings", () => {
		const doc = `---\nsource: study-guide\ntype: study-guide\n---\n\n# Study Guide\n\n## Getting Started\n\nInstall the SDK and configure credentials.\n\n## Next Steps\n\nRead the API reference.\n`;
		const result = chunkMarkdown(doc, "study-guide");
		expect(result).toHaveLength(2);
		for (const chunk of result) {
			expect(chunk.type).toBe("study-guide");
			expect(chunk.domain).toBeNull();
			expect(chunk.taskStatement).toBeNull();
		}
		expect(result[0].heading).toBe("Getting Started");
	});
});
