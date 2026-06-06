import type { User } from "../db/schema";
import { getUser as dbGetUser } from "../db/users";

export function getUser(): User | undefined {
	return dbGetUser();
}
