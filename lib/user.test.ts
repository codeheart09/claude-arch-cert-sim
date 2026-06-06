import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
}));

vi.mock("../db/users", () => ({
	getUser: mocks.getUser,
}));

async function loadSubject() {
	return import("./user");
}

describe("getUser", () => {
	beforeEach(() => {
		vi.resetModules();
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
});
