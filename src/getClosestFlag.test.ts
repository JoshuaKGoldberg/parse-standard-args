// cspell:ignore bandwith bdwith bndwith colour dryrun repo watc
import { describe, expect, it } from "vitest";

import { getClosestFlag } from "./getClosestFlag.ts";

describe(getClosestFlag, () => {
	it("returns undefined when there are no known flags", () => {
		expect(getClosestFlag("watch", [])).toBeUndefined();
	});

	it("returns the known flag when it is one edit away", () => {
		expect(getClosestFlag("watc", ["auth", "watch"])).toBe("watch");
	});

	it("returns the known flag when it differs only by case", () => {
		expect(getClosestFlag("dryrun", ["dryRun"])).toBe("dryRun");
	});

	it("returns the camelCase flag when given its kebab-case equivalent", () => {
		expect(getClosestFlag("dry-run", ["dryRun"])).toBe("dryRun");
	});

	it("returns the known flag when it is two edits away from a long flag", () => {
		expect(getClosestFlag("bandwith", ["bandwidth"])).toBe("bandwidth");
		expect(getClosestFlag("bndwith", ["bandwidth"])).toBe("bandwidth");
	});

	it("returns undefined when the closest flag is more than two edits away", () => {
		expect(getClosestFlag("bdwith", ["bandwidth"])).toBeUndefined();
	});

	it("allows only one edit when the flag is short", () => {
		expect(getClosestFlag("ab", ["a"])).toBe("a");
		expect(getClosestFlag("abc", ["a"])).toBeUndefined();
	});

	it("returns undefined when the flag is a single character", () => {
		expect(getClosestFlag("d", ["id", "d"])).toBeUndefined();
	});

	it("returns the known flag when the flag is the only one it abbreviates", () => {
		expect(getClosestFlag("repo", ["owner", "repository"])).toBe("repository");
	});

	it("returns the known flag when the flag abbreviates it in a different case", () => {
		expect(getClosestFlag("REPO", ["repository"])).toBe("repository");
	});

	it("returns undefined when the flag abbreviates multiple known flags", () => {
		expect(getClosestFlag("repo", ["repository", "reporter"])).toBeUndefined();
	});

	it("prefers a close known flag over an abbreviated one", () => {
		expect(getClosestFlag("repos", ["repository", "repo"])).toBe("repo");
	});

	it("returns the closest of multiple nearby known flags", () => {
		expect(getClosestFlag("colour", ["colors", "colour1", "color"])).toBe(
			"colour1",
		);
	});

	it("returns the first known flag when multiple are equally close", () => {
		expect(getClosestFlag("cat", ["bat", "hat"])).toBe("bat");
	});
});
