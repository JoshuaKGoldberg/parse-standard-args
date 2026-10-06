import type {
	ArgsIssue,
	ArgsSchema,
	FlagDescriptor,
	InferOptions,
	InferPositionals,
	OptionsDefinition,
} from "./types.ts";

import { describeOptions, describePositionals } from "./describeOptions.ts";
import { formatHelp } from "./formatHelp.ts";
import { formatIssues } from "./formatIssues.ts";
import { parseRawArgs, type PositionalKinds } from "./parseRawArgs.ts";
import {
	validateOptions,
	validatePositionals,
	type ValidationResult,
} from "./validateArgs.ts";

export interface BuiltinFlagSettings {
	/**
	 * Description shown for the flag in help text.
	 */
	description?: string;

	/**
	 * Single-character alias, or false for none (default: first letter, if no option uses it).
	 */
	short?: false | string;
}

export interface CliParseError {
	issues: ArgsIssue[];
	text: string;
	type: "error";

	/**
	 * Unknown flags and unexpected positionals, when strict is "warn".
	 */
	warnings: ArgsIssue[];
}

export interface CliParseHelp {
	text: string;
	type: "help";
}

export type CliParseResult<Values, Positionals> =
	| CliParseError
	| CliParseHelp
	| CliParseValues<Values, Positionals>
	| CliParseVersion;

export interface CliParseValues<Values, Positionals> {
	positionals: Positionals;

	/**
	 * How many positionals came before a `--` terminator, if there was one.
	 */
	terminatorIndex?: number;

	type: "values";
	unknown: Record<string, boolean | string>;
	values: Values;

	/**
	 * Unknown flags and unexpected positionals, when strict is "warn".
	 */
	warnings: ArgsIssue[];
}

export interface CliParseVersion {
	text: string;
	type: "version";
}

export interface CliRunSettings {
	/**
	 * Prints errors (default: console.error).
	 */
	error?: (text: string) => void;

	/**
	 * Exit code to set on `process.exitCode` for errors (default: 1).
	 */
	exitCode?: number;

	/**
	 * Prints help and version text (default: console.log).
	 */
	log?: (text: string) => void;

	/**
	 * Prints warnings, when strict is "warn" (default: console.warn).
	 */
	warn?: (text: string) => void;
}

export interface CliSettings<
	Options extends OptionsDefinition,
	Positionals extends ArgsSchema | undefined,
> {
	/**
	 * Sentence(s) describing what the CLI does, for help text.
	 */
	description?: string;

	/**
	 * Example commands, printed as-is in help text.
	 */
	examples?: string[];

	/**
	 * Text printed at the end of help text, such as a link to docs.
	 */
	footer?: string;

	/**
	 * Whether to add a built-in `--help` flag, with `-h` if no option uses it (default: true).
	 * Pass an object to customize its description or short alias.
	 */
	help?: boolean | BuiltinFlagSettings;

	/**
	 * Name of the CLI, as typed to run it.
	 */
	name: string;

	/**
	 * Either one object schema, or a record of per-flag schemas.
	 */
	options: Options;

	/**
	 * Schema for the array of positional arguments; if omitted, none are allowed.
	 */
	positionals?: Positionals;

	/**
	 * Usage text for positionals in help, such as `&lt;patterns...>`.
	 * Defaults to the positionals schema's `placeholder` metadata.
	 */
	positionalsUsage?: string;

	/**
	 * Whether unknown flags and unexpected positionals are errors (default: true).
	 * If false, they're ignored. If "warn", they're ignored but reported as warnings.
	 */
	strict?: "warn" | boolean;

	/**
	 * Usage text after the CLI's name in help, such as `[--dry-run] &lt;patterns...>`.
	 * Defaults to `[options]` followed by the positionals usage.
	 */
	usage?: string;

	/**
	 * Version to print for a built-in `--version` flag, with `-v` if no option uses it.
	 * Pass an object to customize its description or short alias.
	 */
	version?: string | VersionFlagSettings;
}

export interface VersionFlagSettings extends BuiltinFlagSettings {
	/**
	 * Version to print.
	 */
	version: string;
}

