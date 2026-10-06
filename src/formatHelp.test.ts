import { describe, expect, it } from "vitest";
import * as z from "zod";

import type { FlagDescriptor, FlagKind } from "./types.ts";

import { describeOptions } from "./describeOptions.ts";
import {
	formatFlagDescription,
	formatFlagType,
	formatFlagUsage,
	formatHelp,
} from "./formatHelp.ts";

function createFlag(
	key: string,
	kind: FlagKind,
	overrides: Partial<FlagDescriptor> = {},
): FlagDescriptor {
	return { key, kind, multiple: false, required: false, ...overrides };
}

describe(formatHelp, () => {
	it("formats all sections when given a representative CLI", () => {
		const flags = describeOptions(
			z.object({
				auth: z
					.string()
					.optional()
					.describe("GitHub auth token")
					.meta({ defaultDescription: "process.env.GH_TOKEN" }),
				bandwidth: z
					.number()
					.int()
					.default(6)
					.describe("Maximum parallel requests"),
				color: z.boolean().default(true).describe("Whether to use color"),
				dryRun: z
					.boolean()
					.default(false)
					.describe("Log without changing anything")
					.meta({ short: "d" }),
				labels: z.array(z.object({ name: z.string() })).optional(),
				owner: z.string().describe("Repository owner"),
				reason: z
					.array(z.enum(["author", "subscribed"]))
					.default(["subscribed"]),
				secret: z.string().optional().meta({ hidden: true }),
				title: z
					.array(z.string())
					.optional()
					.describe("Title regex(es)")
					.meta({ placeholder: "regex", short: "t" }),
			}),
		);

		expect(
			formatHelp({
				description: "Prunes GitHub notifications.",
				examples: [
					"prune-github-notifications --owner me",
					"prune-github-notifications --owner me --dryRun",
				],
				flags,
				footer: "Docs: https://example.com",
				name: "prune-github-notifications",
				positionals: { description: "Files to check", usage: "<files...>" },
			}),
		).toMatchInlineSnapshot(`
			"Usage: prune-github-notifications [options] <files...>

			Prunes GitHub notifications.

			Arguments:
			  <files...>  Files to check

			Options:
			      --auth <string>               GitHub auth token (default: process.env.GH_TOKEN)
			      --bandwidth <integer>         Maximum parallel requests (default: 6)
			      --[no-]color                  Whether to use color (default: true)
			  -d, --dryRun                      Log without changing anything
			      --labels <json>               (repeatable)
			      --owner <string>              Repository owner (required)
			      --reason <author|subscribed>  (default: ["subscribed"], repeatable)
			  -t, --title <regex>               Title regex(es) (repeatable)

			Examples:
			  prune-github-notifications --owner me
			  prune-github-notifications --owner me --dryRun

			Docs: https://example.com"
		`);
	});

	it("does not indent flags when none have a short alias", () => {
		expect(
			formatHelp({
				flags: [
					createFlag("count", "number", { description: "How many" }),
					createFlag("verbose", "boolean", { description: "Log more" }),
				],
				name: "cli",
			}),
		).toMatchInlineSnapshot(`
			"Usage: cli [options]

			Options:
			  --count <number>  How many
			  --verbose         Log more"
		`);
	});

	it("indents flags without a short alias when any visible flag has one", () => {
		expect(
			formatHelp({
				flags: [
					createFlag("count", "number"),
					createFlag("verbose", "boolean", { short: "v" }),
				],
				name: "cli",
			}),
		).toMatchInlineSnapshot(`
			"Usage: cli [options]

			Options:
			      --count <number>
			  -v, --verbose"
		`);
	});

	it("does not indent flags when only a hidden flag has a short alias", () => {
		expect(
			formatHelp({
				flags: [
					createFlag("count", "number"),
					createFlag("secret", "string", { hidden: true, short: "s" }),
				],
				name: "cli",
			}),
		).toMatchInlineSnapshot(`
			"Usage: cli [options]

			Options:
			  --count <number>"
		`);
	});

	it("omits the options section when all flags are hidden", () => {
		expect(
			formatHelp({
				description: "Does a thing.",
				flags: [createFlag("secret", "string", { hidden: true })],
				name: "cli",
			}),
		).toMatchInlineSnapshot(`
			"Usage: cli

			Does a thing."
		`);
	});

	it("uses the usage override in place of options and positionals when given", () => {
		expect(
			formatHelp({
				flags: [createFlag("dryRun", "boolean")],
				name: "cli",
				positionals: { description: "Files", usage: "<files...>" },
				usage: "[--dryRun] <files...>",
			}),
		).toMatchInlineSnapshot(`
			"Usage: cli [--dryRun] <files...>

			Arguments:
			  <files...>  Files

			Options:
			  --dryRun"
		`);
	});

	it("does not include an arguments section when positionals have no description", () => {
		expect(
			formatHelp({
				flags: [],
				name: "cli",
				positionals: { usage: "[args...]" },
			}),
		).toBe("Usage: cli [args...]");
	});

	it("formats only the usage when there is nothing else", () => {
		expect(formatHelp({ flags: [], name: "cli" })).toBe("Usage: cli");
	});

	it("includes positionals in the usage when there are no flags", () => {
		expect(
			formatHelp({
				examples: [],
				flags: [],
				name: "cli",
				positionals: { usage: "<file>" },
			}),
		).toBe("Usage: cli <file>");
	});

	it("wraps long descriptions with a hanging indent when given a width", () => {
		expect(
			formatHelp({
				flags: [
					createFlag("cache", "boolean", {
						description:
							"Whether to ignore any existing cache data on disk, re-linting all files.",
					}),
				],
				name: "cli",
				width: 40,
			}),
		).toMatchInlineSnapshot(`
			"Usage: cli [options]

			Options:
			  --cache  Whether to ignore any
			           existing cache data on disk,
			           re-linting all files."
		`);
	});

	it("does not wrap descriptions when the width leaves too little room", () => {
		const description = "Whether to ignore any existing cache data on disk.";

		expect(
			formatHelp({
				flags: [createFlag("cache", "boolean", { description })],
				name: "cli",
				width: 20,
			}),
		).toContain(`--cache  ${description}`);
	});

	it("does not wrap descriptions that already fit within the width", () => {
		expect(
			formatHelp({
				flags: [createFlag("cache", "boolean", { description: "Short." })],
				name: "cli",
				width: 80,
			}),
		).toContain("--cache  Short.");
	});
});

