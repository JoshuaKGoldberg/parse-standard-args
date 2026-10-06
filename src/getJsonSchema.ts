import type { ArgsSchema } from "./types.ts";

export type JsonSchema = Record<string, unknown>;

const libraryOptions = {
	// Valibot: skip actions JSON Schema can't express, such as v.check(), instead of throwing.
	errorMode: "ignore",
	// ArkType: describe constraints JSON Schema can't express, such as .narrow() and Date, by their base type.
	fallback: (context: { base: unknown }) => context.base,
	// Zod: allow schemas such as z.custom() and z.date() without throwing.
	unrepresentable: "any",
};

const target = "draft-2020-12";

/**
 * Generates the input JSON Schema for a Standard JSON Schema.
 * @param schema Schema implementing Standard JSON Schema.
 * @returns The schema's input type as a JSON Schema object.
 */
export function getJsonSchema(schema: ArgsSchema): JsonSchema {
	const standard = schema["~standard"] as Partial<ArgsSchema["~standard"]> &
		Pick<ArgsSchema["~standard"], "vendor">;
	const converter = standard.jsonSchema;

	if (!converter) {
		throw new TypeError(
			`Schemas from ${standard.vendor} must implement Standard JSON Schema (https://standardschema.dev/json-schema) to be used as CLI args.`,
		);
	}

	try {
		return converter.input({ libraryOptions, target });
	} catch (error) {
		throw new TypeError(
			`Could not convert a schema from ${standard.vendor} to JSON Schema (${error instanceof Error ? error.message : String(error)}). CLI args' input types must be representable in JSON Schema: for other types, accept a string and convert it with a transform.`,
			{ cause: error },
		);
	}
}

/**
 * Generates other JSON Schemas for a schema that may include metadata its input
 * JSON Schema doesn't, such as defaults. Any that fail to generate are skipped.
 * @param schema Schema implementing Standard JSON Schema.
 * @returns The schema's output JSON Schema and, for ArkType, its own JSON Schema.
 */
export function getSupplementalJsonSchemas(schema: ArgsSchema): JsonSchema[] {
	const generators = [
		() => schema["~standard"].jsonSchema.output({ libraryOptions, target }),
		// ArkType leaves defaults out of its input and output JSON Schemas, but not its own.
		() =>
			(
				schema as Partial<Record<"toJsonSchema", (options: object) => unknown>>
			).toJsonSchema?.({ ...libraryOptions, target }),
	];
	const schemas: JsonSchema[] = [];

	for (const generate of generators) {
		try {
			const generated = generate();

			if (typeof generated === "object" && generated) {
				schemas.push(generated as JsonSchema);
			}
		} catch {
			// These schemas only supplement the input schema, so failures are fine.
		}
	}

	return schemas;
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