/**
 * Creates a CLI that parses args with `node:util`'s `parseArgs`, validates them
 * with Standard Schemas, and generates help text and friendly errors.
 * @param settings The CLI's name, options, positionals, and help metadata.
 * @returns Functions to parse args, run with printing, and format help.
 */
export function createCli<
	Options extends OptionsDefinition,
	Positionals extends ArgsSchema | undefined = undefined,
>(settings: CliSettings<Options, Positionals>) {
	type Values = InferOptions<Options>;
	type PositionalValues = InferPositionals<Positionals>;
	type Result = CliParseResult<Values, PositionalValues>;

	const { help = true, name, options, positionals } = settings;
	const version =
		typeof settings.version === "string"
			? { version: settings.version }
			: settings.version;
	const optionFlags = describeOptions(options);
	const builtinFlags = createBuiltinFlags(optionFlags, help, version);
	const flags = [...optionFlags, ...builtinFlags];
	const hasHelpFlag = builtinFlags.some((flag) => flag.key === "help");

	assertValidShorts(flags);
	const positionalsDescription =
		positionals && describePositionals(positionals);
	const positionalKinds: PositionalKinds | undefined =
		positionalsDescription && {
			kinds: positionalsDescription.kinds,
			...(positionalsDescription.rest && {
				rest: positionalsDescription.rest,
			}),
		};

	function getHelpText() {
		return formatHelp({
			...(settings.description && { description: settings.description }),
			...(settings.examples && { examples: settings.examples }),
			flags,
			...(settings.footer && { footer: settings.footer }),
			name,
			...(positionalsDescription && {
				positionals: {
					...(positionalsDescription.description && {
						description: positionalsDescription.description,
					}),
					usage:
						settings.positionalsUsage ??
						formatPositionalsUsage(positionalsDescription),
				},
			}),
			...(settings.usage && { usage: settings.usage }),
			// Descriptions wrap to the terminal's width when printing to one.
			...(process.stdout.isTTY && { width: process.stdout.columns }),
		});
	}

	async function parse(args: string[]): Promise<Result> {
		const raw = parseRawArgs({
			args,
			flags,
			...(positionalKinds && { positionals: positionalKinds }),
			...(settings.strict !== undefined && { strict: settings.strict }),
		});
		const optionValues = Object.assign(
			Object.create(null) as Record<string, unknown>,
			raw.values,
		);

		for (const builtin of builtinFlags) {
			if (!optionValues[builtin.key]) {
				continue;
			}

			return builtin.key === "help"
				? { text: getHelpText(), type: "help" }
				: { text: version?.version ?? "", type: "version" };
		}

		for (const builtin of builtinFlags) {
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete optionValues[builtin.key];
		}

		// Positionals that failed to convert would make validation issues confusing.
		const positionalsConverted = !raw.issues.some(
			(issue) => issue.kind === "invalid" && !issue.flag,
		);

		const [validatedOptions, validatedPositionals] = await Promise.all([
			validateOptions<Values>(options, optionValues),
			positionals && positionalsConverted
				? validatePositionals<PositionalValues>(positionals, raw.positionals)
				: ({ value: raw.positionals } as ValidationResult<PositionalValues>),
		]);
		const validationIssues = validatedOptions.issues ?? [];
		const parsedFlags = new Set(raw.issues.map((issue) => issue.flag));

		// Flags that weren't provided and that the schema rejects as missing are required.
		const missingFlags = optionFlags
			.map((flag) => flag.key)
			.filter(
				(key) =>
					!Object.hasOwn(optionValues, key) &&
					!parsedFlags.has(key) &&
					validationIssues.some((issue) => issue.flag === key),
			);

		// Each flag should only be reported once, with its most specific issue.
		const reportedFlags = new Set([...parsedFlags, ...missingFlags]);
		const issues = [
			...raw.issues,
			...missingFlags.map((key): ArgsIssue => ({
				flag: key,
				kind: "missing",
				message: `--${key} is required.`,
			})),
			...validationIssues.filter(
				(issue) => !issue.flag || !reportedFlags.has(issue.flag),
			),
			...(validatedPositionals.issues ?? []),
		];

		if (issues.length) {
			return {
				issues,
				text: [
					formatIssues(issues),
					hasHelpFlag && `Run '${name} --help' for usage.`,
				]
					.filter(Boolean)
					.join("\n"),
				type: "error",
				warnings: raw.warnings,
			};
		}

		return {
			positionals: validatedPositionals.value as PositionalValues,
			...(raw.terminatorIndex !== undefined && {
				terminatorIndex: raw.terminatorIndex,
			}),
			type: "values",
			unknown: raw.unknown,
			values: validatedOptions.value as Values,
			warnings: raw.warnings,
		};
	}

	/**
	 * Parses args, printing help, version, warnings, or errors as needed.
	 * Errors also set `process.exitCode` (default: 1).
	 * @param args Raw command-line args, such as `process.argv.slice(2)`.
	 * @param runSettings Overrides for how text is printed and the error exit code.
	 * @returns Parsed values and positionals, or undefined if the CLI shouldn't continue.
	 */
	async function run(args: string[], runSettings: CliRunSettings = {}) {
		// Console methods are looked up at print time, so they can be replaced in tests.
		const {
			error = (text: string) => {
				console.error(text);
			},
			exitCode = 1,
			log = (text: string) => {
				console.log(text);
			},
			warn = (text: string) => {
				console.warn(text);
			},
		} = runSettings;
		const result = await parse(args);

		switch (result.type) {
			case "error":
				if (result.warnings.length) {
					warn(formatIssues(result.warnings));
				}

				error(result.text);
				process.exitCode = exitCode;
				return undefined;

			case "help":
			case "version":
				log(result.text);
				return undefined;

			case "values":
				if (result.warnings.length) {
					warn(formatIssues(result.warnings));
				}

				return result;
		}
	}

	return { flags, formatHelp: getHelpText, parse, run };
}

