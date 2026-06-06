import { getDb } from "./drizzle";
import { type User, users } from "./schema";

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
