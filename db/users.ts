import { getDb } from "./drizzle";
import { type User, users } from "./schema";

export function getUser(): User | undefined {
	return getDb().select().from(users).limit(1).get();
}
