// cspell:ignore nmae ownr
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { type } from "arktype";
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as z from "zod";

import type { ArgsSchema, OptionsDefinition } from "./types.ts";

import { type CliSettings, parseStandardArgv } from "./parseStandardArgv.ts";

const options = z.object({
	bandwidth: z.number().int().positive().default(6).describe("Max requests"),
	color: z.boolean().default(true),
	dryRun: z.boolean().default(false).meta({ short: "d" }),
	owner: z.string().describe("Repository owner"),
	reason: z.array(z.enum(["author", "subscribed"])).default(["subscribed"]),
});

function getHelpText(
	settings: CliSettings<OptionsDefinition, ArgsSchema | undefined>,
) {
	const result = parseStandardArgv(["--help"], settings);

	return result.type === "help" ? result.text : undefined;
}

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

describe(parseStandardArgv, () => {
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

	describe("built-in flags", () => {
		it("lists option flags followed by built-in flags in help text", () => {
			expect(getHelpText({ name: "cli", options, version: "1.2.3" }))
				.toMatchInlineSnapshot(`
				"Usage: cli [options]

				Options:
				      --bandwidth <integer>         Max requests (default: 6)
				      --[no-]color                  (default: true)
				  -d, --dryRun
				      --owner <string>              Repository owner (required)
				      --reason <author|subscribed>  (default: ["subscribed"], repeatable)
				  -h, --help                        Show this help message
				  -v, --version                     Show the version number"
			`);
		});

		it("does not include a version flag when no version is given", () => {
			expect(getHelpText({ name: "cli", options })).not.toContain("--version");
		});

		it("omits built-in short aliases when options already use them", () => {
			expect(
				getHelpText({
					name: "cli",
					options: z.object({
						host: z.string().optional().meta({ short: "h" }),
						verbose: z.boolean().optional().meta({ short: "v" }),
					}),
					version: "1.2.3",
				}),
			).toMatchInlineSnapshot(`
				"Usage: cli [options]

				Options:
				  -h, --host <string>
				  -v, --verbose
				      --help           Show this help message
				      --version        Show the version number"
			`);
		});

		it("omits built-in short aliases when they are disabled", () => {
			expect(
				getHelpText({
					help: { short: false },
					name: "cli",
					options: z.object({}),
					version: { short: false, version: "1.2.3" },
				}),
			).toMatchInlineSnapshot(`
				"Usage: cli [options]

				Options:
				  --help     Show this help message
				  --version  Show the version number"
			`);
		});

		it("does not default the version short alias to one taken by the help flag", () => {
			expect(
				getHelpText({
					help: { short: "v" },
					name: "cli",
					options: z.object({}),
					version: "1.2.3",
				}),
			).toMatchInlineSnapshot(`
				"Usage: cli [options]

				Options:
				  -v, --help     Show this help message
				      --version  Show the version number"
			`);
		});

		it("throws a TypeError when a built-in flag's custom short alias is used by an option", () => {
			expect(() =>
				parseStandardArgv([], {
					help: { short: "x" },
					name: "cli",
					options: z.object({ x: z.string().optional().meta({ short: "x" }) }),
				}),
			).toThrow(
				new TypeError("--x and --help can't both use the short alias -x."),
			);
		});

		it("throws a TypeError when two options use the same short alias", () => {
			expect(() =>
				parseStandardArgv([], {
					name: "cli",
					options: z.object({
						a: z.boolean().optional().meta({ short: "q" }),
						b: z.string().optional().meta({ short: "q" }),
					}),
				}),
			).toThrow(
				new TypeError("--a and --b can't both use the short alias -q."),
			);
		});

		it("throws a TypeError when the built-in flags' custom short aliases are the same", () => {
			expect(() =>
				parseStandardArgv([], {
					help: { short: "x" },
					name: "cli",
					options: z.object({}),
					version: { short: "x", version: "1.2.3" },
				}),
			).toThrow(
				new TypeError(
					"--help and --version can't both use the short alias -x.",
				),
			);
		});

		it.each(["ab", ""])(
			"throws a TypeError when a short alias is %j",
			(short) => {
				expect(() =>
					parseStandardArgv([], {
						name: "cli",
						options: z.object({ all: z.boolean().optional().meta({ short }) }),
					}),
				).toThrow(
					new TypeError(
						`--all's short alias must be a single character, but it's "${short}".`,
					),
				);
			},
		);
	});

	describe("parse", () => {
		it("returns values with defaults applied when no args are given", () => {
			expect(
				parseStandardArgv([], {
					name: "cli",
					options: options.partial({ owner: true }),
				}),
			).toEqual({
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

		it("returns converted values when args are given", () => {
			expect(
				parseStandardArgv(
					[
						"--bandwidth=12",
						"--no-color",
						"-d",
						"--owner",
						"me",
						"--reason",
						"author",
						"--reason",
						"subscribed",
					],
					{ name: "cli", options },
				),
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

		it("returns values when options are a record of schemas", () => {
			expect(
				parseStandardArgv(["--name", "Josh", "--pattern", "^a"], {
					name: "cli",
					options: {
						count: z.number().default(1),
						name: z.string(),
						pattern: z
							.string()
							.optional()
							.transform((value) => value && new RegExp(value)),
					},
				}),
			).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: { count: 1, name: "Josh", pattern: /^a/ },
				warnings: [],
			});
		});

		it("returns values when options are a Valibot schema", () => {
			expect(
				parseStandardArgv(["--name", "Josh"], {
					name: "cli",
					options: toStandardJsonSchema(
						v.object({ count: v.optional(v.number(), 3), name: v.string() }),
					),
				}),
			).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: { count: 3, name: "Josh" },
				warnings: [],
			});
		});

		it("returns values when options are an ArkType schema", () => {
			expect(
				parseStandardArgv(["--count", "5", "--level", "a"], {
					name: "cli",
					options: type({ "count?": "number.integer", level: "'a' | 'b'" }),
				}),
			).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: { count: 5, level: "a" },
				warnings: [],
			});
		});

		it("returns help text when given --help", () => {
			const result = parseStandardArgv(["--help"], {
				description: "Does things.",
				examples: ["cli --owner me"],
				footer: "Learn more at https://example.com",
				name: "cli",
				options,
				version: "1.2.3",
			});

			expect(result.type).toBe("help");
			expect(result.type === "help" && result.text).toMatchInlineSnapshot(`
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

		it("returns help text when given -h", () => {
			const parse = (args: string[]) =>
				parseStandardArgv(args, { name: "cli", options });

			expect(parse(["-h"])).toEqual(parse(["--help"]));
		});

		it("returns help text when given --help alongside invalid args", () => {
			const parse = (args: string[]) =>
				parseStandardArgv(args, { name: "cli", options });

			expect(parse(["--bandwidth", "abc", "--unknown", "--help"])).toEqual(
				parse(["--help"]),
			);
		});

		it("does not return help text when given --help=false", () => {
			expect(
				parseStandardArgv(["--help=false", "--owner", "me"], {
					name: "cli",
					options,
				}),
			).toMatchObject({
				type: "values",
			});
		});

		it("does not return help text when given --no-help", () => {
			expect(
				parseStandardArgv(["--no-help", "--owner", "me"], {
					name: "cli",
					options,
				}),
			).toMatchObject({
				type: "values",
			});
		});

		it("does not add -h when an option uses it", () => {
			const parse = (args: string[]) =>
				parseStandardArgv(args, {
					name: "cli",
					options: z.object({ host: z.string().meta({ short: "h" }) }),
				});

			expect(parse(["-h", "localhost"])).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: { host: "localhost" },
				warnings: [],
			});
			expect(parse(["--help"])).toMatchObject({ type: "help" });
		});

		it("does not add a built-in help flag when an option is named help", () => {
			expect(
				parseStandardArgv(["--help", "me"], {
					name: "cli",
					options: z.object({ help: z.string().optional() }),
				}),
			).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: { help: "me" },
				warnings: [],
			});
		});

		it("reports --help as unknown when help is false", () => {
			expect(
				parseStandardArgv(["--help", "--owner", "me"], {
					help: false,
					name: "cli",
					options,
				}),
			).toEqual({
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
				warnings: [],
			});
		});

		it("returns help text when --help follows a flag missing its value", () => {
			const parse = (args: string[]) =>
				parseStandardArgv(args, { name: "cli", options });

			expect(parse(["--owner", "--help"])).toEqual(parse(["--help"]));
		});

		it("returns help text when given a custom help short alias", () => {
			const parse = (args: string[]) =>
				parseStandardArgv(args, {
					help: { short: "?" },
					name: "cli",
					options: z.object({}),
				});

			expect(parse(["-?"])).toEqual(parse(["--help"]));
		});

		it("returns the version when the version is given as an object", () => {
			expect(
				parseStandardArgv(["-v"], {
					name: "cli",
					options: z.object({}),
					version: { version: "1.2.3" },
				}),
			).toEqual({
				text: "1.2.3",
				type: "version",
			});
		});

		it("returns the version when given --version", () => {
			expect(
				parseStandardArgv(["--version"], {
					name: "cli",
					options,
					version: "1.2.3",
				}),
			).toEqual({
				text: "1.2.3",
				type: "version",
			});
		});

		it("returns the version when given -v", () => {
			expect(
				parseStandardArgv(["-v"], {
					name: "cli",
					options,
					version: "1.2.3",
				}),
			).toEqual({
				text: "1.2.3",
				type: "version",
			});
		});

		it("returns help over the version when given both", () => {
			expect(
				parseStandardArgv(["-v", "-h"], {
					name: "cli",
					options,
					version: "1.2.3",
				}),
			).toMatchObject({ type: "help" });
		});

		it("does not add -v when an option uses it", () => {
			const parse = (args: string[]) =>
				parseStandardArgv(args, {
					name: "cli",
					options: z.object({
						verbose: z.boolean().default(false).meta({ short: "v" }),
					}),
					version: "1.2.3",
				});

			expect(parse(["-v"])).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: { verbose: true },
				warnings: [],
			});
			expect(parse(["--version"])).toEqual({
				text: "1.2.3",
				type: "version",
			});
		});

		it("does not add a built-in version flag when an option is named version", () => {
			expect(
				parseStandardArgv(["--version", "2"], {
					name: "cli",
					options: z.object({ version: z.string().optional() }),
					version: "1.2.3",
				}),
			).toMatchObject({
				type: "values",
				values: { version: "2" },
			});
		});

		it("reports --version as unknown when no version is given", () => {
			expect(
				parseStandardArgv(["--version", "--owner", "me"], {
					name: "cli",
					options,
				}),
			).toMatchObject({
				text: "Unknown flag: --version\nRun 'cli --help' for usage.",
				type: "error",
				warnings: [],
			});
		});

		it("returns an error with usage guidance when a parse issue occurs", () => {
			expect(
				parseStandardArgv(["--owner", "me", "--bandwidth", "abc"], {
					name: "cli",
					options,
				}),
			).toEqual({
				issues: [
					{
						flag: "bandwidth",
						kind: "invalid",
						message: '--bandwidth: Expected a number, received "abc".',
					},
				],
				text: `--bandwidth: Expected a number, received "abc".\nRun 'cli --help' for usage.`,
				type: "error",
				warnings: [],
			});
		});

		it("omits usage guidance from errors when help is false", () => {
			expect(
				parseStandardArgv([], { help: false, name: "cli", options }),
			).toEqual({
				issues: [
					{ flag: "owner", kind: "missing", message: "--owner is required." },
				],
				text: "--owner is required.",
				type: "error",
				warnings: [],
			});
		});

		it("reports a required flag once when it is missing", () => {
			expect(parseStandardArgv([], { name: "cli", options })).toEqual({
				issues: [
					{ flag: "owner", kind: "missing", message: "--owner is required." },
				],
				text: "--owner is required.\nRun 'cli --help' for usage.",
				type: "error",
				warnings: [],
			});
		});

		it("reports a required flag once when it is missing from a record of schemas", () => {
			expect(
				parseStandardArgv(["--other", "x"], {
					name: "cli",
					options: { name: z.string(), other: z.string() },
				}),
			).toEqual({
				issues: [
					{ flag: "name", kind: "missing", message: "--name is required." },
				],
				text: "--name is required.\nRun 'cli --help' for usage.",
				type: "error",
				warnings: [],
			});
		});

		it("reports only the parse issue when a required flag is missing its value", () => {
			expect(parseStandardArgv(["--owner"], { name: "cli", options })).toEqual({
				issues: [
					{
						flag: "owner",
						kind: "invalid",
						message: "--owner requires a value.",
					},
				],
				text: "--owner requires a value.\nRun 'cli --help' for usage.",
				type: "error",
				warnings: [],
			});
		});

		it("reports only the parse issue when a flag also fails schema validation", () => {
			expect(
				parseStandardArgv(["--count", "abc", "--other=x"], {
					name: "cli",
					options: z.object({
						count: z.number(),
						other: z.number().optional(),
					}),
				}),
			).toEqual({
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
				warnings: [],
			});
		});

		it("reports schema issues alongside parse issues for other flags", () => {
			const result = parseStandardArgv(
				["--bandwidth", "0", "--reason", "nope", "--ownr", "x", "stray"],
				{ name: "cli", options },
			);

			expect(result.type === "error" && result.text).toMatchInlineSnapshot(`
				"--reason: Expected "author" or "subscribed", received "nope".
				Unknown flag: --ownr (did you mean --owner?)
				Unexpected argument: stray
				--owner is required.
				--bandwidth: Too small: expected number to be >0
				Run 'cli --help' for usage."
			`);
		});

		it("throws a TypeError when a Zod transform throws", () => {
			expect(() =>
				parseStandardArgv(["--pattern", "("], {
					name: "cli",
					options: z.object({
						pattern: z.string().transform((value) => new RegExp(value)),
					}),
				}),
			).toThrow(
				new TypeError(
					"Schemas must validate synchronously and report issues rather than throw, but one returned a Promise.",
				),
			);
		});

		it("collects unknown flags when not strict", () => {
			expect(
				parseStandardArgv(["--extra", "--name=x", "stray"], {
					name: "cli",
					options: z.object({ name: z.string().optional() }),
					strict: false,
				}),
			).toEqual({
				positionals: [],
				type: "values",
				unknown: { extra: true },
				values: { name: "x" },
				warnings: [],
			});
		});

		it("returns values with warnings when strict is warn", () => {
			expect(
				parseStandardArgv(["--nmae=x", "stray"], {
					name: "cli",
					options: z.object({ name: z.string().optional() }),
					strict: "warn",
				}),
			).toEqual({
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

		it("reports an issue for a flag missing its value and parses the next flag", () => {
			expect(
				parseStandardArgv(["--owner", "--repository", "b"], {
					name: "cli",
					options: z.object({ owner: z.string(), repository: z.string() }),
				}),
			).toEqual({
				issues: [
					{
						flag: "owner",
						kind: "invalid",
						message: "--owner requires a value.",
					},
				],
				text: "--owner requires a value.\nRun 'cli --help' for usage.",
				type: "error",
				warnings: [],
			});
		});

		it("does not report a missing flag when its schema accepts it being missing", () => {
			expect(
				parseStandardArgv([], {
					name: "cli",
					options: z.object({
						name: z.preprocess((value) => value ?? "anonymous", z.string()),
					}),
				}),
			).toEqual({
				positionals: [],
				type: "values",
				unknown: {},
				values: { name: "anonymous" },
				warnings: [],
			});
		});

		it("reports a missing flag as required when its schema rejects it being missing, even if it has no required JSON Schema", () => {
			expect(
				parseStandardArgv([], {
					name: "cli",
					options: z.object({ value: z.custom<string>((value) => !!value) }),
				}),
			).toEqual({
				issues: [
					{ flag: "value", kind: "missing", message: "--value is required." },
				],
				text: "--value is required.\nRun 'cli --help' for usage.",
				type: "error",
				warnings: [],
			});
		});

		it("reports missing flags named like object properties as required", () => {
			const parse = (args: string[]) =>
				parseStandardArgv(args, {
					name: "cli",
					options: z.object({ constructor: z.string(), toString: z.string() }),
				});

			expect(parse([])).toMatchObject({
				issues: [
					{ flag: "constructor", kind: "missing" },
					{ flag: "toString", kind: "missing" },
				],
				type: "error",
			});
			expect(parse(["--constructor", "a", "--toString", "b"])).toMatchObject({
				type: "values",
				values: { constructor: "a", toString: "b" },
			});
		});

		it("returns values when a record of schemas has a flag named __proto__", () => {
			const options = Object.fromEntries([
				["__proto__", z.object({ polluted: z.boolean() })],
			]) as Record<string, z.ZodType>;
			const result = parseStandardArgv(["--__proto__", '{"polluted":true}'], {
				name: "cli",
				options,
			});

			expect(result.type === "values" && Object.entries(result.values)).toEqual(
				[["__proto__", { polluted: true }]],
			);
			expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		});

		it("includes warnings when an error is returned and strict is warn", () => {
			expect(
				parseStandardArgv(["--bogus", "--count", "x"], {
					name: "cli",
					options: z.object({ count: z.number() }),
					strict: "warn",
				}),
			).toEqual({
				issues: [
					{
						flag: "count",
						kind: "invalid",
						message: '--count: Expected a number, received "x".',
					},
				],
				text: `--count: Expected a number, received "x".\nRun 'cli --help' for usage.`,
				type: "error",
				warnings: [
					{ flag: "bogus", kind: "unknown", message: "Unknown flag: --bogus" },
				],
			});
		});

		it("omits usage guidance from errors when an option replaces the built-in help flag", () => {
			expect(
				parseStandardArgv(["--bogus"], {
					name: "cli",
					options: z.object({ help: z.string().optional() }),
				}),
			).toMatchObject({
				text: "Unknown flag: --bogus",
				type: "error",
			});
		});

		it("includes the terminator index when -- is given", () => {
			expect(
				parseStandardArgv(["a", "--", "--b"], {
					name: "cli",
					options: z.object({}),
					positionals: z.array(z.string()),
				}),
			).toEqual({
				positionals: ["a", "--b"],
				terminatorIndex: 1,
				type: "values",
				unknown: {},
				values: {},
				warnings: [],
			});
		});

		it("returns a negative number positional when positionals are numbers", () => {
			expect(
				parseStandardArgv(["-5", "3"], {
					name: "cli",
					options: z.object({}),
					positionals: z.array(z.number()),
				}),
			).toMatchObject({
				positionals: [-5, 3],
				type: "values",
			});
		});

		it("returns converted values when options are mixed unions", () => {
			const parse = (args: string[]) =>
				parseStandardArgv(args, {
					name: "cli",
					options: z.object({
						concurrency: z.union([z.literal("auto"), z.number()]),
						level: z.literal(["a", 1, true]),
					}),
				});

			expect(parse(["--concurrency", "4", "--level", "1"])).toMatchObject({
				values: { concurrency: 4, level: 1 },
			});
			expect(parse(["--concurrency", "auto", "--level", "true"])).toMatchObject(
				{ values: { concurrency: "auto", level: true } },
			);
		});

		it("throws a TypeError when options are not an object schema", () => {
			expect(() =>
				parseStandardArgv([], {
					name: "cli",
					options: z.union([
						z.object({ a: z.string() }),
						z.object({ b: z.string() }),
					]),
				}),
			).toThrow(TypeError);
		});

		it("reports an unexpected positional when no positionals schema is given", () => {
			expect(
				parseStandardArgv(["stray"], {
					name: "cli",
					options: z.object({}),
				}),
			).toEqual({
				issues: [{ kind: "unexpected", message: "Unexpected argument: stray" }],
				text: "Unexpected argument: stray\nRun 'cli --help' for usage.",
				type: "error",
				warnings: [],
			});
		});

		it("returns validated positionals when a positionals schema is given", () => {
			expect(
				parseStandardArgv(["3", "--verbose", "a", "b"], {
					name: "cli",
					options: z.object({ verbose: z.boolean().default(false) }),
					positionals: z.tuple([z.number().int()], z.string()),
				}),
			).toEqual({
				positionals: [3, "a", "b"],
				type: "values",
				unknown: {},
				values: { verbose: true },
				warnings: [],
			});
		});

		it("returns positional issues when positionals fail conversion or validation", () => {
			const parse = (args: string[]) =>
				parseStandardArgv(args, {
					name: "cli",
					options: z.object({}),
					positionals: z.array(z.number().positive()).min(1),
				});

			expect(parse(["0"])).toEqual({
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
				warnings: [],
			});
			expect(parse(["abc"])).toEqual({
				issues: [
					{
						kind: "invalid",
						message: 'Argument 1: Expected a number, received "abc".',
					},
				],
				text: [
					'Argument 1: Expected a number, received "abc".',
					"Run 'cli --help' for usage.",
				].join("\n"),
				type: "error",
				warnings: [],
			});
		});
	});

	describe("help text", () => {
		it("includes defaults when options are an ArkType schema with defaults", () => {
			const helpText = getHelpText({
				name: "cli",
				options: type({
					color: ["boolean", "=", true],
					count: ["number", "=", 5],
				}),
			});

			expect(helpText).toMatchInlineSnapshot(`
				"Usage: cli [options]

				Options:
				      --[no-]color      (default: true)
				      --count <number>  (default: 5)
				  -h, --help            Show this help message"
			`);
		});

		it("wraps descriptions to the terminal width when stdout is a TTY", () => {
			setStdout({ columns: 40, isTTY: true });

			const helpText = getHelpText({
				name: "cli",
				options: z.object({
					cache: z
						.boolean()
						.optional()
						.describe("Whether to ignore any existing cache data on disk."),
				}),
			});

			expect(helpText).toMatchInlineSnapshot(`
				"Usage: cli [options]

				Options:
				      --cache  Whether to ignore any
				               existing cache data on
				               disk.
				  -h, --help   Show this help message"
			`);
		});

		it("includes the positionals placeholder when the positionals schema has one", () => {
			const helpText = getHelpText({
				name: "cli",
				options: z.object({}),
				positionals: z.array(z.string()).meta({ placeholder: "files" }),
			});

			expect(helpText).toMatchInlineSnapshot(`
				"Usage: cli [options] [files...]

				Options:
				  -h, --help  Show this help message"
			`);
		});

		it("uses positionalsUsage over the placeholder when both are given", () => {
			const helpText = getHelpText({
				name: "cli",
				options: z.object({}),
				positionals: z.array(z.string()).meta({ placeholder: "files" }),
				positionalsUsage: "<file> [more...]",
			});

			expect(helpText).toMatchInlineSnapshot(`
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
				const helpText = getHelpText({
					name: "cli",
					options: z.object({}),
					positionals,
				});

				expect(helpText?.split("\n")[0]).toBe(
					`Usage: cli [options] ${expected}`,
				);
			},
		);

		it("includes an arguments section when the positionals schema has a description", () => {
			const helpText = getHelpText({
				name: "cli",
				options: z.object({ dryRun: z.boolean().default(false) }),
				positionals: z
					.array(z.string())
					.min(1)
					.meta({ description: "Files to check", placeholder: "files" }),
			});

			expect(helpText).toMatchInlineSnapshot(`
				"Usage: cli [options] <files...>

				Arguments:
				  <files...>  Files to check

				Options:
				      --dryRun
				  -h, --help    Show this help message"
			`);
		});

		it("uses the usage override in place of options and positionals when given", () => {
			const helpText = getHelpText({
				name: "cli",
				options: z.object({ dryRun: z.boolean().default(false) }),
				positionals: z.array(z.string()),
				usage: "[--dryRun] [files...]",
			});

			expect(helpText).toMatchInlineSnapshot(`
				"Usage: cli [--dryRun] [files...]

				Options:
				      --dryRun
				  -h, --help    Show this help message"
			`);
		});

		it("uses custom descriptions and shorts when built-in flags are customized", () => {
			const helpText = getHelpText({
				help: { description: "Print help", short: "?" },
				name: "cli",
				options: z.object({}),
				version: { description: "Print version", short: "V", version: "1.2.3" },
			});

			expect(helpText).toMatchInlineSnapshot(`
				"Usage: cli [options]

				Options:
				  -?, --help     Print help
				  -V, --version  Print version"
			`);
		});
	});
});
