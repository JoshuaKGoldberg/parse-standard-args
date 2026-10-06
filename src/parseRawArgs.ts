// parseArgs (with tokens) is available as of Node.js 18.7.0, though experimental before 20.
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";

import type { ArgsIssue, FlagDescriptor, FlagKind } from "./types.ts";

import { getClosestFlag } from "./getClosestFlag.ts";
import { numberPattern } from "./numberPattern.ts";

export interface ParseRawArgsSettings {
	/**
	 * Raw command-line args, such as `process.argv.slice(2)`.
	 */
	args: string[];

	/**
	 * Descriptors of all known flags.
	 */
	flags: FlagDescriptor[];

	/**
	 * How to convert positionals, if they're allowed at all.
	 */
	positionals?: PositionalKinds;

	/**
	 * Whether unknown flags and unexpected positionals are issues (default: true).
	 * If false, they're ignored, with unknown flags collected into `unknown`.
	 * If "warn", they're ignored but also reported as `warnings`.
	 */
	strict?: "warn" | boolean;
}

export interface PositionalKinds {
	kinds: FlagKind[];
	rest?: FlagKind;
}

export interface RawArgs {
	/**
	 * Problems found while parsing, such as unknown flags or invalid numbers.
	 */
	issues: ArgsIssue[];

	/**
	 * Positional arguments, converted per their schema's kinds.
	 */
	positionals: unknown[];

	/**
	 * Values of unknown flags, when not in strict mode.
	 */
	unknown: Record<string, boolean | string>;

	/**
	 * Values of known flags, converted per their kinds but not yet validated.
	 */
	values: Record<string, unknown>;

	/**
	 * Unknown flags and unexpected positionals, when strict is "warn".
	 */
	warnings: ArgsIssue[];
}

type ArgsToken = NonNullable<ReturnType<typeof parseArgs>["tokens"]>[number];

/**
 * Parses raw command-line args into flag values, without validating them.
 * Flag values are converted per their kind: numbers, booleans, and JSON.
 * @param settings Args, flag descriptors, and parsing behavior.
 * @returns Converted values, positionals, and any issues found.
 */
export function parseRawArgs(settings: ParseRawArgsSettings): RawArgs {
	const { args, flags, positionals: positionalKinds, strict = true } = settings;
	const flagsByKey = new Map(flags.map((flag) => [flag.key, flag]));
	const options = createParseArgsOptions(flags);

	const issues: ArgsIssue[] = [];
	const positionals: unknown[] = [];
	const unknown: Record<string, boolean | string> = {};
	const values: Record<string, unknown> = {};
	const warnings: ArgsIssue[] = [];

	// Unknown flags and unexpected positionals are issues, warnings, or ignored.
	const unexpected = (issue: ArgsIssue) => {
		if (strict === "warn") {
			warnings.push(issue);
		} else if (strict) {
			issues.push(issue);
		}
	};

	// Positionals that fail to convert still count, so later ones keep their kinds and labels.
	let positionalIndex = 0;

	// Indices of args already consumed as values, such as `false` in `--flag false`
	// or an unknown flag's value, which would otherwise become confusing positionals.
	const consumedIndices = new Set<number>();

	// Where parsing (re)starts in args: after a flag missing its value,
	// parsing restarts at the next arg so it can be treated as its own flag.
	let start = 0;

	parsing: while (start <= args.length) {
		const { tokens } = parseArgs({
			allowPositionals: true,
			args: args.slice(start),
			options,
			strict: false,
			tokens: true,
		});

		for (const token of tokens) {
			if (token.kind === "option-terminator") {
				continue;
			}

			const index = start + token.index;

			if (token.kind === "positional") {
				if (consumedIndices.has(index)) {
					continue;
				}

				if (!positionalKinds) {
					unexpected({
						kind: "unexpected",
						message: `Unexpected argument: ${token.value}`,
					});
					continue;
				}

				const kind =
					positionalKinds.kinds.at(positionalIndex) ??
					positionalKinds.rest ??
					"string";
				const converted = convertValue(kind, token.value);

				positionalIndex += 1;

				if (converted instanceof Error) {
					issues.push({
						kind: "invalid",
						message: `Argument ${String(positionalIndex)}: ${converted.message}`,
					});
				} else {
					positionals.push(converted);
				}

				continue;
			}

			const flag = flagsByKey.get(token.name);

			if (!flag) {
				const negated = token.name.startsWith("no-")
					? flagsByKey.get(token.name.slice(3))
					: undefined;

				if (negated?.kind === "boolean" && !negated.multiple) {
					if (token.value === undefined) {
						values[negated.key] = false;
					} else {
						issues.push({
							flag: negated.key,
							kind: "invalid",
							message: `${token.rawName} does not take a value.`,
						});
					}

					continue;
				}

				if (strict === true && token.value === undefined) {
					consumedIndices.add(index + 1);
				}

				if (strict !== true) {
					unknown[token.name] = token.value ?? true;
				}

				const suggestion = getClosestFlag(
					token.name,
					flags.map((known) => known.key),
				);

				unexpected({
					flag: token.name,
					kind: "unknown",
					message: `Unknown flag: ${token.rawName}`,
					...(suggestion && { suggestion }),
				});

				continue;
			}

			// parseArgs takes the next arg as a string flag's value, even if it's another flag.
			if (
				flag.kind !== "boolean" &&
				token.value !== undefined &&
				!token.inlineValue &&
				looksLikeFlag(token.value)
			) {
				issues.push({
					flag: flag.key,
					kind: "invalid",
					message: `${token.rawName} requires a value.`,
				});
				start = index + 1;
				continue parsing;
			}

			let value = token.value;

			// Booleans may be given a separate true or false, as in `--flag false`.
			if (flag.kind === "boolean" && value === undefined) {
				const next = args[index + 1];

				if (
					(next === "false" || next === "true") &&
					isLastOptionAtIndex(tokens, token) &&
					tokens.some(
						(other) =>
							other.kind === "positional" && start + other.index === index + 1,
					)
				) {
					consumedIndices.add(index + 1);
					value = next;
				}
			}

			const converted = convertTokenValue(flag, token.rawName, value);

			if (converted instanceof Error) {
				issues.push({
					flag: flag.key,
					kind: "invalid",
					message: converted.message,
				});
			} else if (flag.multiple) {
				const existing = (values[flag.key] ?? []) as unknown[];
				values[flag.key] =
					flag.kind === "json" && Array.isArray(converted)
						? [...existing, ...(converted as unknown[])]
						: [...existing, converted];
			} else {
				values[flag.key] = converted;
			}
		}

		break;
	}

	return { issues, positionals, unknown, values, warnings };
}

