// cspell:ignore nmae ownr
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { type } from "arktype";
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { createCli } from "./createCli.ts";

const options = z.object({
	bandwidth: z.number().int().positive().default(6).describe("Max requests"),
	color: z.boolean().default(true),
	dryRun: z.boolean().default(false).meta({ short: "d" }),
	owner: z.string().describe("Repository owner"),
	reason: z.array(z.enum(["author", "subscribed"])).default(["subscribed"]),
});

const stdoutKeys = ["columns", "isTTY"] as const;

const originalStdout = stdoutKeys.map(
	(key) => [key, Object.getOwnPropertyDescriptor(process.stdout, key)] as const,
);

function setStdout(
	values: Partial<Pick<typeof process.stdout, "columns" | "isTTY">>,
) {
	for (const [key, value] of Object.entries(values)) {
		Object.defineProperty(process.stdout, key, {
			configurable: true,
			value,
			writable: true,
		});
	}
}

describe(createCli, () => {
	// Help text wraps when stdout is a TTY, so tests shouldn't depend on how they're run.
	beforeEach(() => {
		setStdout({ columns: 80, isTTY: false });
	});

	afterEach(() => {
		for (const [key, descriptor] of originalStdout) {
			if (descriptor) {
				Object.defineProperty(process.stdout, key, descriptor);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete process.stdout[key];
			}
		}
	});

	describe("flags", () => {
		it("includes option flags followed by built-in flags", () => {
			const cli = createCli({ name: "cli", options, version: "1.2.3" });

			expect(cli.flags.map((flag) => [flag.key, flag.short])).toEqual([
				["bandwidth", undefined],
				["color", undefined],
				["dryRun", "d"],
				["owner", undefined],
				["reason", undefined],
				["help", "h"],
				["version", "v"],
			]);
		});

		it("does not include a version flag when no version is given", () => {
			const cli = createCli({ name: "cli", options });

			expect(cli.flags.map((flag) => flag.key)).not.toContain("version");
		});

		it("does not include built-in flags when help is false and no version is given", () => {
			const cli = createCli({ help: false, name: "cli", options });

			expect(cli.flags.map((flag) => flag.key)).toEqual([
				"bandwidth",
				"color",
				"dryRun",
				"owner",
				"reason",
			]);
		});

		it("omits built-in short aliases when options already use them", () => {
			const cli = createCli({
				name: "cli",
				options: z.object({
					host: z.string().optional().meta({ short: "h" }),
					verbose: z.boolean().optional().meta({ short: "v" }),
				}),
				version: "1.2.3",
			});

			expect(cli.flags.slice(2)).toEqual([
				{
					description: "Show this help message",
					key: "help",
					kind: "boolean",
					multiple: false,
					required: false,
				},
				{
					description: "Show the version number",
					key: "version",
					kind: "boolean",
					multiple: false,
					required: false,
				},
			]);
		});
		it("omits built-in short aliases when they are disabled", () => {
			const cli = createCli({
				help: { short: false },
				name: "cli",
				options: z.object({}),
				version: { short: false, version: "1.2.3" },
			});

			expect(cli.flags.map((flag) => flag.short)).toEqual([
				undefined,
				undefined,
			]);
		});

		it("does not default the version short alias to one taken by the help flag", () => {
			const cli = createCli({
				help: { short: "v" },
				name: "cli",
				options: z.object({}),
				version: "1.2.3",
			});

			expect(cli.flags.map((flag) => [flag.key, flag.short])).toEqual([
				["help", "v"],
				["version", undefined],
			]);
		});

		it("uses a custom short alias when one is given even if an option uses it", () => {
			const cli = createCli({
				help: { short: "x" },
				name: "cli",
				options: z.object({ x: z.string().optional().meta({ short: "x" }) }),
			});

			expect(cli.flags.map((flag) => [flag.key, flag.short])).toEqual([
				["x", "x"],
				["help", "x"],
			]);
		});
	});

	describe("parse", () => {
		it("returns values with defaults applied when no args are given", async () => {
			const cli = createCli({
				name: "cli",
				options: options.partial({ owner: true }),
			});

			expect(await cli.parse([])).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: {
					bandwidth: 6,
					color: true,
					dryRun: false,
					reason: ["subscribed"],
				},
				warnings: [],
			});
		});

		it("returns converted values when args are given", async () => {
			const cli = createCli({ name: "cli", options });

			expect(
				await cli.parse([
					"--bandwidth=12",
					"--no-color",
					"-d",
					"--owner",
					"me",
					"--reason",
					"author",
					"--reason",
					"subscribed",
				]),
			).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: {
					bandwidth: 12,
					color: false,
					dryRun: true,
					owner: "me",
					reason: ["author", "subscribed"],
				},
				warnings: [],
			});
		});

		it("returns values when options are a record of schemas", async () => {
			const cli = createCli({
				name: "cli",
				options: {
					count: z.number().default(1),
					name: z.string(),
					pattern: z
						.string()
						.optional()
						.transform((value) => value && new RegExp(value)),
				},
			});

			expect(await cli.parse(["--name", "Josh", "--pattern", "^a"])).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: { count: 1, name: "Josh", pattern: /^a/ },
				warnings: [],
			});
		});

		it("returns values when options are a Valibot schema", async () => {
			const cli = createCli({
				name: "cli",
				options: toStandardJsonSchema(
					v.object({ count: v.optional(v.number(), 3), name: v.string() }),
				),
			});

			expect(await cli.parse(["--name", "Josh"])).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: { count: 3, name: "Josh" },
				warnings: [],
			});
		});

		it("returns values when options are an ArkType schema", async () => {
			const cli = createCli({
				name: "cli",
				options: type({ "count?": "number.integer", level: "'a' | 'b'" }),
			});

			expect(await cli.parse(["--count", "5", "--level", "a"])).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: { count: 5, level: "a" },
				warnings: [],
			});
		});

		it("returns help text when given --help", async () => {
			const cli = createCli({
				description: "Does things.",
				examples: ["cli --owner me"],
				footer: "Learn more at https://example.com",
				name: "cli",
				options,
				version: "1.2.3",
			});

			const result = await cli.parse(["--help"]);

			expect(result).toEqual({ text: cli.formatHelp(), type: "help" });
			expect(cli.formatHelp()).toMatchInlineSnapshot(`
				"Usage: cli [options]

				Does things.

				Options:
				      --bandwidth <integer>         Max requests (default: 6)
				      --[no-]color                  (default: true)
				  -d, --dryRun
				      --owner <string>              Repository owner (required)
				      --reason <author|subscribed>  (default: ["subscribed"], repeatable)
				  -h, --help                        Show this help message
				  -v, --version                     Show the version number

				Examples:
				  cli --owner me

				Learn more at https://example.com"
			`);
		});

		it("returns help text when given -h", async () => {
			const cli = createCli({ name: "cli", options });

			expect(await cli.parse(["-h"])).toEqual({
				text: cli.formatHelp(),
				type: "help",
			});
		});

		it("returns help text when given --help alongside invalid args", async () => {
			const cli = createCli({ name: "cli", options });

			expect(
				await cli.parse(["--bandwidth", "abc", "--unknown", "--help"]),
			).toEqual({ text: cli.formatHelp(), type: "help" });
		});

		it("does not return help text when given --help=false", async () => {
			const cli = createCli({ name: "cli", options });

			expect(await cli.parse(["--help=false", "--owner", "me"])).toMatchObject({
				type: "values",
			});
		});

		it("does not return help text when given --no-help", async () => {
			const cli = createCli({ name: "cli", options });

			expect(await cli.parse(["--no-help", "--owner", "me"])).toMatchObject({
				type: "values",
			});
		});

		it("does not add -h when an option uses it", async () => {
			const cli = createCli({
				name: "cli",
				options: z.object({ host: z.string().meta({ short: "h" }) }),
			});

			expect(await cli.parse(["-h", "localhost"])).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: { host: "localhost" },
				warnings: [],
			});
			expect(await cli.parse(["--help"])).toMatchObject({ type: "help" });
		});

		it("does not add a built-in help flag when an option is named help", async () => {
			const cli = createCli({
				name: "cli",
				options: z.object({ help: z.string().optional() }),
			});

			expect(await cli.parse(["--help", "me"])).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: { help: "me" },
				warnings: [],
			});
		});

		it("reports --help as unknown when help is false", async () => {
			const cli = createCli({ help: false, name: "cli", options });

			expect(await cli.parse(["--help", "--owner", "me"])).toEqual({
				issues: [
					{
						flag: "help",
						kind: "unknown",
						message: "Unknown flag: --help",
						suggestion: undefined,
					},
				],
				text: "Unknown flag: --help",
				type: "error",
			});
		});

		it("returns help text when --help follows a flag missing its value", async () => {
			const cli = createCli({ name: "cli", options });

			expect(await cli.parse(["--owner", "--help"])).toEqual({
				text: cli.formatHelp(),
				type: "help",
			});
		});

		it("returns help text when given a custom help short alias", async () => {
			const cli = createCli({
				help: { short: "?" },
				name: "cli",
				options: z.object({}),
			});

			expect(await cli.parse(["-?"])).toEqual({
				text: cli.formatHelp(),
				type: "help",
			});
		});

		it("returns the version when the version is given as an object", async () => {
			const cli = createCli({
				name: "cli",
				options: z.object({}),
				version: { version: "1.2.3" },
			});

			expect(await cli.parse(["-v"])).toEqual({
				text: "1.2.3",
				type: "version",
			});
		});

		it("returns the version when given --version", async () => {
			const cli = createCli({ name: "cli", options, version: "1.2.3" });

			expect(await cli.parse(["--version"])).toEqual({
				text: "1.2.3",
				type: "version",
			});
		});

		it("returns the version when given -v", async () => {
			const cli = createCli({ name: "cli", options, version: "1.2.3" });

			expect(await cli.parse(["-v"])).toEqual({
				text: "1.2.3",
				type: "version",
			});
		});

		it("returns help over the version when given both", async () => {
			const cli = createCli({ name: "cli", options, version: "1.2.3" });

			expect(await cli.parse(["-v", "-h"])).toMatchObject({ type: "help" });
		});

		it("does not add -v when an option uses it", async () => {
			const cli = createCli({
				name: "cli",
				options: z.object({
					verbose: z.boolean().default(false).meta({ short: "v" }),
				}),
				version: "1.2.3",
			});

			expect(await cli.parse(["-v"])).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: { verbose: true },
				warnings: [],
			});
			expect(await cli.parse(["--version"])).toEqual({
				text: "1.2.3",
				type: "version",
			});
		});

		it("does not add a built-in version flag when an option is named version", async () => {
			const cli = createCli({
				name: "cli",
				options: z.object({ version: z.string().optional() }),
				version: "1.2.3",
			});

			expect(await cli.parse(["--version", "2"])).toMatchObject({
				type: "values",
				values: { version: "2" },
			});
		});

		it("reports --version as unknown when no version is given", async () => {
			const cli = createCli({ name: "cli", options });

			expect(await cli.parse(["--version", "--owner", "me"])).toMatchObject({
				text: "Unknown flag: --version\nRun 'cli --help' for usage.",
				type: "error",
			});
		});

		it("returns an error with usage guidance when a parse issue occurs", async () => {
			const cli = createCli({ name: "cli", options });

			expect(await cli.parse(["--owner", "me", "--bandwidth", "abc"])).toEqual({
				issues: [
					{
						flag: "bandwidth",
						kind: "invalid",
						message: '--bandwidth: Expected a number, received "abc".',
					},
				],
				text: `--bandwidth: Expected a number, received "abc".\nRun 'cli --help' for usage.`,
				type: "error",
			});
		});

		it("omits usage guidance from errors when help is false", async () => {
			const cli = createCli({ help: false, name: "cli", options });

			expect(await cli.parse([])).toEqual({
				issues: [
					{ flag: "owner", kind: "missing", message: "--owner is required." },
				],
				text: "--owner is required.",
				type: "error",
			});
		});

		it("reports a required flag once when it is missing", async () => {
			const cli = createCli({ name: "cli", options });

			expect(await cli.parse([])).toEqual({
				issues: [
					{ flag: "owner", kind: "missing", message: "--owner is required." },
				],
				text: "--owner is required.\nRun 'cli --help' for usage.",
				type: "error",
			});
		});

		it("reports a required flag once when it is missing from a record of schemas", async () => {
			const cli = createCli({
				name: "cli",
				options: { name: z.string(), other: z.string() },
			});

			expect(await cli.parse(["--other", "x"])).toEqual({
				issues: [
					{ flag: "name", kind: "missing", message: "--name is required." },
				],
				text: "--name is required.\nRun 'cli --help' for usage.",
				type: "error",
			});
		});

		it("reports only the parse issue when a required flag is missing its value", async () => {
			const cli = createCli({ name: "cli", options });

			expect(await cli.parse(["--owner"])).toEqual({
				issues: [
					{
						flag: "owner",
						kind: "invalid",
						message: "--owner requires a value.",
					},
				],
				text: "--owner requires a value.\nRun 'cli --help' for usage.",
				type: "error",
			});
		});

		it("reports only the parse issue when a flag also fails schema validation", async () => {
			const cli = createCli({
				name: "cli",
				options: z.object({ count: z.number(), other: z.number().optional() }),
			});

			expect(await cli.parse(["--count", "abc", "--other=x"])).toEqual({
				issues: [
					{
						flag: "count",
						kind: "invalid",
						message: '--count: Expected a number, received "abc".',
					},
					{
						flag: "other",
						kind: "invalid",
						message: '--other: Expected a number, received "x".',
					},
				],
				text: [
					'--count: Expected a number, received "abc".',
					'--other: Expected a number, received "x".',
					"Run 'cli --help' for usage.",
				].join("\n"),
				type: "error",
			});
		});

		it("reports schema issues alongside parse issues for other flags", async () => {
			const cli = createCli({ name: "cli", options });

			const result = await cli.parse([
				"--bandwidth",
				"0",
				"--reason",
				"nope",
				"--ownr",
				"x",
				"stray",
			]);

			expect(result.type === "error" && result.text).toMatchInlineSnapshot(`
				"--reason: Expected "author" or "subscribed", received "nope".
				Unknown flag: --ownr (did you mean --owner?)
				Unexpected argument: stray
				--owner is required.
				--bandwidth: Too small: expected number to be >0
				Run 'cli --help' for usage."
			`);
		});

		it("reports a thrown transform error without a stack", async () => {
			const cli = createCli({
				name: "cli",
				options: z.object({
					pattern: z.string().transform((value) => new RegExp(value)),
				}),
			});

			expect(await cli.parse(["--pattern", "("])).toEqual({
				issues: [
					{
						kind: "validation",
						message: "Invalid regular expression: /(/: Unterminated group",
					},
				],
				text: [
					"Invalid regular expression: /(/: Unterminated group",
					"Run 'cli --help' for usage.",
				].join("\n"),
				type: "error",
			});
		});

		it("collects unknown flags when not strict", async () => {
			const cli = createCli({
				name: "cli",
				options: z.object({ name: z.string().optional() }),
				strict: false,
			});

			expect(await cli.parse(["--extra", "--name=x", "stray"])).toEqual({
				positionals: [],
				type: "values",
				unknown: { extra: true },
				values: { name: "x" },
				warnings: [],
			});
		});

		it("returns values with warnings when strict is warn", async () => {
			const cli = createCli({
				name: "cli",
				options: z.object({ name: z.string().optional() }),
				strict: "warn",
			});

			expect(await cli.parse(["--nmae=x", "stray"])).toEqual({
				positionals: [],
				type: "values",
				unknown: { nmae: "x" },
				values: {},
				warnings: [
					{
						flag: "nmae",
						kind: "unknown",
						message: "Unknown flag: --nmae",
						suggestion: "name",
					},
					{ kind: "unexpected", message: "Unexpected argument: stray" },
				],
			});
		});

		it("reports an issue for a flag missing its value and parses the next flag", async () => {
			const cli = createCli({
				name: "cli",
				options: z.object({ owner: z.string(), repository: z.string() }),
			});

			expect(await cli.parse(["--owner", "--repository", "b"])).toEqual({
				issues: [
					{
						flag: "owner",
						kind: "invalid",
						message: "--owner requires a value.",
					},
				],
				text: "--owner requires a value.\nRun 'cli --help' for usage.",
				type: "error",
			});
		});

		it("reports an unexpected positional when no positionals schema is given", async () => {
			const cli = createCli({ name: "cli", options: z.object({}) });

			expect(await cli.parse(["stray"])).toEqual({
				issues: [{ kind: "unexpected", message: "Unexpected argument: stray" }],
				text: "Unexpected argument: stray\nRun 'cli --help' for usage.",
				type: "error",
			});
		});

		it("returns validated positionals when a positionals schema is given", async () => {
			const cli = createCli({
				name: "cli",
				options: z.object({ verbose: z.boolean().default(false) }),
				positionals: z.tuple([z.number().int()], z.string()),
			});

			expect(await cli.parse(["3", "--verbose", "a", "b"])).toEqual({
				positionals: [3, "a", "b"],
				type: "values",
				unknown: {},
				values: { verbose: true },
				warnings: [],
			});
		});

		it("returns positional issues when positionals fail conversion or validation", async () => {
			const cli = createCli({
				name: "cli",
				options: z.object({}),
				positionals: z.array(z.number().positive()).min(1),
			});

			expect(await cli.parse(["0"])).toEqual({
				issues: [
					{
						kind: "validation",
						message: "Argument 1: Too small: expected number to be >0",
					},
				],
				text: [
					"Argument 1: Too small: expected number to be >0",
					"Run 'cli --help' for usage.",
				].join("\n"),
				type: "error",
			});
			expect(await cli.parse(["abc"])).toEqual({
				issues: [
					{
						kind: "invalid",
						message: 'Argument 1: Expected a number, received "abc".',
					},
					{
						kind: "validation",
						message: "Too small: expected array to have >=1 items",
					},
				],
				text: [
					'Argument 1: Expected a number, received "abc".',
					"Too small: expected array to have >=1 items",
					"Run 'cli --help' for usage.",
				].join("\n"),
				type: "error",
			});
		});
	});

	describe("formatHelp", () => {
		it("wraps descriptions to the terminal width when stdout is a TTY", () => {
			setStdout({ columns: 40, isTTY: true });

			const cli = createCli({
				help: false,
				name: "cli",
				options: z.object({
					cache: z
						.boolean()
						.optional()
						.describe("Whether to ignore any existing cache data on disk."),
				}),
			});

			expect(cli.formatHelp()).toMatchInlineSnapshot(`
				"Usage: cli [options]

				Options:
				  --cache  Whether to ignore any
				           existing cache data on disk."
			`);
		});

		it("includes the positionals placeholder when the positionals schema has one", () => {
			const cli = createCli({
				name: "cli",
				options: z.object({}),
				positionals: z.array(z.string()).meta({ placeholder: "files" }),
			});

			expect(cli.formatHelp()).toMatchInlineSnapshot(`
				"Usage: cli [options] [files...]

				Options:
				  -h, --help  Show this help message"
			`);
		});

		it("uses positionalsUsage over the placeholder when both are given", () => {
			const cli = createCli({
				name: "cli",
				options: z.object({}),
				positionals: z.array(z.string()).meta({ placeholder: "files" }),
				positionalsUsage: "<file> [more...]",
			});

			expect(cli.formatHelp()).toMatchInlineSnapshot(`
				"Usage: cli [options] <file> [more...]

				Options:
				  -h, --help  Show this help message"
			`);
		});

		it.each([
			[z.array(z.string()), "[args...]"],
			[z.array(z.string()).min(1), "<args...>"],
			[z.array(z.string()).max(1), "[args]"],
			[z.tuple([z.string()]), "<args>"],
			[z.tuple([z.string()], z.string()), "<args...>"],
			[z.array(z.string()).meta({ placeholder: "file" }).length(1), "<file>"],
		])(
			"derives the positionals usage from the schema's item limits",
			(positionals, expected) => {
				const cli = createCli({
					help: false,
					name: "cli",
					options: z.object({}),
					positionals,
				});

				expect(cli.formatHelp()).toBe(`Usage: cli ${expected}`);
			},
		);

		it("includes an arguments section when the positionals schema has a description", () => {
			const cli = createCli({
				name: "cli",
				options: z.object({ dryRun: z.boolean().default(false) }),
				positionals: z
					.array(z.string())
					.min(1)
					.meta({ description: "Files to check", placeholder: "files" }),
			});

			expect(cli.formatHelp()).toMatchInlineSnapshot(`
				"Usage: cli [options] <files...>

				Arguments:
				  <files...>  Files to check

				Options:
				      --dryRun
				  -h, --help    Show this help message"
			`);
		});

		it("uses the usage override in place of options and positionals when given", () => {
			const cli = createCli({
				name: "cli",
				options: z.object({ dryRun: z.boolean().default(false) }),
				positionals: z.array(z.string()),
				usage: "[--dryRun] [files...]",
			});

			expect(cli.formatHelp()).toMatchInlineSnapshot(`
				"Usage: cli [--dryRun] [files...]

				Options:
				      --dryRun
				  -h, --help    Show this help message"
			`);
		});

		it("uses custom descriptions and shorts when built-in flags are customized", () => {
			const cli = createCli({
				help: { description: "Print help", short: "?" },
				name: "cli",
				options: z.object({}),
				version: { description: "Print version", short: "V", version: "1.2.3" },
			});

			expect(cli.formatHelp()).toMatchInlineSnapshot(`
				"Usage: cli [options]

				Options:
				  -?, --help     Print help
				  -V, --version  Print version"
			`);
		});
	});

	describe("run", () => {
		afterEach(() => {
			process.exitCode = undefined;
		});

		it("returns the result without printing when values are parsed", async () => {
			const error = vi.fn();
			const log = vi.fn();
			const cli = createCli({ name: "cli", options });

			expect(await cli.run(["--owner", "me"], { error, log })).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: {
					bandwidth: 6,
					color: true,
					dryRun: false,
					owner: "me",
					reason: ["subscribed"],
				},
				warnings: [],
			});
			expect(error).not.toHaveBeenCalled();
			expect(log).not.toHaveBeenCalled();
			expect(process.exitCode).toBeUndefined();
		});

		it("logs help text and returns undefined when given --help", async () => {
			const error = vi.fn();
			const log = vi.fn();
			const cli = createCli({ name: "cli", options });

			expect(await cli.run(["--help"], { error, log })).toBeUndefined();
			expect(log).toHaveBeenCalledWith(cli.formatHelp());
			expect(error).not.toHaveBeenCalled();
			expect(process.exitCode).toBeUndefined();
		});

		it("logs the version and returns undefined when given --version", async () => {
			const error = vi.fn();
			const log = vi.fn();
			const cli = createCli({ name: "cli", options, version: "1.2.3" });

			expect(await cli.run(["--version"], { error, log })).toBeUndefined();
			expect(log).toHaveBeenCalledWith("1.2.3");
			expect(error).not.toHaveBeenCalled();
		});

		it("prints errors, sets the exit code, and returns undefined when args are invalid", async () => {
			const error = vi.fn();
			const log = vi.fn();
			const cli = createCli({ name: "cli", options });

			expect(await cli.run([], { error, log })).toBeUndefined();
			expect(error).toHaveBeenCalledWith(
				"--owner is required.\nRun 'cli --help' for usage.",
			);
			expect(log).not.toHaveBeenCalled();
			expect(process.exitCode).toBe(1);
		});

		it("sets the custom exit code when args are invalid and one is given", async () => {
			const error = vi.fn();
			const cli = createCli({ name: "cli", options });

			await cli.run([], { error, exitCode: 2 });

			expect(process.exitCode).toBe(2);
		});

		it("prints warnings and returns the result when strict is warn and there are warnings", async () => {
			const warn = vi.fn();
			const cli = createCli({
				name: "cli",
				options: z.object({}),
				strict: "warn",
			});

			expect(await cli.run(["--extra", "stray"], { warn })).toMatchObject({
				type: "values",
				unknown: { extra: true },
			});
			expect(warn).toHaveBeenCalledWith(
				"Unknown flag: --extra\nUnexpected argument: stray",
			);
			expect(process.exitCode).toBeUndefined();
		});

		it("does not print warnings when there are none", async () => {
			const warn = vi.fn();
			const cli = createCli({
				name: "cli",
				options: z.object({}),
				strict: "warn",
			});

			await cli.run([], { warn });

			expect(warn).not.toHaveBeenCalled();
		});

		it("prints with console methods looked up at print time by default", async () => {
			const cli = createCli({
				name: "cli",
				options,
				strict: "warn",
				version: "1.2.3",
			});
			const error = vi
				.spyOn(console, "error")
				.mockImplementation(() => undefined);
			const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
			const warn = vi
				.spyOn(console, "warn")
				.mockImplementation(() => undefined);

			await cli.run(["--version"]);
			await cli.run([]);
			await cli.run(["--owner", "me", "--extra"]);

			expect(log).toHaveBeenCalledWith("1.2.3");
			expect(error).toHaveBeenCalledWith(
				"--owner is required.\nRun 'cli --help' for usage.",
			);
			expect(warn).toHaveBeenCalledWith("Unknown flag: --extra");
		});
	});
});
