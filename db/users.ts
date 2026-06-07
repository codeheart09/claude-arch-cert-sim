import { getDb } from "./drizzle";
import {
	aiConversationMessages,
	aiConversations,
	answers,
	examSimulations,
	type User,
	users,
} from "./schema";

export function getUser(): User | undefined {
	return getDb().select().from(users).limit(1).get();
}

export function createUser(name: string): User {
	const user = getDb().insert(users).values({ name }).returning().get();

	if (!user) {
		throw new Error("Failed to create local user.");
	}

	return user;
}

/** Wipes all user progress. Deletes in FK order to avoid constraint violations. */
export function resetUserData(): void {
	const db = getDb();
	db.delete(aiConversationMessages).run();
	db.delete(aiConversations).run();
	db.delete(answers).run();
	db.delete(examSimulations).run();
	db.delete(users).run();
}