describe(formatFlagUsage, () => {
	it("indents the flag when it has no short alias and alignment is on by default", () => {
		expect(formatFlagUsage(createFlag("name", "string"))).toBe(
			"    --name <string>",
		);
	});

	it("does not indent the flag when it has no short alias and alignment is off", () => {
		expect(formatFlagUsage(createFlag("name", "string"), false)).toBe(
			"--name <string>",
		);
	});

	it("includes the short alias when the flag has one", () => {
		expect(formatFlagUsage(createFlag("name", "string", { short: "n" }))).toBe(
			"-n, --name <string>",
		);
	});

	it("does not include a value when the flag is a boolean", () => {
		expect(formatFlagUsage(createFlag("dryRun", "boolean"), false)).toBe(
			"--dryRun",
		);
	});

	it("does not include [no-] when the boolean defaults to false", () => {
		expect(
			formatFlagUsage(
				createFlag("dryRun", "boolean", { default: false }),
				false,
			),
		).toBe("--dryRun");
	});

	it("includes [no-] when the boolean defaults to true", () => {
		expect(
			formatFlagUsage(createFlag("color", "boolean", { default: true }), false),
		).toBe("--[no-]color");
	});

	it("uses the kind as the value name when there is no placeholder or choices", () => {
		expect(formatFlagUsage(createFlag("count", "integer"), false)).toBe(
			"--count <integer>",
		);
		expect(formatFlagUsage(createFlag("config", "json"), false)).toBe(
			"--config <json>",
		);
	});

	it("uses the choices as the value name when the flag has choices", () => {
		expect(
			formatFlagUsage(
				createFlag("level", "string", { choices: ["low", "high"] }),
				false,
			),
		).toBe("--level <low|high>");
	});

	it("formats non-string choices as JSON when the flag has them", () => {
		expect(
			formatFlagUsage(createFlag("size", "number", { choices: [1, 2] }), false),
		).toBe("--size <1|2>");
	});

	it("uses the placeholder as the value name when the flag has one", () => {
		expect(
			formatFlagUsage(
				createFlag("level", "string", {
					choices: ["low", "high"],
					placeholder: "level",
				}),
				false,
			),
		).toBe("--level <level>");
	});
});

