"use server";

import { refresh } from "next/cache";
import { ALTERNATIVE_ENUM, type Alternative } from "@/db/schema";
import {
	type ExamGradeResult,
	type ExamQuestion,
	finalizeExamSession,
	getExamQuestions,
	recordExamAnswer,
	startExamSession,
} from "@/lib/exam";
import {
	type AnswerResult,
	getRandomPracticeQuestion,
	gradeAndRecordAnswer,
	type PracticeQuestion,
} from "@/lib/practice";
import { createUser, getUser } from "@/lib/user";
import type { CreateUserState } from "@/lib/user-form";

export async function createLocalUser(
	_previousState: CreateUserState,
	formData: FormData,
): Promise<CreateUserState> {
	const rawName = formData.get("name");

	if (typeof rawName !== "string") {
		return { error: "Enter your name to begin." };
	}

	const name = rawName.trim().replace(/\s+/g, " ");

	if (name.length === 0) {
		return { error: "Enter your name to begin." };
	}

	if (name.length > 80) {
		return { error: "Keep your name to 80 characters or fewer." };
	}

	const existingUser = getUser();

	if (!existingUser) {
		createUser(name);
	}

	refresh();
	return {};
}

/** Fetches a fresh random question for the practice page (initial load + Next). */
export async function fetchRandomQuestion(
	excludeIds: readonly number[] = [],
): Promise<PracticeQuestion | null> {
	return getRandomPracticeQuestion(excludeIds);
}

/** Grades and persists a submitted practice answer, returning the result. */
export async function submitPracticeAnswer(
	questionId: number,
	selected: Alternative,
	durationMs?: number,
): Promise<AnswerResult> {
	if (!ALTERNATIVE_ENUM.includes(selected)) {
		throw new Error(`Invalid alternative: ${selected}`);
	}

	return gradeAndRecordAnswer(questionId, selected, durationMs);
}

/** Fetches a balanced 60-question set for an exam simulation. */
export async function fetchExamQuestions(): Promise<ExamQuestion[]> {
	return getExamQuestions();
}

/** Creates the exam_simulations row and returns its ID. Call when the exam starts. */
export async function startExamSimulation(): Promise<number> {
	return startExamSession();
}

/**
 * Persists one submitted answer during an active exam.
 * Call immediately when the user clicks "Submit answer" on each question.
 */
export async function recordSingleExamAnswer(
	examSimulationId: number,
	questionId: number,
	selected: Alternative,
	durationMs: number,
): Promise<void> {
	if (!ALTERNATIVE_ENUM.includes(selected)) {
		throw new Error(`Invalid alternative: ${selected}`);
	}
	recordExamAnswer(examSimulationId, questionId, selected, durationMs);
}

/**
 * Grades the exam from persisted answers, updates the simulation row, and
 * returns the full result. Call when the user finishes or time expires.
 */
export async function finalizeExamSimulation(
	examSimulationId: number,
	totalExamTimeMs: number,
	completed: boolean,
): Promise<ExamGradeResult> {
	return finalizeExamSession(examSimulationId, totalExamTimeMs, completed);
}
