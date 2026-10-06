import type {
	ArgsSchema,
	FlagDescriptor,
	FlagKind,
	OptionsDefinition,
} from "./types.ts";

import {
	getJsonSchema,
	isArgsSchema,
	type JsonSchema,
} from "./getJsonSchema.ts";

interface TypeDescription {
	choices?: readonly unknown[];
	kind: FlagKind;
	multiple: boolean;
}

/**
 * Describes each flag in an options definition, using its JSON Schema.
 * @param options Either one object schema, or a record of per-flag schemas.
 * @returns One descriptor per flag, in declaration order.
 */
export function describeOptions(options: OptionsDefinition): FlagDescriptor[] {
	if (isArgsSchema(options)) {
		const root = getJsonSchema(options);
		const object = resolveReference(root, root);
		const properties = (object.properties ?? {}) as Record<string, JsonSchema>;
		const required = new Set((object.required ?? []) as string[]);

		return Object.entries(properties).map(([key, property]) =>
			describeFlag(key, property, root, required.has(key)),
		);
	}

	return Object.entries(options).map(([key, schema]) => {
		const root = getJsonSchema(schema);

		return {
			...describeFlag(key, root, root, isRequiredSchema(schema)),
			schema,
		};
	});
}

/**
 * Describes the element type of a positionals schema.
 * @param positionals Schema for the array of positional arguments.
 * @returns How to convert each positional, and help text metadata.
 */
export function describePositionals(positionals: ArgsSchema) {
	const root = getJsonSchema(positionals);
	const array = resolveReference(root, root);
	// Tuples without a rest element have `items: false`.
	const items = array.items as boolean | JsonSchema | undefined;
	const prefixItems = (array.prefixItems ?? []) as JsonSchema[];

	return {
		description: array.description as string | undefined,
		kinds: prefixItems.map((item) => describeType(item, root).kind),
		maxItems:
			typeof array.maxItems === "number"
				? array.maxItems
				: items === false
					? prefixItems.length
					: undefined,
		minItems: typeof array.minItems === "number" ? array.minItems : undefined,
		placeholder: array.placeholder as string | undefined,
		rest:
			typeof items === "object" ? describeType(items, root).kind : undefined,
		root,
	};
}

function describeFlag(
	key: string,
	property: JsonSchema,
	root: JsonSchema,
	required: boolean,
): FlagDescriptor {
	const merged = mergeWrappers(property, root);
	const type = describeType(merged, root);

	return {
		...(type.choices && { choices: type.choices }),
		...("default" in merged && { default: merged.default }),
		...stringProperty(merged, "defaultDescription"),
		...stringProperty(merged, "description"),
		...(merged.hidden === true && { hidden: true }),
		key,
		kind: type.kind,
		multiple: type.multiple,
		...stringProperty(merged, "placeholder"),
		required: required && !("default" in merged),
		...stringProperty(merged, "short"),
	};
}

function describeType(schema: JsonSchema, root: JsonSchema): TypeDescription {
	const merged = mergeWrappers(schema, root);
	const choices = getChoices(merged, root);

	if (choices) {
		return { choices, kind: kindOfValues(choices), multiple: false };
	}

	const types = getTypes(merged);

	if (types.length !== 1) {
		return {
			kind: types.length && types.every(isNumericType) ? "number" : "string",
			multiple: false,
		};
	}

	switch (types[0]) {
		case "array": {
			const items = merged.items as JsonSchema | undefined;
			const element = items && describeType(items, root);

			return {
				...(element?.choices && { choices: element.choices }),
				kind:
					!element || element.multiple || element.kind === "boolean"
						? "json"
						: element.kind,
				multiple: true,
			};
		}

		case "boolean":
		case "integer":
		case "number":
			return { kind: types[0], multiple: false };

		case "object":
			return { kind: "json", multiple: false };

		default:
			return { kind: "string", multiple: false };
	}
}

function getChoices(schema: JsonSchema, root: JsonSchema) {
	if (Array.isArray(schema.enum)) {
		return schema.enum as unknown[];
	}

	if ("const" in schema) {
		return [schema.const];
	}

	const constituents = getConstituents(schema)?.map((constituent) =>
		mergeWrappers(constituent, root),
	);

	if (!constituents?.length) {
		return undefined;
	}

	const choices: unknown[] = [];

	for (const constituent of constituents) {
		const constituentChoices = getChoices(constituent, root);
		if (!constituentChoices) {
			return undefined;
		}

		choices.push(...constituentChoices);
	}

	return choices;
}

function getConstituents(schema: JsonSchema) {
	const constituents = (schema.anyOf ?? schema.oneOf) as
		JsonSchema[] | undefined;

	return constituents?.filter((constituent) => constituent.type !== "null");
}

function getTypes(schema: JsonSchema): string[] {
	if (typeof schema.type === "string") {
		return schema.type === "null" ? [] : [schema.type];
	}

	if (Array.isArray(schema.type)) {
		return (schema.type as string[]).filter((type) => type !== "null");
	}

	const constituents = getConstituents(schema);

	return constituents
		? [...new Set(constituents.flatMap(getTypes))]
		: ["string"];
}

function isNumericType(type: string) {
	return type === "integer" || type === "number";
}

function isRequiredSchema(schema: ArgsSchema) {
	let result: ReturnType<ArgsSchema["~standard"]["validate"]>;

	try {
		result = schema["~standard"].validate(undefined);
	} catch {
		// A schema that throws for a missing value certainly doesn't accept one.
		return true;
	}

	// Async schemas can't be checked synchronously, so they're assumed optional.
	return !(result instanceof Promise) && !!result.issues;
}

function kindOfValues(values: readonly unknown[]): FlagKind {
	if (values.every((value) => typeof value === "boolean")) {
		return "boolean";
	}

	if (values.every((value) => typeof value === "number")) {
		return "number";
	}

	return "string";
}

/**
 * Unwraps `$ref`s and single-constituent `anyOf`/`oneOf`s (such as nullables),
 * keeping metadata from outer wrappers over metadata from inner schemas.
 */
function mergeWrappers(schema: JsonSchema, root: JsonSchema): JsonSchema {
	const resolved = resolveReference(schema, root);
	const constituents = getConstituents(resolved);

	if (constituents?.length !== 1) {
		return resolved;
	}

	const outer = { ...resolved };
	delete outer.anyOf;
	delete outer.oneOf;

	return { ...mergeWrappers(constituents[0], root), ...outer };
}

function resolveReference(schema: JsonSchema, root: JsonSchema): JsonSchema {
	if (typeof schema.$ref !== "string") {
		return schema;
	}

	const { $ref, ...rest } = schema;
	const path = $ref.replace(/^#\//, "").split("/");
	let target: unknown = root;

	for (const segment of path) {
		target = (target as Record<string, unknown> | undefined)?.[segment];
	}

	return target
		? { ...resolveReference(target as JsonSchema, root), ...rest }
		: rest;
}

function stringProperty<Key extends string>(schema: JsonSchema, key: Key) {
	const value = schema[key];

	return (typeof value === "string" ? { [key]: value } : {}) as Partial<
		Record<Key, string>
	>;
}
