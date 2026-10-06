import type {
	StandardJSONSchemaV1,
	StandardSchemaV1,
} from "@standard-schema/spec";

/**
 * A schema that implements both Standard Schema (for validation)
 * and Standard JSON Schema (for introspection into flag types and metadata).
 */
export interface ArgsSchema<Input = unknown, Output = Input> {
	readonly "~standard": StandardJSONSchemaV1.Props<Input, Output> &
		StandardSchemaV1.Props<Input, Output>;
}

/**
 * A problem found while parsing or validating CLI args.
 */
export interface ArgsIssue {
	/**
	 * Name of the flag the issue is for, without leading dashes, if known.
	 */
	flag?: string;

	/**
	 * What kind of problem the issue is:
	 * - "invalid": a value couldn't be parsed, such as a non-numeric number
	 * - "missing": a required flag wasn't provided
	 * - "unexpected": a positional was provided when none are allowed
	 * - "unknown": a flag isn't known
	 * - "validation": a schema rejected a value
	 */
	kind: ArgsIssueKind;

	/**
	 * Human-readable description of the issue.
	 */
	message: string;

	/**
	 * Name of a known flag that was likely meant instead, for unknown flags.
	 */
	suggestion?: string;
}

/**
 * What kind of problem an issue is.
 */
export type ArgsIssueKind =
	"invalid" | "missing" | "unexpected" | "unknown" | "validation";

/**
 * How a flag's raw string values are converted before validation.
 * "mixed" values may be any of several types, such as `"auto" | number`.
 */
export type FlagKind =
	"boolean" | "integer" | "json" | "mixed" | "number" | "string";

/**
 * A primitive type a "mixed" flag's values may be converted to.
 */
export type FlagValueType = "boolean" | "integer" | "number" | "string";

/**
 * Everything known about a single flag, derived from its schema.
 */
export interface FlagDescriptor {
	/**
	 * Allowed values, if the schema is an enum or union of literals.
	 * For "mixed" flags, values of any of its `types` are allowed too.
	 */
	choices?: readonly unknown[];

	/**
	 * Default value from the schema, if any.
	 */
	default?: unknown;

	/**
	 * Human-readable explanation of the default, from `.meta({ defaultDescription })`.
	 */
	defaultDescription?: string;

	/**
	 * Description from `.describe()` or `.meta({ description })`.
	 */
	description?: string;

	/**
	 * Whether to leave this flag out of generated help text.
	 */
	hidden?: boolean;

	/**
	 * Flag name as written on the command-line, without leading dashes.
	 */
	key: string;

	/**
	 * How the flag's raw string values are converted before validation.
	 */
	kind: FlagKind;

	/**
	 * Whether the flag may be provided multiple times, producing an array.
	 */
	multiple: boolean;

	/**
	 * Display name for the flag's value in help text, from `.meta({ placeholder })`.
	 */
	placeholder?: string;

	/**
	 * Whether the schema rejects the flag being omitted.
	 */
	required: boolean;

	/**
	 * The flag's own schema, when options were given as a record of schemas.
	 */
	schema?: ArgsSchema;

	/**
	 * Single-character alias, from `.meta({ short })`.
	 */
	short?: string;

	/**
	 * For "mixed" flags, primitive types (other than `choices`) values may be.
	 */
	types?: readonly FlagValueType[];
}

/**
 * How to convert a value, without a flag's other metadata.
 */
export type ValueDescription = Pick<
	FlagDescriptor,
	"choices" | "kind" | "types"
>;

/**
 * CLI options: either one object schema, or a record of per-flag schemas.
 */
export type OptionsDefinition = ArgsSchema | OptionsShape;

/**
 * A record of per-flag schemas.
 */
export type OptionsShape = Record<string, ArgsSchema>;

/**
 * The validated values produced by an options definition.
 */
export type InferOptions<Options extends OptionsDefinition> =
	Options extends ArgsSchema
		? StandardSchemaV1.InferOutput<Options>
		: InferOptionsShape<Options>;

/**
 * The validated values produced by a record of per-flag schemas.
 * Flags whose output may be undefined are optional.
 */
type InferOptionsShape<Options> = Simplify<
	{
		[
			Key in keyof Options as undefined extends InferShapeOutput<Options[Key]>
				? Key
				: never
		]?: InferShapeOutput<Options[Key]>;
	} & {
		[
			Key in keyof Options as undefined extends InferShapeOutput<Options[Key]>
				? never
				: Key
		]: InferShapeOutput<Options[Key]>;
	}
>;

type InferShapeOutput<Schema> = Schema extends ArgsSchema
	? StandardSchemaV1.InferOutput<Schema>
	: never;

type Simplify<Value> = { [Key in keyof Value]: Value[Key] } & {};

/**
 * The validated values produced by an optional positionals schema.
 */
export type InferPositionals<Positionals extends ArgsSchema | undefined> =
	Positionals extends ArgsSchema
		? StandardSchemaV1.InferOutput<Positionals>
		: string[];
