import { describe, expect, it } from "vitest";
import { DIFFICULTY_ENUM } from "../db/schema";
import {
	buildCombos,
	DOMAIN_HEADINGS,
	SCENARIO_PRIMARY_DOMAINS,
	SCENARIO_TITLES,
	validPairs,
} from "./exam-taxonomy";

const isValidPair = (domain: string, scenario: string): boolean =>
	(
		SCENARIO_PRIMARY_DOMAINS[
			scenario as keyof typeof SCENARIO_PRIMARY_DOMAINS
		] ?? []
	).includes(domain as never);

describe("validPairs", () => {
	it("contains only scenario/primary-domain combinations", () => {
		const pairs = validPairs();
		expect(pairs.length).toBeGreaterThan(0);
		for (const { domain, scenario } of pairs) {
			expect(isValidPair(domain, scenario)).toBe(true);
		}
	});

	it("covers every scenario and every domain at least once", () => {
		const pairs = validPairs();
		const scenarios = new Set(pairs.map((p) => p.scenario));
		const domains = new Set(pairs.map((p) => p.domain));
		expect(scenarios.size).toBe(Object.keys(SCENARIO_TITLES).length);
		expect(domains.size).toBe(Object.keys(DOMAIN_HEADINGS).length);
	});
});

describe("buildCombos", () => {
	it("returns exactly `count` combos, all valid", () => {
		const combos = buildCombos(5);
		expect(combos).toHaveLength(5);
		for (const combo of combos) {
			expect(isValidPair(combo.domain, combo.scenario)).toBe(true);
			expect(DIFFICULTY_ENUM).toContain(combo.difficulty);
		}
	});

	it("assigns only valid difficulty values", () => {
		// Difficulty is now random per combo, so we can only assert each value is
		// drawn from the allowed set — not that all three appear in a small batch.
		const combos = buildCombos(6);
		for (const combo of combos) {
			expect(DIFFICULTY_ENUM).toContain(combo.difficulty);
		}
	});

	it("produces distinct pairs while count <= number of valid pairs", () => {
		const total = validPairs().length;
		const combos = buildCombos(total);
		const keys = combos.map((c) => `${c.scenario}/${c.domain}`);
		expect(new Set(keys).size).toBe(total);
	});
});