function convertTokenValue(
	flag: FlagDescriptor,
	rawName: string,
	value: string | undefined,
) {
	if (flag.kind === "boolean") {
		if (value === undefined) {
			return true;
		}

		switch (value) {
			case "false":
				return false;
			case "true":
				return true;
		}

		return new Error(
			`${rawName}: Expected true or false, received ${JSON.stringify(value)}.`,
		);
	}

	if (value === undefined) {
		return new Error(`${rawName} requires a value.`);
	}

	const converted = convertValue(flag.kind, value);

	if (converted instanceof Error) {
		return new Error(`${rawName}: ${converted.message}`);
	}

	if (
		flag.choices &&
		flag.kind !== "json" &&
		!flag.choices.includes(converted)
	) {
		return new Error(
			`${rawName}: Expected ${formatChoices(flag.choices)}, received ${JSON.stringify(value)}.`,
		);
	}

	return converted;
}

function formatChoices(choices: readonly unknown[]) {
	const formatted = choices.map((choice) => JSON.stringify(choice));

	return formatted.length > 2
		? `${formatted.slice(0, -1).join(", ")}, or ${formatted.at(-1) ?? ""}`
		: formatted.join(" or ");
}

// In a short flag group such as -ab, only the last flag may take the next arg.
function convertValue(kind: FlagKind, value: string) {
	switch (kind) {
		case "boolean":
			if (value === "true" || value === "false") {
				return value === "true";
			}

			return new Error(
				`Expected true or false, received ${JSON.stringify(value)}.`,
			);

		case "integer":
		case "number":
			if (!numberPattern.test(value)) {
				return new Error(
					`Expected a number, received ${JSON.stringify(value)}.`,
				);
			}

			return Number(value);

		case "json":
			try {
				return JSON.parse(value) as unknown;
			} catch {
				return new Error(
					`Expected valid JSON, received ${JSON.stringify(value)}.`,
				);
			}

		case "string":
			return value;
	}
}

function createParseArgsOptions(flags: FlagDescriptor[]) {
	const options: ParseArgsOptionsConfig = {};

	for (const flag of flags) {
		options[flag.key] = {
			multiple: flag.multiple,
			...(flag.short && { short: flag.short }),
			type: flag.kind === "boolean" ? "boolean" : "string",
		};
	}

	return options;
}

function isLastOptionAtIndex(tokens: ArgsToken[], token: ArgsToken) {
	return (
		tokens.findLast(
			(other) => other.kind === "option" && other.index === token.index,
		) === token
	);
}

function looksLikeFlag(value: string) {
	return (
		value.length > 1 && value.startsWith("-") && !numberPattern.test(value)
	);
}