describe(formatFlagDescription, () => {
	it("returns an empty string when the flag has no description or details", () => {
		expect(formatFlagDescription(createFlag("name", "string"))).toBe("");
	});

	it("returns the description when the flag has no details", () => {
		expect(
			formatFlagDescription(
				createFlag("name", "string", { description: "Your name" }),
			),
		).toBe("Your name");
	});

	it("includes required when the flag is required", () => {
		expect(
			formatFlagDescription(
				createFlag("name", "string", {
					description: "Your name",
					required: true,
				}),
			),
		).toBe("Your name (required)");
	});

	it("includes the default when the flag has one", () => {
		expect(
			formatFlagDescription(createFlag("count", "number", { default: 6 })),
		).toBe("(default: 6)");
	});

	it("includes a string default without quotes when the flag has one", () => {
		expect(
			formatFlagDescription(createFlag("name", "string", { default: "Josh" })),
		).toBe("(default: Josh)");
	});

	it("includes a non-string default as JSON when the flag has one", () => {
		expect(
			formatFlagDescription(
				createFlag("tags", "string", { default: ["a", "b"], multiple: true }),
			),
		).toBe('(default: ["a","b"], repeatable)');
	});

	it("does not include the default when the flag is a boolean defaulting to false", () => {
		expect(
			formatFlagDescription(
				createFlag("dryRun", "boolean", { default: false }),
			),
		).toBe("");
	});

	it("includes the default when the flag is a boolean defaulting to true", () => {
		expect(
			formatFlagDescription(createFlag("color", "boolean", { default: true })),
		).toBe("(default: true)");
	});

	it("does not include the default when it is an empty array", () => {
		expect(
			formatFlagDescription(
				createFlag("tags", "string", { default: [], multiple: true }),
			),
		).toBe("(repeatable)");
	});

	it("includes a false default when the flag is not a boolean", () => {
		expect(
			formatFlagDescription(createFlag("config", "json", { default: false })),
		).toBe("(default: false)");
	});

	it("uses the default description over the default when the flag has both", () => {
		expect(
			formatFlagDescription(
				createFlag("auth", "string", {
					default: "abc",
					defaultDescription: "process.env.GH_TOKEN",
				}),
			),
		).toBe("(default: process.env.GH_TOKEN)");
	});

	it("includes the default description when the boolean defaults to false", () => {
		expect(
			formatFlagDescription(
				createFlag("ci", "boolean", {
					default: false,
					defaultDescription: "process.env.CI",
				}),
			),
		).toBe("(default: process.env.CI)");
	});

	it("includes all details in order when the flag has them all", () => {
		expect(
			formatFlagDescription(
				createFlag("tags", "string", {
					defaultDescription: "none",
					description: "Tags",
					multiple: true,
					required: true,
				}),
			),
		).toBe("Tags (required, default: none, repeatable)");
	});
});

describe(formatFlagType, () => {
	it("returns the kind when the flag has no choices", () => {
		expect(formatFlagType(createFlag("count", "integer"))).toBe("integer");
	});

	it("returns an array of the kind when the flag is multiple", () => {
		expect(
			formatFlagType(createFlag("tags", "string", { multiple: true })),
		).toBe("string[]");
	});

	it("returns a union of choices when the flag has choices", () => {
		expect(
			formatFlagType(createFlag("level", "string", { choices: ["low", 1] })),
		).toBe('"low" | 1');
	});

	it("returns a parenthesized array of choices when the flag is multiple with choices", () => {
		expect(
			formatFlagType(
				createFlag("level", "string", {
					choices: ["low", "high"],
					multiple: true,
				}),
			),
		).toBe('("low" | "high")[]');
	});

	it("returns an array of the single choice when the flag is multiple with one choice", () => {
		expect(
			formatFlagType(
				createFlag("level", "string", { choices: ["low"], multiple: true }),
			),
		).toBe('"low"[]');
	});
});
