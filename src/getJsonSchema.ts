import type { ArgsSchema } from "./types.ts";

export type JsonSchema = Record<string, unknown>;

/**
 * Generates the input JSON Schema for a Standard JSON Schema.
 * @param schema Schema implementing Standard JSON Schema.
 * @returns The schema's input type as a JSON Schema object.
 */
export function getJsonSchema(schema: ArgsSchema): JsonSchema {
	const converter = (schema["~standard"] as Partial<ArgsSchema["~standard"]>)
		.jsonSchema;

	if (!converter) {
		throw new TypeError(
			`Schemas from ${schema["~standard"].vendor} must implement Standard JSON Schema (https://standardschema.dev/json-schema) to be used as CLI args.`,
		);
	}

	return converter.input({
		libraryOptions: {
			// Zod: allow schemas such as z.custom() and z.date() without throwing.
			unrepresentable: "any",
		},
		target: "draft-2020-12",
	});
}

/**
 * @param value Any value.
 * @returns Whether the value is a Standard Schema.
 */
export function isArgsSchema(value: unknown): value is ArgsSchema {
	// ArkType schemas are callable functions, not plain objects.
	return (
		(typeof value === "function" ||
			(typeof value === "object" && value !== null)) &&
		"~standard" in value
	);
}
