import * as prompts from "@clack/prompts";

import type { FlagDescriptor } from "../types.ts";

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
	 * Values already provided, which won't be prompted for.
	 */
	values: Record<string, unknown>;
}

/**
 * Prompts with `@clack/prompts` for any flags without values that are
 * either required or have a default to confirm.
 * @param settings Flags, existing values, and how to word prompts.
 * @returns Whether the user cancelled, and which values were prompted and completed.
 */
export async function promptForOptions(
	settings: PromptForOptionsSettings,
): Promise<PromptedOptions> {
	const { flags, message = defaultMessage, values } = settings;
	const prompted: Record<string, unknown> = {};

	for (const flag of flags) {
		if (values[flag.key] !== undefined || !(await shouldPrompt(flag))) {
			continue;
		}

		const produced = await promptForFlag(flag, message(flag));
		if (prompts.isCancel(produced)) {
			return { cancelled: true, prompted };
		}

		prompted[flag.key] = await parseWithSchema(flag, produced);
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

	if (flag.choices && !flag.multiple) {
		return await prompts.select({
			initialValue: flag.default,
			message,
			options: flag.choices.map((value) => ({
				label: String(value),
				value,
			})),
		});
	}

	const text = await prompts.text({
		message,
		...(flag.default !== undefined && {
			placeholder:
				typeof flag.default === "string"
					? flag.default
					: JSON.stringify(flag.default),
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
	const converted = convertTextValue(flag, text);

	// Multiple flags are arrays, as when parsed from args.
	if (!flag.multiple) {
		return converted;
	}

	return flag.kind === "json" && Array.isArray(converted)
		? (converted as unknown[])
		: [converted];
}

function convertTextValue(flag: FlagDescriptor, text: string) {
	switch (flag.kind) {
		case "integer":
		case "number":
			return Number(text);
		case "json":
			return JSON.parse(text) as unknown;
		default:
			return text;
	}
}

function createValidator(flag: FlagDescriptor) {
	return (text: string | undefined) => {
		if (!text) {
			return flag.default === undefined ? "Please enter a value." : undefined;
		}

		if (
			(flag.kind === "integer" || flag.kind === "number") &&
			// Prompted numbers follow the same rules as numbers parsed from args.
			!numberPattern.test(text)
		) {
			return "Please enter a numeric value.";
		}

		if (flag.kind === "json") {
			try {
				JSON.parse(text);
			} catch {
				return "Please enter valid JSON.";
			}
		}

		if (!flag.schema) {
			return undefined;
		}

		// Clack validators are synchronous, so async schemas are only validated afterwards.
		const result = flag.schema["~standard"].validate(convertText(flag, text));

		return result instanceof Promise ? undefined : result.issues?.[0]?.message;
	};
}

function defaultMessage(flag: FlagDescriptor) {
	return flag.description
		? `What will the ${flag.description} be? (--${flag.key})`
		: `What will the --${flag.key} be?`;
}

async function parseWithSchema(flag: FlagDescriptor, value: unknown) {
	if (!flag.schema) {
		return value;
	}

	const result = await flag.schema["~standard"].validate(value);

	// Synchronous schemas were validated while prompting, so only async ones can fail here.
	if (result.issues) {
		throw new Error(
			`--${flag.key}: ${result.issues.map((issue) => issue.message).join("; ")}`,
		);
	}

	return result.value;
}

/**
 * Flags are prompted for if they have a default to confirm or are required.
 * Async schemas can't be checked while describing options, so they're checked here.
 */
async function shouldPrompt(flag: FlagDescriptor) {
	if (flag.default !== undefined || flag.required) {
		return true;
	}

	if (!flag.schema) {
		return false;
	}

	try {
		return !!(await flag.schema["~standard"].validate(undefined)).issues;
	} catch {
		return true;
	}
}
