"use server";

import { refresh } from "next/cache";
import { ALTERNATIVE_ENUM, type Alternative } from "@/db/schema";
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
): Promise<AnswerResult> {
	if (!ALTERNATIVE_ENUM.includes(selected)) {
		throw new Error(`Invalid alternative: ${selected}`);
	}

	return gradeAndRecordAnswer(questionId, selected);
}
