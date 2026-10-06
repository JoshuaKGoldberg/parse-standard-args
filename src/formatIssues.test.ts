// cspell:ignore wacth
import { describe, expect, it } from "vitest";

import { formatIssue, formatIssues } from "./formatIssues.ts";

describe(formatIssue, () => {
	it("returns the message when there is no suggestion", () => {
		expect(
			formatIssue({ flag: "x", kind: "missing", message: "--x is required." }),
		).toBe("--x is required.");
	});

	it("appends the suggestion when there is one", () => {
		expect(
			formatIssue({
				flag: "wacth",
				kind: "unknown",
				message: "Unknown flag: --wacth",
				suggestion: "watch",
			}),
		).toBe("Unknown flag: --wacth (did you mean --watch?)");
	});
});

describe(formatIssues, () => {
	it("returns an empty string when there are no issues", () => {
		expect(formatIssues([])).toBe("");
	});

	it("puts each issue on its own line", () => {
		expect(
			formatIssues([
				{
					flag: "wacth",
					kind: "unknown",
					message: "Unknown flag: --wacth",
					suggestion: "watch",
				},
				{ kind: "unexpected", message: "Unexpected argument: stray" },
				{ flag: "x", kind: "missing", message: "--x is required." },
			]),
		).toMatchInlineSnapshot(`
			"Unknown flag: --wacth (did you mean --watch?)
			Unexpected argument: stray
			--x is required."
		`);
	});
});
