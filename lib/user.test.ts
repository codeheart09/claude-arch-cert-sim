import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createUser: vi.fn(),
	getUser: vi.fn(),
}));

vi.mock("../db/users", () => ({
	createUser: mocks.createUser,
	getUser: mocks.getUser,
}));

async function loadSubject() {
	return import("./user");
}

describe("getUser", () => {
	beforeEach(() => {
		vi.resetModules();
		mocks.createUser.mockReset();
		mocks.getUser.mockReset();
	});

	it("returns the user from the DB layer", async () => {
		const { getUser } = await loadSubject();
		const user = {
			id: 1,
			name: "Local learner",
			createdAt: new Date("2026-06-06T12:00:00.000Z"),
		};
		mocks.getUser.mockReturnValue(user);

		const result = getUser();

		expect(mocks.getUser).toHaveBeenCalledTimes(1);
		expect(result).toBe(user);
	});

	it("returns undefined when no local user exists", async () => {
		const { getUser } = await loadSubject();
		mocks.getUser.mockReturnValue(undefined);

		const result = getUser();

		expect(mocks.getUser).toHaveBeenCalledTimes(1);
		expect(result).toBeUndefined();
	});

	it("creates a user through the DB layer", async () => {
		const { createUser } = await loadSubject();
		const user = {
			id: 1,
			name: "Ada Lovelace",
			createdAt: new Date("2026-06-06T12:00:00.000Z"),
		};
		mocks.createUser.mockReturnValue(user);

		const result = createUser("Ada Lovelace");

		expect(mocks.createUser).toHaveBeenCalledWith("Ada Lovelace");
		expect(result).toBe(user);
	});
});
