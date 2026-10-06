// cspell:ignore afile dryrun repo tokn wacth
import { describe, expect, it } from "vitest";

import type { FlagDescriptor, FlagKind } from "./types.ts";

import { parseRawArgs, type RawArgs } from "./parseRawArgs.ts";

function createFlag(
	key: string,
	kind: FlagKind,
	overrides: Partial<FlagDescriptor> = {},
): FlagDescriptor {
	return { key, kind, multiple: false, required: false, ...overrides };
}

function createResult(overrides: Partial<RawArgs> = {}): RawArgs {
	return {
		issues: [],
		positionals: [],
		unknown: {},
		values: {},
		warnings: [],
		...overrides,
	};
}

describe(parseRawArgs, () => {
	it("returns empty results when there are no args", () => {
		expect(parseRawArgs({ args: [], flags: [] })).toEqual(createResult());
	});

	describe("number flags", () => {
		const flags = [createFlag("count", "number")];

		it.each([
			["5", 5],
			["-5", -5],
			["+5", 5],
			["1.5", 1.5],
			["-.5", -0.5],
			["1.", 1],
			["1e3", 1000],
			["2E-2", 0.02],
		])("converts %j to %j", (value, expected) => {
			expect(parseRawArgs({ args: ["--count", value], flags })).toEqual(
				createResult({ values: { count: expected } }),
			);
		});

		it("converts the value when it is given with an equals sign", () => {
			expect(parseRawArgs({ args: ["--count=-5"], flags })).toEqual(
				createResult({ values: { count: -5 } }),
			);
		});

		it.each(["abc", "", "0x10", "Infinity", "NaN", "1e", "1_000", " 1"])(
			"reports an issue when the value is %j",
			(value) => {
				expect(parseRawArgs({ args: ["--count", value], flags })).toEqual(
					createResult({
						issues: [
							{
								flag: "count",
								kind: "invalid",
								message: `--count: Expected a number, received ${JSON.stringify(value)}.`,
							},
						],
					}),
				);
			},
		);
	});

	describe("integer flags", () => {
		const flags = [createFlag("count", "integer")];

		it("converts the value to a number when it is an integer", () => {
			expect(parseRawArgs({ args: ["--count", "12"], flags }).values).toEqual({
				count: 12,
			});
		});

		it("converts the value to a number without validating that it is an integer", () => {
			expect(parseRawArgs({ args: ["--count", "1.5"], flags }).values).toEqual({
				count: 1.5,
			});
		});

		it("reports an issue when the value is not a number", () => {
			expect(parseRawArgs({ args: ["--count", "many"], flags }).issues).toEqual(
				[
					{
						flag: "count",
						kind: "invalid",
						message: '--count: Expected a number, received "many".',
					},
				],
			);
		});
	});

	describe("json flags", () => {
		it("parses the value when it is valid JSON", () => {
			expect(
				parseRawArgs({
					args: ["--config", '{"a":[1,2]}'],
					flags: [createFlag("config", "json")],
				}),
			).toEqual(createResult({ values: { config: { a: [1, 2] } } }));
		});

		it("keeps an array value as-is when the flag is not multiple", () => {
			expect(
				parseRawArgs({
					args: ["--config", "[1,2]"],
					flags: [createFlag("config", "json")],
				}).values,
			).toEqual({ config: [1, 2] });
		});

		it("collects values when the flag is multiple and given multiple times", () => {
			expect(
				parseRawArgs({
					args: ["--labels", '{"name":"a"}', "--labels", '{"name":"b"}'],
					flags: [createFlag("labels", "json", { multiple: true })],
				}).values,
			).toEqual({ labels: [{ name: "a" }, { name: "b" }] });
		});

		it("flattens array values when the flag is multiple", () => {
			expect(
				parseRawArgs({
					args: [
						"--labels",
						'[{"name":"a"},{"name":"b"}]',
						"--labels",
						'{"name":"c"}',
					],
					flags: [createFlag("labels", "json", { multiple: true })],
				}).values,
			).toEqual({ labels: [{ name: "a" }, { name: "b" }, { name: "c" }] });
		});

		it("reports an issue when the value is invalid JSON", () => {
			expect(
				parseRawArgs({
					args: ["--config", "{nope}"],
					flags: [createFlag("config", "json")],
				}),
			).toEqual(
				createResult({
					issues: [
						{
							flag: "config",
							kind: "invalid",
							message: '--config: Expected valid JSON, received "{nope}".',
						},
					],
				}),
			);
		});

		it("keeps valid values when another value of a multiple flag is invalid JSON", () => {
			expect(
				parseRawArgs({
					args: ["--labels", "[1]", "--labels", "{"],
					flags: [createFlag("labels", "json", { multiple: true })],
				}),
			).toEqual(
				createResult({
					issues: [
						{
							flag: "labels",
							kind: "invalid",
							message: '--labels: Expected valid JSON, received "{".',
						},
					],
					values: { labels: [1] },
				}),
			);
		});

		it("does not check choices when the flag is json", () => {
			expect(
				parseRawArgs({
					args: ["--config", "3"],
					flags: [createFlag("config", "json", { choices: [1, 2] })],
				}),
			).toEqual(createResult({ values: { config: 3 } }));
		});
	});

	describe("boolean flags", () => {
		const flags = [
			createFlag("color", "boolean", { default: true }),
			createFlag("quiet", "boolean", { short: "q" }),
			createFlag("watch", "boolean", { short: "w" }),
		];

		it("sets true when the flag is given without a value", () => {
			expect(parseRawArgs({ args: ["--color"], flags }).values).toEqual({
				color: true,
			});
		});

		it("sets true when the flag is given with =true", () => {
			expect(parseRawArgs({ args: ["--color=true"], flags }).values).toEqual({
				color: true,
			});
		});

		it("sets false when the flag is given with =false", () => {
			expect(parseRawArgs({ args: ["--color=false"], flags }).values).toEqual({
				color: false,
			});
		});

		it("reports an issue when the flag is given with another value", () => {
			expect(parseRawArgs({ args: ["--color=yes"], flags })).toEqual(
				createResult({
					issues: [
						{
							flag: "color",
							kind: "invalid",
							message: '--color: Expected true or false, received "yes".',
						},
					],
				}),
			);
		});

		it("sets false when the flag is given a separate false", () => {
			expect(parseRawArgs({ args: ["--quiet", "false"], flags })).toEqual(
				createResult({ values: { quiet: false } }),
			);
		});

		it("sets true when the flag is given a separate true", () => {
			expect(parseRawArgs({ args: ["-q", "true"], flags })).toEqual(
				createResult({ values: { quiet: true } }),
			);
		});

		it("applies a separate value to only the last flag in a short group", () => {
			expect(parseRawArgs({ args: ["-qw", "false"], flags })).toEqual(
				createResult({ values: { quiet: true, watch: false } }),
			);
		});

		it("does not consume a separate value after the option terminator", () => {
			expect(parseRawArgs({ args: ["--quiet", "--", "false"], flags })).toEqual(
				createResult({
					issues: [
						{ kind: "unexpected", message: "Unexpected argument: false" },
					],
					terminatorIndex: 0,
					values: { quiet: true },
				}),
			);
		});

		it("does not consume a separate value that is not true or false", () => {
			expect(
				parseRawArgs({
					args: ["--quiet", "file", "false"],
					flags,
					positionals: { kinds: [], rest: "string" },
				}),
			).toEqual(
				createResult({
					positionals: ["file", "false"],
					values: { quiet: true },
				}),
			);
		});

		it("does not consume a separate value when the flag has an inline value", () => {
			expect(
				parseRawArgs({
					args: ["--quiet=true", "false"],
					flags,
					positionals: { kinds: [], rest: "string" },
				}),
			).toEqual(
				createResult({ positionals: ["false"], values: { quiet: true } }),
			);
		});

		it("does not consume the next arg when it is not a boolean value", () => {
			expect(
				parseRawArgs({
					args: ["--color", "file"],
					flags,
					positionals: { kinds: [], rest: "string" },
				}),
			).toEqual(
				createResult({ positionals: ["file"], values: { color: true } }),
			);
		});

		it("sets false when the flag is negated with --no-", () => {
			expect(parseRawArgs({ args: ["--no-color"], flags })).toEqual(
				createResult({ values: { color: false } }),
			);
		});

		it("reports an issue when the negated flag is given a value", () => {
			expect(parseRawArgs({ args: ["--no-color=1"], flags })).toEqual(
				createResult({
					issues: [
						{
							flag: "color",
							kind: "invalid",
							message: "--no-color does not take a value.",
						},
					],
				}),
			);
		});

		it("uses the last value when the flag is given multiple times", () => {
			expect(
				parseRawArgs({ args: ["--no-color", "--color"], flags }).values,
			).toEqual({ color: true });
		});

		it("reports an unknown flag when --no- is used for a non-boolean flag", () => {
			expect(
				parseRawArgs({
					args: ["--no-name"],
					flags: [createFlag("name", "string")],
				}).issues,
			).toEqual([
				{
					flag: "no-name",
					kind: "unknown",
					message: "Unknown flag: --no-name",
				},
			]);
		});

		it("reports an unknown flag when --no- is used for a multiple boolean flag", () => {
			expect(
				parseRawArgs({
					args: ["--no-bits"],
					flags: [createFlag("bits", "boolean", { multiple: true })],
				}).issues,
			).toEqual([
				{
					flag: "no-bits",
					kind: "unknown",
					message: "Unknown flag: --no-bits",
				},
			]);
		});

		it("collects values when the flag is a multiple boolean", () => {
			expect(
				parseRawArgs({
					args: ["--bits", "--bits=false", "--bits", "false"],
					flags: [createFlag("bits", "boolean", { multiple: true })],
				}).values,
			).toEqual({ bits: [true, false, false] });
		});
	});

	describe("string flags", () => {
		const flags = [
			createFlag("name", "string", { short: "n" }),
			createFlag("tag", "string", { multiple: true, short: "t" }),
			createFlag("verbose", "boolean"),
		];

		it("sets the value when it is given as the next arg", () => {
			expect(parseRawArgs({ args: ["--name", "Josh"], flags }).values).toEqual({
				name: "Josh",
			});
		});

		it("sets an empty value when it is given as an empty string", () => {
			expect(parseRawArgs({ args: ["--name="], flags }).values).toEqual({
				name: "",
			});
		});

		it("sets a dash value when it is given a lone dash", () => {
			expect(parseRawArgs({ args: ["--name", "-"], flags }).values).toEqual({
				name: "-",
			});
		});

		it("sets a negative number value when it is given one", () => {
			expect(parseRawArgs({ args: ["--name", "-1.5"], flags }).values).toEqual({
				name: "-1.5",
			});
		});

		it("reports an issue when the flag is missing a value", () => {
			expect(parseRawArgs({ args: ["--name"], flags })).toEqual(
				createResult({
					issues: [
						{
							flag: "name",
							kind: "invalid",
							message: "--name requires a value.",
						},
					],
				}),
			);
		});

		it("reports an issue with the short name when a short flag is missing a value", () => {
			expect(parseRawArgs({ args: ["-n"], flags }).issues).toEqual([
				{ flag: "name", kind: "invalid", message: "-n requires a value." },
			]);
		});

		it("reports an issue and parses the next flag when the value looks like a flag", () => {
			expect(
				parseRawArgs({ args: ["--name", "--verbose", "--tag", "x"], flags }),
			).toEqual(
				createResult({
					issues: [
						{
							flag: "name",
							kind: "invalid",
							message: "--name requires a value.",
						},
					],
					values: { tag: ["x"], verbose: true },
				}),
			);
		});

		it("reports an issue and parses the next string flag when the value looks like a flag", () => {
			expect(parseRawArgs({ args: ["--name", "--tag", "x"], flags })).toEqual(
				createResult({
					issues: [
						{
							flag: "name",
							kind: "invalid",
							message: "--name requires a value.",
						},
					],
					values: { tag: ["x"] },
				}),
			);
		});

		it("reports an issue and parses the next short flag when the value looks like a short flag", () => {
			expect(parseRawArgs({ args: ["-n", "-t", "x"], flags })).toEqual(
				createResult({
					issues: [
						{ flag: "name", kind: "invalid", message: "-n requires a value." },
					],
					values: { tag: ["x"] },
				}),
			);
		});

		it("reports issues for each flag when multiple flags are missing values", () => {
			expect(
				parseRawArgs({
					args: ["a", "--name", "--tag", "--unknown", "b"],
					flags,
					positionals: { kinds: [], rest: "string" },
				}),
			).toEqual(
				createResult({
					issues: [
						{
							flag: "name",
							kind: "invalid",
							message: "--name requires a value.",
						},
						{
							flag: "tag",
							kind: "invalid",
							message: "--tag requires a value.",
						},
						{
							flag: "unknown",
							kind: "unknown",
							message: "Unknown flag: --unknown",
						},
					],
					positionals: ["a"],
				}),
			);
		});

		it("accepts a value that looks like a flag when it is given inline", () => {
			expect(parseRawArgs({ args: ["--name=--verbose"], flags })).toEqual(
				createResult({ values: { name: "--verbose" } }),
			);
		});

		it("sets the value when it is given with a short flag", () => {
			expect(parseRawArgs({ args: ["-n", "Josh"], flags }).values).toEqual({
				name: "Josh",
			});
		});

		it("sets the value when it is attached to a short flag", () => {
			expect(parseRawArgs({ args: ["-nJosh"], flags }).values).toEqual({
				name: "Josh",
			});
		});

		it("keeps the last value when a non-multiple flag is repeated", () => {
			expect(
				parseRawArgs({ args: ["--name", "a", "-n", "b"], flags }).values,
			).toEqual({ name: "b" });
		});

		it("collects values when a multiple flag is repeated with long and short names", () => {
			expect(
				parseRawArgs({ args: ["--tag", "a", "-t", "b", "--tag=c"], flags })
					.values,
			).toEqual({ tag: ["a", "b", "c"] });
		});

		it("keeps the value as a string when it looks like a number", () => {
			expect(parseRawArgs({ args: ["--name", "123"], flags }).values).toEqual({
				name: "123",
			});
		});
	});

	describe("flags with choices", () => {
		it("sets the value when it is one of the choices", () => {
			expect(
				parseRawArgs({
					args: ["--level", "b"],
					flags: [createFlag("level", "string", { choices: ["a", "b"] })],
				}),
			).toEqual(createResult({ values: { level: "b" } }));
		});

		it("reports an issue when the value is not one of two choices", () => {
			expect(
				parseRawArgs({
					args: ["--level", "c"],
					flags: [createFlag("level", "string", { choices: ["a", "b"] })],
				}).issues,
			).toEqual([
				{
					flag: "level",
					kind: "invalid",
					message: '--level: Expected "a" or "b", received "c".',
				},
			]);
		});

		it("reports an issue when the value is not the only choice", () => {
			expect(
				parseRawArgs({
					args: ["--level", "c"],
					flags: [createFlag("level", "string", { choices: ["a"] })],
				}).issues,
			).toEqual([
				{
					flag: "level",
					kind: "invalid",
					message: '--level: Expected "a", received "c".',
				},
			]);
		});

		it("reports an issue listing all choices when the value is not one of three or more", () => {
			expect(
				parseRawArgs({
					args: ["--level", "d"],
					flags: [createFlag("level", "string", { choices: ["a", "b", "c"] })],
				}).issues,
			).toEqual([
				{
					flag: "level",
					kind: "invalid",
					message: '--level: Expected "a", "b", or "c", received "d".',
				},
			]);
		});

		it("converts the value before comparing when the choices are numbers", () => {
			const flags = [createFlag("size", "number", { choices: [1, 2] })];

			expect(parseRawArgs({ args: ["--size", "2"], flags })).toEqual(
				createResult({ values: { size: 2 } }),
			);
			expect(parseRawArgs({ args: ["--size", "3"], flags }).issues).toEqual([
				{
					flag: "size",
					kind: "invalid",
					message: '--size: Expected 1 or 2, received "3".',
				},
			]);
		});

		it("reports an issue per invalid value when the flag is multiple", () => {
			expect(
				parseRawArgs({
					args: ["--reason", "a", "--reason", "x", "--reason", "b"],
					flags: [
						createFlag("reason", "string", {
							choices: ["a", "b"],
							multiple: true,
						}),
					],
				}),
			).toEqual(
				createResult({
					issues: [
						{
							flag: "reason",
							kind: "invalid",
							message: '--reason: Expected "a" or "b", received "x".',
						},
					],
					values: { reason: ["a", "b"] },
				}),
			);
		});
	});

	describe("mixed flags", () => {
		const flags = [
			createFlag("concurrency", "mixed", {
				choices: ["auto"],
				types: ["number"],
			}),
			createFlag("color", "mixed", { types: ["string", "boolean"] }),
			createFlag("level", "mixed", { choices: ["a", 1, true], types: [] }),
			createFlag("sizes", "mixed", {
				multiple: true,
				types: ["integer", "string"],
			}),
		];

		it("converts the value to a choice when it matches one", () => {
			expect(
				parseRawArgs({
					args: ["--concurrency", "auto", "--level", "1", "--level=true"],
					flags,
				}).values,
			).toEqual({ concurrency: "auto", level: true });
			expect(parseRawArgs({ args: ["--level", "1"], flags }).values).toEqual({
				level: 1,
			});
		});

		it("converts the value to a number when it is numeric and numbers are allowed", () => {
			expect(
				parseRawArgs({ args: ["--concurrency", "-2.5"], flags }).values,
			).toEqual({ concurrency: -2.5 });
		});

		it("converts the value to a boolean when it is true or false and booleans are allowed", () => {
			expect(
				parseRawArgs({ args: ["--color", "false"], flags }).values,
			).toEqual({ color: false });
		});

		it("keeps the value as a string when it matches no other allowed type", () => {
			expect(
				parseRawArgs({ args: ["--color", "red", "--concurrency", "x"], flags })
					.values,
			).toEqual({ color: "red", concurrency: "x" });
		});

		it("sets true when the flag allows booleans and is given without a value", () => {
			expect(parseRawArgs({ args: ["--color"], flags })).toEqual(
				createResult({ values: { color: true } }),
			);
		});

		it("sets true when the flag's choices include true and it is given without a value", () => {
			expect(parseRawArgs({ args: ["--level"], flags }).values).toEqual({
				level: true,
			});
		});

		it("reports an issue when the flag doesn't allow booleans and is given without a value", () => {
			expect(parseRawArgs({ args: ["--concurrency"], flags }).issues).toEqual([
				{
					flag: "concurrency",
					kind: "invalid",
					message: "--concurrency requires a value.",
				},
			]);
		});

		it("reports an issue when the value isn't one of the flag's only choices", () => {
			expect(parseRawArgs({ args: ["--level", "b"], flags }).issues).toEqual([
				{
					flag: "level",
					kind: "invalid",
					message: '--level: Expected "a", 1, or true, received "b".',
				},
			]);
		});

		it("converts each value when the flag is multiple", () => {
			expect(
				parseRawArgs({ args: ["--sizes", "1", "--sizes", "lg"], flags }).values,
			).toEqual({ sizes: [1, "lg"] });
		});
	});

	describe("values starting with a dash", () => {
		const flags = [
			createFlag("all", "boolean", { short: "a" }),
			createFlag("file", "string", { short: "f" }),
			createFlag("quiet", "boolean", { short: "q" }),
			createFlag("words", "string"),
		];

		it("takes the value when it isn't made of known short flags", () => {
			expect(parseRawArgs({ args: ["--words", "-dashy"], flags })).toEqual(
				createResult({ values: { words: "-dashy" } }),
			);
		});

		it("takes the value when it is a lone dash", () => {
			expect(parseRawArgs({ args: ["--words", "-"], flags }).values).toEqual({
				words: "-",
			});
		});

		it("reports an issue when the value is a group of known boolean short flags", () => {
			expect(parseRawArgs({ args: ["--words", "-aq"], flags })).toEqual(
				createResult({
					issues: [
						{
							flag: "words",
							kind: "invalid",
							message: "--words requires a value.",
						},
					],
					values: { all: true, quiet: true },
				}),
			);
		});

		it("reports an issue when the value starts with a known short flag that takes a value", () => {
			expect(parseRawArgs({ args: ["--words", "-afile"], flags })).toEqual(
				createResult({
					issues: [
						{
							flag: "words",
							kind: "invalid",
							message: "--words requires a value.",
						},
					],
					values: { all: true, file: "ile" },
				}),
			);
		});

		it("reports an issue when the value starts with two dashes", () => {
			expect(parseRawArgs({ args: ["--words", "--"], flags })).toEqual(
				createResult({
					issues: [
						{
							flag: "words",
							kind: "invalid",
							message: "--words requires a value.",
						},
					],
					terminatorIndex: 0,
				}),
			);
		});
	});

	describe("short flags with inline values", () => {
		const flags = [
			createFlag("filename", "string", { short: "f" }),
			createFlag("quiet", "boolean", { short: "q" }),
		];

		it("sets the value when a short flag is given one with an equals sign", () => {
			expect(parseRawArgs({ args: ["-f=a=b"], flags })).toEqual(
				createResult({ values: { filename: "a=b" } }),
			);
		});

		it("sets a boolean value when a boolean short flag is given one with an equals sign", () => {
			expect(parseRawArgs({ args: ["-q=false"], flags }).values).toEqual({
				quiet: false,
			});
		});

		it("reports an issue with the long name when a boolean short flag is given an invalid value", () => {
			expect(parseRawArgs({ args: ["-q=yes"], flags }).issues).toEqual([
				{
					flag: "quiet",
					kind: "invalid",
					message: '--quiet: Expected true or false, received "yes".',
				},
			]);
		});

		it("does not rewrite args after --", () => {
			expect(
				parseRawArgs({
					args: ["-f=a", "--", "-f=b"],
					flags,
					positionals: { kinds: [], rest: "string" },
				}),
			).toEqual(
				createResult({
					positionals: ["-f=b"],
					terminatorIndex: 0,
					values: { filename: "a" },
				}),
			);
		});
	});

	describe("unknown short flags", () => {
		const flags = [
			createFlag("all", "boolean", { short: "a" }),
			createFlag("e", "string"),
		];

		it("reports one issue for a group when it contains unknown short flags", () => {
			expect(parseRawArgs({ args: ["-weird.js"], flags })).toEqual(
				createResult({
					issues: [
						{
							flag: "w",
							kind: "unknown",
							message: "Unknown flag: -w (in -weird.js)",
						},
					],
				}),
			);
		});

		it("does not apply known short flags in a group with unknown ones", () => {
			expect(parseRawArgs({ args: ["-az"], flags })).toEqual(
				createResult({
					issues: [
						{
							flag: "z",
							kind: "unknown",
							message: "Unknown flag: -z (in -az)",
						},
					],
				}),
			);
		});

		it("treats a short flag matching a long-only flag's name as unknown", () => {
			expect(parseRawArgs({ args: ["-e", "x"], flags })).toEqual(
				createResult({
					issues: [{ flag: "e", kind: "unknown", message: "Unknown flag: -e" }],
				}),
			);
		});

		it("includes a hint about -- when positionals are allowed", () => {
			expect(
				parseRawArgs({
					args: ["-weird.js"],
					flags,
					positionals: { kinds: [], rest: "string" },
				}).issues,
			).toEqual([
				{
					flag: "w",
					kind: "unknown",
					message:
						'Unknown flag: -w (in -weird.js). Arguments starting with "-" can be passed after "--".',
				},
			]);
		});

		it("collects each unknown short flag into unknown when not strict", () => {
			expect(parseRawArgs({ args: ["-xay"], flags, strict: false })).toEqual(
				createResult({ unknown: { x: true, y: true } }),
			);
		});

		it("collects an unknown short flag's value into unknown when not strict and no positionals are allowed", () => {
			expect(
				parseRawArgs({ args: ["-z", "value"], flags, strict: "warn" }),
			).toEqual(
				createResult({
					unknown: { z: "value" },
					warnings: [
						{ flag: "z", kind: "unknown", message: "Unknown flag: -z" },
					],
				}),
			);
		});
	});

	describe("unknown flags", () => {
		const flags = [
			createFlag("dryRun", "boolean"),
			createFlag("repository", "string"),
			createFlag("watch", "number"),
		];

		it("reports an issue with a suggestion when the flag is close to a known flag", () => {
			expect(parseRawArgs({ args: ["--wacth", "5"], flags })).toEqual(
				createResult({
					issues: [
						{
							flag: "wacth",
							kind: "unknown",
							message: "Unknown flag: --wacth",
							suggestion: "watch",
						},
					],
				}),
			);
		});

		it("suggests the camelCase flag when given a kebab-case flag", () => {
			expect(parseRawArgs({ args: ["--dry-run"], flags }).issues).toEqual([
				{
					flag: "dry-run",
					kind: "unknown",
					message: "Unknown flag: --dry-run",
					suggestion: "dryRun",
				},
			]);
		});

		it("suggests the flag when given it in a different case", () => {
			expect(parseRawArgs({ args: ["--dryrun"], flags }).issues).toEqual([
				{
					flag: "dryrun",
					kind: "unknown",
					message: "Unknown flag: --dryrun",
					suggestion: "dryRun",
				},
			]);
		});

		it("suggests the flag when given an abbreviation of it", () => {
			expect(parseRawArgs({ args: ["--repo", "x"], flags }).issues).toEqual([
				{
					flag: "repo",
					kind: "unknown",
					message: "Unknown flag: --repo",
					suggestion: "repository",
				},
			]);
		});

		it("does not include a suggestion when no flags are close", () => {
			expect(parseRawArgs({ args: ["--unrelated"], flags }).issues).toEqual([
				{
					flag: "unrelated",
					kind: "unknown",
					message: "Unknown flag: --unrelated",
				},
			]);
		});

		it("reports an issue with the short name when the flag is an unknown short flag", () => {
			expect(parseRawArgs({ args: ["-z"], flags }).issues).toEqual([
				{ flag: "z", kind: "unknown", message: "Unknown flag: -z" },
			]);
		});

		it("does not report the flag's value as an unexpected positional", () => {
			expect(
				parseRawArgs({ args: ["--unrelated", "value", "stray"], flags }).issues,
			).toEqual([
				{
					flag: "unrelated",
					kind: "unknown",
					message: "Unknown flag: --unrelated",
				},
				{ kind: "unexpected", message: "Unexpected argument: stray" },
			]);
		});

		it("reports the next positional when the flag's value is given with an equals sign", () => {
			expect(
				parseRawArgs({ args: ["--unrelated=value", "stray"], flags }).issues,
			).toEqual([
				{
					flag: "unrelated",
					kind: "unknown",
					message: "Unknown flag: --unrelated",
				},
				{ kind: "unexpected", message: "Unexpected argument: stray" },
			]);
		});

		it("suggests the flag with a matching short alias when given a single-character long flag", () => {
			expect(
				parseRawArgs({
					args: ["--w"],
					flags: [createFlag("watch", "number", { short: "w" })],
				}).issues,
			).toEqual([
				{
					flag: "w",
					kind: "unknown",
					message: "Unknown flag: --w",
					suggestion: "watch",
				},
			]);
		});

		it("does not suggest hidden flags", () => {
			expect(
				parseRawArgs({
					args: ["--secretTokn", "--s"],
					flags: [
						createFlag("secretToken", "string", { hidden: true, short: "s" }),
					],
				}).issues,
			).toEqual([
				{
					flag: "secretTokn",
					kind: "unknown",
					message: "Unknown flag: --secretTokn",
				},
				{ flag: "s", kind: "unknown", message: "Unknown flag: --s" },
			]);
		});

		it("collects the flag's next arg as its value when not strict and no positionals are allowed", () => {
			expect(
				parseRawArgs({
					args: ["--extra", "value", "--other", "--watch", "1", "--last"],
					flags,
					strict: false,
				}),
			).toEqual(
				createResult({
					unknown: { extra: "value", last: true, other: true },
					values: { watch: 1 },
				}),
			);
		});

		it("does not collect the flag's next arg as its value when not strict and positionals are allowed", () => {
			expect(
				parseRawArgs({
					args: ["--extra", "value"],
					flags,
					positionals: { kinds: [], rest: "string" },
					strict: "warn",
				}),
			).toEqual(
				createResult({
					positionals: ["value"],
					unknown: { extra: true },
					warnings: [
						{
							flag: "extra",
							kind: "unknown",
							message: "Unknown flag: --extra",
						},
					],
				}),
			);
		});

		it("collects the flag into unknown when not strict", () => {
			expect(
				parseRawArgs({
					args: ["--extra", "--other=value", "--watch", "1", "stray"],
					flags,
					strict: false,
				}),
			).toEqual(
				createResult({
					unknown: { extra: true, other: "value" },
					values: { watch: 1 },
				}),
			);
		});

		it("collects the flag into unknown and reports a warning when strict is warn", () => {
			expect(
				parseRawArgs({
					args: ["--wacth", "--other=value", "stray"],
					flags,
					strict: "warn",
				}),
			).toEqual(
				createResult({
					unknown: { other: "value", wacth: true },
					warnings: [
						{
							flag: "wacth",
							kind: "unknown",
							message: "Unknown flag: --wacth",
							suggestion: "watch",
						},
						{
							flag: "other",
							kind: "unknown",
							message: "Unknown flag: --other",
						},
						{ kind: "unexpected", message: "Unexpected argument: stray" },
					],
				}),
			);
		});
	});

	describe("flag names", () => {
		it("keeps values when flags are named like object properties", () => {
			const result = parseRawArgs({
				args: ["--constructor", "a", "--__proto__", "b", "--toString=c"],
				flags: [
					createFlag("constructor", "string"),
					createFlag("__proto__", "string"),
				],
				strict: false,
			});

			expect(Object.entries(result.values)).toEqual([
				["constructor", "a"],
				["__proto__", "b"],
			]);
			expect(Object.entries(result.unknown)).toEqual([["toString", "c"]]);
			expect(Object.getPrototypeOf(result.values)).toBeNull();
		});
	});

	describe("positionals", () => {
		it("reports an issue when a positional is given and none are allowed", () => {
			expect(parseRawArgs({ args: ["stray"], flags: [] })).toEqual(
				createResult({
					issues: [
						{ kind: "unexpected", message: "Unexpected argument: stray" },
					],
				}),
			);
		});

		it("ignores the positional when none are allowed and not strict", () => {
			expect(
				parseRawArgs({ args: ["stray"], flags: [], strict: false }),
			).toEqual(createResult());
		});

		it("reports a warning when a positional is given, none are allowed, and strict is warn", () => {
			expect(
				parseRawArgs({ args: ["stray"], flags: [], strict: "warn" }),
			).toEqual(
				createResult({
					warnings: [
						{ kind: "unexpected", message: "Unexpected argument: stray" },
					],
				}),
			);
		});

		it("keeps positionals as strings when the rest kind is string", () => {
			expect(
				parseRawArgs({
					args: ["a", "1", "--name", "x", "b"],
					flags: [createFlag("name", "string")],
					positionals: { kinds: [], rest: "string" },
				}),
			).toEqual(
				createResult({ positionals: ["a", "1", "b"], values: { name: "x" } }),
			);
		});

		it("keeps positionals as strings when there is no rest kind", () => {
			expect(
				parseRawArgs({
					args: ["1", "2"],
					flags: [],
					positionals: { kinds: ["number"] },
				}).positionals,
			).toEqual([1, "2"]);
		});

		it("converts positionals per kind and then per rest kind", () => {
			expect(
				parseRawArgs({
					args: ["1.5", "true", "[1]", "2", "3"],
					flags: [],
					positionals: {
						kinds: ["number", "boolean", "json"],
						rest: "integer",
					},
				}).positionals,
			).toEqual([1.5, true, [1], 2, 3]);
		});

		it("reports issues with positions when positionals fail to convert", () => {
			expect(
				parseRawArgs({
					args: ["abc", "maybe", "{", "text"],
					flags: [],
					positionals: { kinds: ["number", "boolean", "json"], rest: "string" },
				}),
			).toEqual(
				createResult({
					issues: [
						{
							kind: "invalid",
							message: 'Argument 1: Expected a number, received "abc".',
						},
						{
							kind: "invalid",
							message: 'Argument 2: Expected true or false, received "maybe".',
						},
						{
							kind: "invalid",
							message: 'Argument 3: Expected valid JSON, received "{".',
						},
					],
					positionals: ["text"],
				}),
			);
		});

		it("converts later positionals by their own position when an earlier one fails", () => {
			expect(
				parseRawArgs({
					args: ["abc", "def", "ghi"],
					flags: [],
					positionals: { kinds: ["number", "number"], rest: "string" },
				}),
			).toEqual(
				createResult({
					issues: [
						{
							kind: "invalid",
							message: 'Argument 1: Expected a number, received "abc".',
						},
						{
							kind: "invalid",
							message: 'Argument 2: Expected a number, received "def".',
						},
					],
					positionals: ["ghi"],
				}),
			);
		});

		it("keeps positional positions when parsing restarts after a flag missing its value", () => {
			expect(
				parseRawArgs({
					args: ["1", "--name", "--verbose", "x"],
					flags: [
						createFlag("name", "string"),
						createFlag("verbose", "boolean"),
					],
					positionals: { kinds: ["number", "number"] },
				}),
			).toEqual(
				createResult({
					issues: [
						{
							flag: "name",
							kind: "invalid",
							message: "--name requires a value.",
						},
						{
							kind: "invalid",
							message: 'Argument 2: Expected a number, received "x".',
						},
					],
					positionals: [1],
					values: { verbose: true },
				}),
			);
		});

		it("treats args after -- as positionals", () => {
			expect(
				parseRawArgs({
					args: ["--name", "x", "--", "--name", "-5", "y"],
					flags: [createFlag("name", "string")],
					positionals: { kinds: [], rest: "string" },
				}),
			).toEqual(
				createResult({
					positionals: ["--name", "-5", "y"],
					terminatorIndex: 0,
					values: { name: "x" },
				}),
			);
		});

		it("includes how many positionals came before -- when there is one", () => {
			expect(
				parseRawArgs({
					args: ["a", "b", "--", "c"],
					flags: [],
					positionals: { kinds: [], rest: "string" },
				}),
			).toEqual(
				createResult({ positionals: ["a", "b", "c"], terminatorIndex: 2 }),
			);
		});

		it("does not count positionals that failed to convert before --", () => {
			expect(
				parseRawArgs({
					args: ["1", "x", "--", "2"],
					flags: [],
					positionals: { kinds: [], rest: "number" },
				}),
			).toEqual(
				createResult({
					issues: [
						{
							kind: "invalid",
							message: 'Argument 2: Expected a number, received "x".',
						},
					],
					positionals: [1, 2],
					terminatorIndex: 1,
				}),
			);
		});

		it("treats a negative number as a positional when a numeric positional is next", () => {
			expect(
				parseRawArgs({
					args: ["-5", "-1.5", "-2"],
					flags: [createFlag("verbose", "boolean", { short: "v" })],
					positionals: {
						kinds: ["number", { kind: "mixed", types: ["integer"] }],
						rest: "string",
					},
				}),
			).toEqual(
				createResult({
					issues: [
						{
							flag: "2",
							kind: "unknown",
							message:
								'Unknown flag: -2. Arguments starting with "-" can be passed after "--".',
						},
					],
					positionals: [-5, -1.5],
				}),
			);
		});

		it("treats a negative number as an unknown flag when positionals are not allowed", () => {
			expect(parseRawArgs({ args: ["-5"], flags: [] }).issues).toEqual([
				{ flag: "5", kind: "unknown", message: "Unknown flag: -5" },
			]);
		});

		it("treats a negative number as an unknown flag when the next positional is not numeric", () => {
			expect(
				parseRawArgs({
					args: ["-5"],
					flags: [],
					positionals: { kinds: [{ kind: "mixed", types: ["string"] }] },
				}).issues,
			).toEqual([
				{
					flag: "5",
					kind: "unknown",
					message:
						'Unknown flag: -5. Arguments starting with "-" can be passed after "--".',
				},
			]);
		});

		it("treats a negative number as a flag when its first digit is a known short flag", () => {
			expect(
				parseRawArgs({
					args: ["-1"],
					flags: [createFlag("one", "boolean", { short: "1" })],
					positionals: { kinds: [], rest: "number" },
				}),
			).toEqual(createResult({ values: { one: true } }));
		});

		it("converts mixed positionals per their choices and types", () => {
			expect(
				parseRawArgs({
					args: ["auto", "5", "true", "x"],
					flags: [],
					positionals: {
						kinds: [{ choices: ["auto"], kind: "mixed", types: ["number"] }],
						rest: { kind: "mixed", types: ["number", "boolean"] },
					},
				}),
			).toEqual(createResult({ positionals: ["auto", 5, true, "x"] }));
		});

		it("reports an issue when a mixed positional isn't one of its only choices", () => {
			expect(
				parseRawArgs({
					args: ["c"],
					flags: [],
					positionals: {
						kinds: [{ choices: ["a", 1], kind: "mixed", types: [] }],
					},
				}).issues,
			).toEqual([
				{
					kind: "invalid",
					message: 'Argument 1: Expected "a" or 1, received "c".',
				},
			]);
		});

		it("reports args after -- when positionals are not allowed", () => {
			expect(
				parseRawArgs({
					args: ["--", "--name"],
					flags: [createFlag("name", "string")],
				}).issues,
			).toEqual([
				{ kind: "unexpected", message: "Unexpected argument: --name" },
			]);
		});
	});
});
