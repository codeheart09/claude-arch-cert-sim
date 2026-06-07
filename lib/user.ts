import type { User } from "../db/schema";
import {
	createUser as dbCreateUser,
	getUser as dbGetUser,
	resetUserData as dbResetUserData,
} from "../db/users";

export function getUser(): User | undefined {
	return dbGetUser();
}

export function createUser(name: string): User {
	return dbCreateUser(name);
}

export function resetUserData(): void {
	dbResetUserData();
}
