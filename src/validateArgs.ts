import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { ArgsIssue, ArgsSchema, OptionsDefinition } from "./types.ts";

import { isArgsSchema } from "./getJsonSchema.ts";

export type ValidationResult<Value> =
	| { issues: ArgsIssue[]; value?: undefined }
	| { issues?: undefined; value: Value };

/**
 * Validates parsed flag values against an options definition.
 * Schema issues are reported against their flag, as in `--flag: message`.
 * @param options Either one object schema, or a record of per-flag schemas.
 * @param values Parsed (but not yet validated) flag values.
 * @returns Either the validated values or issues explaining why they're invalid.
 */
interface IssueTarget {
	key?: string;
	label: string;
}

export async function validateOptions<Value>(
	options: OptionsDefinition,
	values: Record<string, unknown>,
): Promise<ValidationResult<Value>> {
	if (isArgsSchema(options)) {
		return await validateSchema(options, values, (path) => {
			if (!path.length) {
				return undefined;
			}

			const [key, ...rest] = path;

			return { key: String(key), label: formatFlagPath(String(key), rest) };
		});
	}

	const issues: ArgsIssue[] = [];
	const validated: Record<string, unknown> = {};

	for (const [key, schema] of Object.entries(options)) {
		const result = await validateSchema(schema, values[key], (path) => ({
			key,
			label: formatFlagPath(key, path),
		}));

		if (result.issues) {
			issues.push(...result.issues);
		} else if (result.value !== undefined || key in values) {
			validated[key] = result.value;
		}
	}

	return issues.length ? { issues } : { value: validated as Value };
}

/**
 * Validates parsed positional values against a positionals schema.
 * Issues for the array as a whole, such as too few items, aren't prefixed.
 * @param positionals Schema for the array of positional arguments.
 * @param values Parsed (but not yet validated) positional values.
 * @returns Either the validated positionals or issues explaining why they're invalid.
 */
export async function validatePositionals<Value>(
	positionals: ArgsSchema,
	values: unknown[],
): Promise<ValidationResult<Value>> {
	return await validateSchema(positionals, values, (path) => {
		const [index] = path;

		return typeof index === "number"
			? { label: `Argument ${String(index + 1)}` }
			: undefined;
	});
}

function formatFlagPath(key: string, rest: PropertyKey[]) {
	return [
		`--${key}`,
		...rest.map((segment) =>
			typeof segment === "number"
				? `[${String(segment)}]`
				: `.${String(segment)}`,
		),
	].join("");
}

function normalizePath(path: StandardSchemaV1.Issue["path"]): PropertyKey[] {
	return (path ?? []).map((segment) =>
		typeof segment === "object" ? segment.key : segment,
	);
}

async function validateSchema<Value>(
	schema: ArgsSchema,
	value: unknown,
	getTarget: (path: PropertyKey[]) => IssueTarget | undefined,
): Promise<ValidationResult<Value>> {
	let result: StandardSchemaV1.Result<unknown>;

	try {
		result = await schema["~standard"].validate(value);
	} catch (error) {
		// Transforms such as `new RegExp(value)` may throw instead of reporting issues.
		const target = getTarget([]);
		const message = error instanceof Error ? error.message : String(error);

		return {
			issues: [
				{
					...(target?.key && { flag: target.key }),
					kind: "validation",
					message: target ? `${target.label}: ${message}` : message,
				},
			],
		};
	}

	if (!result.issues) {
		return { value: result.value as Value };
	}

	return {
		issues: result.issues.map((issue) => {
			const target = getTarget(normalizePath(issue.path));

			return {
				...(target?.key && { flag: target.key }),
				kind: "validation",
				message: target ? `${target.label}: ${issue.message}` : issue.message,
			};
		}),
	};
}
