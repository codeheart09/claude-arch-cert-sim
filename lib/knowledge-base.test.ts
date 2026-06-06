import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	searchKnowledgeBase: vi.fn(),
}));

vi.mock("../db/knowledge-base", () => ({
	searchKnowledgeBase: mocks.searchKnowledgeBase,
}));

async function loadSubject() {
	return import("./knowledge-base");
}

describe("retrieveGrounding", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.searchKnowledgeBase.mockReset();
	});

	it("delegates the query and search options to the knowledge-base DB layer", async () => {
		const { retrieveGrounding } = await loadSubject();
		const chunks = [
			{
				source: "exam-guide",
				type: "exam-guide",
				heading: "Task Statement 5.2",
				headingTrail: [
					"Claude Certified Architect",
					"Domain 5: Context Management & Reliability",
					"Task Statement 5.2",
				],
				domain: "Domain 5: Context Management & Reliability",
				taskStatement: "5.2",
				text: "Escalate when policy is ambiguous.",
				distance: 0.42,
			},
		];
		mocks.searchKnowledgeBase.mockResolvedValue(chunks);

		const result = await retrieveGrounding("when should agents escalate?", {
			limit: 3,
			domain: "Domain 5: Context Management & Reliability",
			type: "exam-guide",
		});

		expect(mocks.searchKnowledgeBase).toHaveBeenCalledTimes(1);
		expect(mocks.searchKnowledgeBase).toHaveBeenCalledWith(
			"when should agents escalate?",
			{
				limit: 3,
				domain: "Domain 5: Context Management & Reliability",
				type: "exam-guide",
			},
		);
		expect(result).toBe(chunks);
	});

	it("allows options to be omitted", async () => {
		const { retrieveGrounding } = await loadSubject();
		mocks.searchKnowledgeBase.mockResolvedValue([]);

		const result = await retrieveGrounding("tool descriptions");

		expect(mocks.searchKnowledgeBase).toHaveBeenCalledWith(
			"tool descriptions",
			undefined,
		);
		expect(result).toEqual([]);
	});
});
