// parseArgs (with tokens) is available as of Node.js 18.7.0, though experimental before 20.
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";

import type {
	ArgsIssue,
	FlagDescriptor,
	FlagKind,
	ValueDescription,
} from "./types.ts";

import { convertValue, formatChoices } from "./convertValue.ts";
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

/**
 * How to convert a positional: either a kind, or a full description for "mixed" values.
 */
export type PositionalKind = FlagKind | ValueDescription;

export interface PositionalKinds {
	kinds: PositionalKind[];
	rest?: PositionalKind;
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
	 * How many positionals came before a `--` terminator, if there was one.
	 */
	terminatorIndex?: number;

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

type OptionToken = Extract<ArgsToken, { kind: "option" }>;

/**
 * Parses raw command-line args into flag values, without validating them.
 * Flag values are converted per their kind: numbers, booleans, and JSON.
 * @param settings Args, flag descriptors, and parsing behavior.
 * @returns Converted values, positionals, and any issues found.
 */
export function parseRawArgs(settings: ParseRawArgsSettings): RawArgs {
	const { flags, positionals: positionalKinds, strict = true } = settings;
	const flagsByKey = new Map(flags.map((flag) => [flag.key, flag]));
	const flagsByShort = new Map(
		flags.flatMap((flag) => (flag.short ? [[flag.short, flag] as const] : [])),
	);
	const args = rewriteShortInlineValues(settings.args, flagsByShort);
	const options = createParseArgsOptions(flags);
	const suggestibleFlags = flags.filter((flag) => !flag.hidden);

	const issues: ArgsIssue[] = [];
	const positionals: unknown[] = [];
	const unknown = Object.create(null) as Record<string, boolean | string>;
	const values = Object.create(null) as Record<string, unknown>;
	const warnings: ArgsIssue[] = [];
	let terminatorIndex: number | undefined;

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

	const getPositionalKind = () =>
		positionalKinds &&
		(positionalKinds.kinds.at(positionalIndex) ??
			positionalKinds.rest ??
			"string");

	const addPositional = (value: string) => {
		const kind = getPositionalKind();

		if (!kind) {
			unexpected({
				kind: "unexpected",
				message: `Unexpected argument: ${value}`,
			});
			return;
		}

		const converted = convertValue(toValueDescription(kind), value);

		positionalIndex += 1;

		if (converted instanceof Error) {
			issues.push({
				kind: "invalid",
				message: `Argument ${String(positionalIndex)}: ${converted.message}`,
			});
		} else {
			positionals.push(converted);
		}
	};

	// Indices of args already consumed as values, such as `false` in `--flag false`
	// or an unknown flag's value, which would otherwise become confusing positionals.
	const consumedIndices = new Set<number>();

	// Indices of args whose tokens were all handled at once, such as unknown short flag groups.
	const handledIndices = new Set<number>();

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

		const isPositionalAt = (index: number) =>
			tokens.some(
				(other) => other.kind === "positional" && start + other.index === index,
			);

		// Unknown flags may take the next arg as their value, as in `--unknown value`.
		const consumeUnknownValue = (token: OptionToken, index: number) => {
			if (token.value !== undefined || !isLastOptionAtIndex(tokens, token)) {
				return token.value;
			}

			// In strict mode, the value isn't used, but shouldn't be a confusing extra issue.
			if (strict === true) {
				consumedIndices.add(index + 1);
				return undefined;
			}

			// Otherwise, it's only taken if it can't be a positional.
			if (!positionalKinds && isPositionalAt(index + 1)) {
				consumedIndices.add(index + 1);
				return args[index + 1];
			}

			return undefined;
		};

		for (const token of tokens) {
			const index = start + token.index;

			if (token.kind === "option-terminator") {
				terminatorIndex = positionals.length;
				continue;
			}

			if (token.kind === "positional") {
				if (!consumedIndices.has(index)) {
					addPositional(token.value);
				}

				continue;
			}

			if (handledIndices.has(index)) {
				continue;
			}

			if (/^-[^-]$/.test(token.rawName)) {
				const arg = args[index];

				// Negative numbers are positionals when a numeric one is allowed next, as in `-5`.
				if (
					!flagsByShort.has(arg[1]) &&
					numberPattern.test(arg) &&
					acceptsNumbers(getPositionalKind())
				) {
					handledIndices.add(index);
					addPositional(arg);
					continue;
				}

				const unknownNames = tokens
					.filter(
						(other): other is OptionToken =>
							other.kind === "option" &&
							other.index === token.index &&
							flagsByShort.get(other.rawName[1])?.key !== other.name,
					)
					.map((other) => other.name);

				if (unknownNames.length) {
					handledIndices.add(index);

					const [name] = unknownNames;
					const value =
						arg === token.rawName
							? consumeUnknownValue(token, index)
							: undefined;

					if (strict !== true) {
						for (const unknownName of unknownNames) {
							unknown[unknownName] = value ?? true;
						}
					}

					unexpected({
						flag: name,
						kind: "unknown",
						message: [
							`Unknown flag: -${name}`,
							arg !== `-${name}` && ` (in ${arg})`,
							positionalKinds &&
								`. Arguments starting with "-" can be passed after "--".`,
						]
							.filter(Boolean)
							.join(""),
					});

					continue;
				}
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

				const value = consumeUnknownValue(token, index);

				if (strict !== true) {
					unknown[token.name] = value ?? true;
				}

				const suggestion =
					token.name.length === 1
						? suggestibleFlags.find((known) => known.short === token.name)?.key
						: getClosestFlag(
								token.name,
								suggestibleFlags.map((known) => known.key),
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
				looksLikeFlag(token.value, flagsByShort)
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
					isPositionalAt(index + 1)
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

	return {
		issues,
		positionals,
		...(terminatorIndex !== undefined && { terminatorIndex }),
		unknown,
		values,
		warnings,
	};
}

function acceptsBoolean({ choices, types }: ValueDescription) {
	return !!types?.includes("boolean") || !!choices?.includes(true);
}

function acceptsNumbers(kind: PositionalKind | undefined) {
	if (!kind) {
		return false;
	}

	const description = toValueDescription(kind);

	return (
		description.kind === "integer" ||
		description.kind === "number" ||
		!!description.types?.some((type) => type === "integer" || type === "number")
	);
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
		// Mixed flags that allow booleans may be given without a value, as in `--color`.
		return flag.kind === "mixed" && acceptsBoolean(flag)
			? true
			: new Error(`${rawName} requires a value.`);
	}

	const converted = convertValue(flag, value);

	if (converted instanceof Error) {
		return new Error(`${rawName}: ${converted.message}`);
	}

	if (
		flag.choices &&
		flag.kind !== "json" &&
		flag.kind !== "mixed" &&
		!flag.choices.includes(converted)
	) {
		return new Error(
			`${rawName}: Expected ${formatChoices(flag.choices)}, received ${JSON.stringify(value)}.`,
		);
	}

	return converted;
}

function createParseArgsOptions(flags: FlagDescriptor[]) {
	// Flags may be named anything, including __proto__.
	const options = Object.create(null) as ParseArgsOptionsConfig;

	for (const flag of flags) {
		options[flag.key] = {
			multiple: flag.multiple,
			...(flag.short && { short: flag.short }),
			type: flag.kind === "boolean" ? "boolean" : "string",
		};
	}

	return options;
}

// In a short flag group such as -ab, only the last flag may take the next arg.
function isLastOptionAtIndex(tokens: ArgsToken[], token: ArgsToken) {
	return (
		tokens.findLast(
			(other) => other.kind === "option" && other.index === token.index,
		) === token
	);
}

/**
 * Whether a value parseArgs took for a flag looks like it was meant as another flag.
 * Values starting with `--` do; values starting with `-` only do if they're
 * made of known short flags, so values such as `-5` and `-dashy` are allowed.
 */
function looksLikeFlag(
	value: string,
	flagsByShort: Map<string, FlagDescriptor>,
) {
	if (value.startsWith("--")) {
		return true;
	}

	if (!value.startsWith("-") || value.length < 2) {
		return false;
	}

	for (const char of value.slice(1)) {
		const flag = flagsByShort.get(char);

		if (!flag) {
			return false;
		}

		// A short flag that takes a value takes the rest of the group, as in `-ofile`.
		if (flag.kind !== "boolean") {
			return true;
		}
	}

	return true;
}

/**
 * Rewrites known short flags with inline values, such as `-f=value`, to their
 * long equivalents, such as `--filename=value`, so they're parsed the same way.
 * Args after a `--` terminator are left as-is.
 */
function rewriteShortInlineValues(
	args: string[],
	flagsByShort: Map<string, FlagDescriptor>,
) {
	const terminator = args.indexOf("--");

	return args.map((arg, index) => {
		const match = /^-([^-])=(.*)$/s.exec(arg);
		const flag = match && flagsByShort.get(match[1]);

		return flag && (terminator === -1 || index < terminator)
			? `--${flag.key}=${match[2]}`
			: arg;
	});
}

function toValueDescription(kind: PositionalKind): ValueDescription {
	return typeof kind === "string" ? { kind } : kind;
}