function assertValidShorts(flags: FlagDescriptor[]) {
	const keysByShort = new Map<string, string>();

	for (const { key, short } of flags) {
		if (short === undefined) {
			continue;
		}

		if (short.length !== 1) {
			throw new TypeError(
				`--${key}'s short alias must be a single character, but it's "${short}".`,
			);
		}

		const existing = keysByShort.get(short);

		if (existing) {
			throw new TypeError(
				`--${existing} and --${key} can't both use the short alias -${short}.`,
			);
		}

		keysByShort.set(short, key);
	}
}

function createBuiltinFlags(
	optionFlags: FlagDescriptor[],
	help: boolean | BuiltinFlagSettings,
	version: undefined | VersionFlagSettings,
) {
	const keys = new Set(optionFlags.map((flag) => flag.key));
	const shorts = new Set(optionFlags.map((flag) => flag.short));
	const builtins: FlagDescriptor[] = [];

	function createBuiltinFlag(
		key: string,
		defaultDescription: string,
		{ description = defaultDescription, short }: BuiltinFlagSettings,
	): FlagDescriptor {
		const resolvedShort = short ?? (!shorts.has(key[0]) && key[0]);

		// Later built-in flags shouldn't default to a short alias taken by an earlier one.
		if (resolvedShort) {
			shorts.add(resolvedShort);
		}

		return {
			description,
			key,
			kind: "boolean",
			multiple: false,
			required: false,
			...(resolvedShort && { short: resolvedShort }),
		};
	}

	if (help && !keys.has("help")) {
		builtins.push(
			createBuiltinFlag(
				"help",
				"Show this help message",
				help === true ? {} : help,
			),
		);
	}

	if (version && !keys.has("version")) {
		builtins.push(
			createBuiltinFlag("version", "Show the version number", version),
		);
	}

	return builtins;
}

function formatPositionalsUsage({
	maxItems,
	minItems,
	placeholder = "args",
}: {
	maxItems?: number;
	minItems?: number;
	placeholder?: string;
}) {
	const repeated = maxItems === 1 ? placeholder : `${placeholder}...`;

	return minItems ? `<${repeated}>` : `[${repeated}]`;
}
