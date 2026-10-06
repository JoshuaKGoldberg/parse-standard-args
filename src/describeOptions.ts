import type {
	ArgsSchema,
	FlagDescriptor,
	FlagValueType,
	OptionsDefinition,
	ValueDescription,
} from "./types.ts";

import {
	getJsonSchema,
	getSupplementalJsonSchemas,
	isArgsSchema,
	type JsonSchema,
} from "./getJsonSchema.ts";

interface TypeDescription extends ValueDescription {
	multiple: boolean;
}

type ValueCategory = "boolean" | "number" | "other" | "string";

/**
 * Describes each flag in an options definition, using its JSON Schema.
 * @param options Either one object schema, or a record of per-flag schemas.
 * @returns One descriptor per flag, in declaration order.
 */
export function describeOptions(options: OptionsDefinition): FlagDescriptor[] {
	if (isArgsSchema(options)) {
		const root = getJsonSchema(options);
		const object = getObjectSchema(root, root);

		if (!object) {
			throw new TypeError(
				`Options schemas must describe an object of flags, such as z.object({ ... }), but the schema from ${options["~standard"].vendor} doesn't. Unions, intersections, and other non-object schemas aren't supported.`,
			);
		}

		const properties = (object.properties ?? {}) as Record<string, JsonSchema>;
		const required = new Set((object.required ?? []) as string[]);
		const getSupplementalDefault = createSupplementalDefaultGetter(
			options,
			(supplemental) =>
				getObjectSchema(supplemental, supplemental)?.properties as
					Record<string, JsonSchema> | undefined,
		);

		return Object.entries(properties).map(([key, property]) =>
			describeFlag(key, property, root, required.has(key), () =>
				getSupplementalDefault(key),
			),
		);
	}

	return Object.entries(options).map(([key, schema]) => {
		const root = getJsonSchema(schema);
		const getSupplementalDefault = createSupplementalDefaultGetter(
			schema,
			(supplemental) => ({ [key]: supplemental }),
		);

		return {
			...describeFlag(key, root, root, isRequiredSchema(schema), () =>
				getSupplementalDefault(key),
			),
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
		kinds: prefixItems.map((item) =>
			toPositionalKind(describeType(item, root)),
		),
		maxItems:
			typeof array.maxItems === "number"
				? array.maxItems
				: items === false
					? prefixItems.length
					: undefined,
		minItems: typeof array.minItems === "number" ? array.minItems : undefined,
		placeholder: array.placeholder as string | undefined,
		rest:
			typeof items === "object"
				? toPositionalKind(describeType(items, root))
				: undefined,
		root,
	};
}

function createSupplementalDefaultGetter(
	schema: ArgsSchema,
	getProperties: (
		supplemental: JsonSchema,
	) => Record<string, JsonSchema> | undefined,
) {
	let supplementals: JsonSchema[] | undefined;

	return (key: string) => {
		supplementals ??= getSupplementalJsonSchemas(schema);

		for (const supplemental of supplementals) {
			const property = getProperties(supplemental)?.[key];
			const merged = property && mergeWrappers(property, supplemental);

			if (merged && "default" in merged) {
				return { default: merged.default };
			}
		}

		return undefined;
	};
}

function describeChoices(choices: readonly unknown[]): TypeDescription {
	const categories = new Set(choices.map(getValueCategory));
	const [category] = categories;

	return categories.size === 1 && category !== "other"
		? { choices, kind: category, multiple: false }
		: { choices, kind: "mixed", multiple: false, types: [] };
}

function describeFlag(
	key: string,
	property: JsonSchema,
	root: JsonSchema,
	required: boolean,
	getSupplementalDefault: () => undefined | { default: unknown },
): FlagDescriptor {
	const merged = mergeWrappers(property, root);
	const type = describeType(merged, root);

	// Some libraries, such as ArkType, leave defaults out of input JSON Schemas.
	const defaulted =
		"default" in merged
			? { default: merged.default }
			: getSupplementalDefault();

	return {
		...(type.choices && { choices: type.choices }),
		...defaulted,
		...stringProperty(merged, "defaultDescription"),
		...stringProperty(merged, "description"),
		...(merged.hidden === true && { hidden: true }),
		key,
		kind: type.kind,
		multiple: type.multiple,
		...stringProperty(merged, "placeholder"),
		required: required && !defaulted,
		...stringProperty(merged, "short"),
		...(type.types && { types: type.types }),
	};
}

function describeType(schema: JsonSchema, root: JsonSchema): TypeDescription {
	const merged = mergeWrappers(schema, root);
	const choices = getChoices(merged, root);

	if (choices) {
		return describeChoices(choices);
	}

	const types = getTypes(merged);

	if (types.length !== 1) {
		return describeUnion(merged, root);
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
				...(element?.types && { types: element.types }),
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

/**
 * Describes a union of types and/or literals, such as `"auto" | number`.
 * Unions of one category of primitive, such as `number | integer`, are that primitive;
 * unions of several, such as `number | boolean`, are "mixed".
 */
function describeUnion(schema: JsonSchema, root: JsonSchema): TypeDescription {
	const literals: unknown[] = [];
	const types = new Set<string>();

	gatherUnion(schema, root, literals, types);

	const categories = new Set([
		...literals.map(getValueCategory),
		...[...types].map(getTypeCategory),
	]);

	if (!types.size || categories.has("other")) {
		return { kind: "string", multiple: false };
	}

	if (categories.size === 1) {
		const [category] = categories as Set<Exclude<ValueCategory, "other">>;

		return {
			kind:
				category === "number" &&
				!types.has("number") &&
				literals.every(Number.isInteger)
					? "integer"
					: category,
			multiple: false,
		};
	}

	return {
		...(literals.length && { choices: literals }),
		kind: "mixed",
		multiple: false,
		types: [...types].filter(
			(type): type is FlagValueType =>
				!(type === "integer" && types.has("number")),
		),
	};
}

function gatherUnion(
	schema: JsonSchema,
	root: JsonSchema,
	literals: unknown[],
	types: Set<string>,
) {
	const merged = mergeWrappers(schema, root);
	const choices = getChoices(merged, root);

	if (choices) {
		literals.push(...choices);
		return;
	}

	const constituents = getConstituents(merged);

	if (constituents?.length && !merged.type) {
		for (const constituent of constituents) {
			gatherUnion(constituent, root, literals, types);
		}

		return;
	}

	for (const type of getTypes(merged)) {
		types.add(type);
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

function getObjectSchema(schema: JsonSchema, root: JsonSchema) {
	const object = mergeWrappers(schema, root);

	return object.type === "object" ||
		(object.type === undefined &&
			typeof object.properties === "object" &&
			!object.anyOf &&
			!object.oneOf &&
			!object.allOf)
		? object
		: undefined;
}

function getTypeCategory(type: string): ValueCategory {
	switch (type) {
		case "boolean":
		case "string":
			return type;
		case "integer":
		case "number":
			return "number";
		default:
			return "other";
	}
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

function getValueCategory(value: unknown): ValueCategory {
	const type = typeof value;

	return type === "boolean" || type === "number" || type === "string"
		? type
		: "other";
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
	const path = $ref.replace(/^#\/?/, "").split("/").filter(Boolean);
	let target: unknown = root;

	for (const segment of path) {
		target = (target as Record<string, unknown> | undefined)?.[
			decodePointerSegment(segment)
		];
	}

	return target
		? { ...resolveReference(target as JsonSchema, root), ...rest }
		: rest;
}

/**
 * Decodes a JSON Pointer segment in a URI fragment, such as `a~1b` for `a/b`.
 * @see https://datatracker.ietf.org/doc/html/rfc6901
 */
function decodePointerSegment(segment: string) {
	let decoded = segment;

	try {
		decoded = decodeURIComponent(segment);
	} catch {
		// Segments that aren't valid URI encodings are used as-is.
	}

	return decoded.replaceAll("~1", "/").replaceAll("~0", "~");
}

function stringProperty<Key extends string>(schema: JsonSchema, key: Key) {
	const value = schema[key];

	return (typeof value === "string" ? { [key]: value } : {}) as Partial<
		Record<Key, string>
	>;
}

function toPositionalKind({ choices, kind, types }: TypeDescription) {
	return kind === "mixed"
		? ({ ...(choices && { choices }), kind, types } as ValueDescription)
		: kind;
}
