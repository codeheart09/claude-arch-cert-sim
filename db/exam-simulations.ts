import { eq } from "drizzle-orm";
import { getDb } from "./drizzle";
import {
	type ExamSimulation,
	examSimulations,
	type NewExamSimulation,
} from "./schema";

export function insertExamSimulation(input: NewExamSimulation): ExamSimulation {
	const row = getDb().insert(examSimulations).values(input).returning().get();

	if (!row) {
		throw new Error("Failed to record exam simulation.");
	}

	return row;
}

export function getExamSimulationById(id: number): ExamSimulation | undefined {
	return getDb()
		.select()
		.from(examSimulations)
		.where(eq(examSimulations.id, id))
		.get();
}

/** Updates the final score, duration, and completion status at exam end. */
export function updateExamSimulation(
	id: number,
	patch: { completed: boolean; duration: number; score: number },
): void {
	getDb()
		.update(examSimulations)
		.set(patch)
		.where(eq(examSimulations.id, id))
		.run();
}
