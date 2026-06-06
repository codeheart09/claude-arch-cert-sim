"use server";

import { refresh } from "next/cache";
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
