import * as prompts from "@clack/prompts";

import type { ArgsSchema, FlagDescriptor } from "../types.ts";

import { convertValue } from "../convertValue.ts";
import { numberPattern } from "../numberPattern.ts";

export type PromptedOptions =
	PromptedOptionsCancelled | PromptedOptionsCompleted;

export interface PromptedOptionsCancelled {
	cancelled: true;
	prompted: Record<string, unknown>;
}

export interface PromptedOptionsCompleted {
	cancelled: false;
	completed: Record<string, unknown>;
	prompted: Record<string, unknown>;
}

export interface PromptForOptionsSettings {
	/**
	 * Descriptors of flags that may be prompted for.
	 * Flags with a `schema` (from a record of per-flag schemas) are validated as they're entered.
	 */
	flags: FlagDescriptor[];

	/**
	 * Creates the message shown when prompting for a flag.
	 */
	message?: (flag: FlagDescriptor) => string;

	/**
	 * Whether to store flags' schema outputs, such as transformed values,
	 * rather than the values as entered (default: false).
	 * Only applies to flags with a `schema`.
	 */
	parse?: boolean;

	/**
	 * Values already provided, which won't be prompted for.
	 */
	values: Record<string, unknown>;
}

type SchemaResult =
	| { issues: string[]; output?: undefined }
	| { issues?: undefined; output: unknown };

/**
 * Prompts with `@clack/prompts` for any visible flags without values that are
 * either required or have a default to confirm.
 * Flags with a `schema` are prompted again until their schema accepts the value.
 * @param settings Flags, existing values, and how to word prompts.
 * @returns Whether the user cancelled, and which values were prompted and completed.
 */
export async function promptForOptions(
	settings: PromptForOptionsSettings,
): Promise<PromptedOptions> {
	const { flags, message = defaultMessage, parse = false, values } = settings;
	const prompted = Object.create(null) as Record<string, unknown>;

	for (const flag of flags) {
		if (
			(Object.hasOwn(values, flag.key) && values[flag.key] !== undefined) ||
			!(await shouldPrompt(flag))
		) {
			continue;
		}

		for (;;) {
			const value = await promptForFlag(flag, message(flag));

			if (prompts.isCancel(value)) {
				return { cancelled: true, prompted };
			}

			if (!flag.schema) {
				prompted[flag.key] = value;
				break;
			}

			const result = await validateWithSchema(flag.schema, value);

			if (!result.issues) {
				prompted[flag.key] = parse ? result.output : value;
				break;
			}

			// Synchronous schemas were already checked while typing, so this is usually an async one.
			prompts.log.error(`--${flag.key}: ${result.issues.join("; ")}`);
		}
	}

	return {
		cancelled: false,
		completed: { ...values, ...prompted },
		prompted,
	};
}

/**
 * Prompts for a single flag's value with a prompt suited to its kind.
 * @param flag Descriptor of the flag.
 * @param message Message to show in the prompt.
 * @returns The entered value, or the cancel symbol from `@clack/prompts`.
 */
export async function promptForFlag(
	flag: FlagDescriptor,
	message: string,
): Promise<unknown> {
	if (flag.kind === "boolean" && !flag.multiple) {
		return await prompts.confirm({
			initialValue: flag.default as boolean | undefined,
			message,
		});
	}

	// Flags with only specific values allowed choose from them.
	if (flag.choices && !flag.types?.length) {
		const options = flag.choices.map((value) => ({
			label: String(value),
			value,
		}));

		return flag.multiple
			? await prompts.multiselect({
					...(Array.isArray(flag.default) && {
						initialValues: flag.default as unknown[],
					}),
					message,
					options,
					required: flag.required,
				})
			: await prompts.select({
					initialValue: flag.default,
					message,
					options,
				});
	}

	const text = await prompts.text({
		message,
		...(flag.default !== undefined && {
			placeholder: formatPlaceholder(flag),
		}),
		validate: createValidator(flag),
	});

	if (prompts.isCancel(text)) {
		return text;
	}

	// Submitting nothing accepts the default shown as the placeholder.
	return !text && flag.default !== undefined
		? flag.default
		: convertText(flag, text);
}

function convertText(flag: FlagDescriptor, text: string) {
	if (flag.kind === "json") {
		const parsed = JSON.parse(text) as unknown;

		// Multiple flags are arrays, as when parsed from args.
		return flag.multiple && !Array.isArray(parsed) ? [parsed] : parsed;
	}

	// Multiple flags' values may be separated by commas, as in `a, b`.
	return flag.multiple
		? splitText(text).map((piece) => convertTextValue(flag, piece))
		: convertTextValue(flag, text);
}

function convertTextValue(flag: FlagDescriptor, text: string) {
	return flag.kind === "integer" || flag.kind === "number"
		? Number(text)
		: convertValue(flag, text);
}

function createValidator(flag: FlagDescriptor) {
	return (text: string | undefined) => {
		if (!text || (flag.multiple && !splitText(text).length)) {
			return flag.default === undefined ? "Please enter a value." : undefined;
		}

		const message = getTextMessage(flag, text);

		if (message || !flag.schema) {
			return message;
		}

		// Clack validators are synchronous, so async schemas are only validated afterwards.
		let result;

		try {
			result = flag.schema["~standard"].validate(convertText(flag, text));
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}

		return result instanceof Promise ? undefined : result.issues?.[0]?.message;
	};
}

function defaultMessage(flag: FlagDescriptor) {
	return flag.description
		? `What will the ${flag.description} be? (--${flag.key})`
		: `What will the --${flag.key} be?`;
}

function formatPlaceholder(flag: FlagDescriptor) {
	if (typeof flag.default === "string") {
		return flag.default;
	}

	return flag.multiple && flag.kind !== "json" && Array.isArray(flag.default)
		? flag.default.map(String).join(", ")
		: JSON.stringify(flag.default);
}

function getTextMessage(flag: FlagDescriptor, text: string) {
	if (flag.kind === "json") {
		try {
			JSON.parse(text);
		} catch {
			return "Please enter valid JSON.";
		}

		return undefined;
	}

	for (const piece of flag.multiple ? splitText(text) : [text]) {
		// Prompted numbers follow the same rules as numbers parsed from args.
		if (
			(flag.kind === "integer" || flag.kind === "number") &&
			!numberPattern.test(piece)
		) {
			return "Please enter a numeric value.";
		}

		const converted = convertValue(flag, piece);

		if (converted instanceof Error) {
			return converted.message;
		}
	}

	return undefined;
}

/**
 * Flags are prompted for if they're visible and have a default to confirm or are required.
 * Async schemas can't be checked while describing options, so they're checked here.
 */
async function shouldPrompt(flag: FlagDescriptor) {
	if (flag.hidden) {
		return false;
	}

	if (flag.default !== undefined || flag.required) {
		return true;
	}

	return !!flag.schema && !!(await validateWithSchema(flag.schema)).issues;
}

function splitText(text: string) {
	return text
		.split(",")
		.map((piece) => piece.trim())
		.filter(Boolean);
}

async function validateWithSchema(
	schema: ArgsSchema,
	value?: unknown,
): Promise<SchemaResult> {
	try {
		const result = await schema["~standard"].validate(value);

		return result.issues
			? { issues: result.issues.map((issue) => issue.message) }
			: { output: result.value };
	} catch (error) {
		return { issues: [error instanceof Error ? error.message : String(error)] };
	}
}
