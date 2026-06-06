import type { User } from "../db/schema";
import { createUser as dbCreateUser, getUser as dbGetUser } from "../db/users";

export function getUser(): User | undefined {
	return dbGetUser();
}

export function createUser(name: string): User {
	return dbCreateUser(name);
}
