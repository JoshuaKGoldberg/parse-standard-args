import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { type } from "arktype";
import * as v from "valibot";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { describeOptions, describePositionals } from "./describeOptions.ts";

describe(describeOptions, () => {
	describe("with a Zod object schema", () => {
		it("describes a string flag when the property is a string", () => {
			expect(describeOptions(z.object({ name: z.string() }))).toEqual([
				{ key: "name", kind: "string", multiple: false, required: true },
			]);
		});

		it("describes a number flag when the property is a number", () => {
			expect(describeOptions(z.object({ ratio: z.number() }))).toEqual([
				{ key: "ratio", kind: "number", multiple: false, required: true },
			]);
		});

		it("describes an integer flag when the property is an integer", () => {
			expect(describeOptions(z.object({ count: z.number().int() }))).toEqual([
				{ key: "count", kind: "integer", multiple: false, required: true },
			]);
		});

		it("describes a number flag when the property is coerced to a number", () => {
			expect(describeOptions(z.object({ count: z.coerce.number() }))).toEqual([
				{ key: "count", kind: "number", multiple: false, required: true },
			]);
		});

		it("describes an optional boolean flag when the property defaults to false", () => {
			expect(
				describeOptions(z.object({ dryRun: z.boolean().default(false) })),
			).toEqual([
				{
					default: false,
					key: "dryRun",
					kind: "boolean",
					multiple: false,
					required: false,
				},
			]);
		});

		it("describes an optional boolean flag when the property defaults to true", () => {
			expect(
				describeOptions(z.object({ color: z.boolean().default(true) })),
			).toEqual([
				{
					default: true,
					key: "color",
					kind: "boolean",
					multiple: false,
					required: false,
				},
			]);
		});

		it("describes string choices when the property is an enum", () => {
			expect(
				describeOptions(z.object({ level: z.enum(["low", "high"]) })),
			).toEqual([
				{
					choices: ["low", "high"],
					key: "level",
					kind: "string",
					multiple: false,
					required: true,
				},
			]);
		});

		it("describes number choices when the property is a union of number literals", () => {
			expect(
				describeOptions(
					z.object({ size: z.union([z.literal(1), z.literal(2)]) }),
				),
			).toEqual([
				{
					choices: [1, 2],
					key: "size",
					kind: "number",
					multiple: false,
					required: true,
				},
			]);
		});

		it("describes boolean choices when the property is a union of boolean literals", () => {
			expect(
				describeOptions(
					z.object({ flag: z.union([z.literal(true), z.literal(false)]) }),
				),
			).toEqual([
				{
					choices: [true, false],
					key: "flag",
					kind: "boolean",
					multiple: false,
					required: true,
				},
			]);
		});

		it("describes mixed choices when the property is a union of mixed literals", () => {
			expect(
				describeOptions(z.object({ mixed: z.literal(["a", 1, true]) })),
			).toEqual([
				{
					choices: ["a", 1, true],
					key: "mixed",
					kind: "mixed",
					multiple: false,
					required: true,
					types: [],
				},
			]);
		});

		it("describes mixed choices when the property is a union of non-primitive literals", () => {
			expect(
				describeOptions({
					"~standard": {
						jsonSchema: {
							input: () => ({
								properties: { value: { enum: ["a", null] } },
								type: "object",
							}),
							output: vi.fn(),
						},
						validate: vi.fn(),
						vendor: "test",
						version: 1,
					},
				}),
			).toEqual([
				{
					choices: ["a", null],
					key: "value",
					kind: "mixed",
					multiple: false,
					required: false,
					types: [],
				},
			]);
		});

		it("describes a mixed flag when the property is a union of a literal and a number", () => {
			expect(
				describeOptions(
					z.object({ concurrency: z.union([z.literal("auto"), z.number()]) }),
				),
			).toEqual([
				{
					choices: ["auto"],
					key: "concurrency",
					kind: "mixed",
					multiple: false,
					required: true,
					types: ["number"],
				},
			]);
		});

		it("describes a mixed flag when the property is a union of numbers and booleans", () => {
			expect(
				describeOptions(
					z.object({ value: z.union([z.number(), z.int(), z.boolean()]) }),
				),
			).toEqual([
				{
					key: "value",
					kind: "mixed",
					multiple: false,
					required: true,
					types: ["number", "boolean"],
				},
			]);
		});

		it("describes a multiple mixed flag when the property is an array of a union", () => {
			expect(
				describeOptions(
					z.object({ values: z.array(z.union([z.string(), z.number()])) }),
				),
			).toEqual([
				{
					key: "values",
					kind: "mixed",
					multiple: true,
					required: true,
					types: ["string", "number"],
				},
			]);
		});

		it("describes the type without choices when the property is a union of a literal and its type", () => {
			expect(
				describeOptions(
					z.object({
						name: z.union([z.literal("me"), z.string()]),
						size: z.union([z.literal(1), z.int()]),
						value: z.union([z.literal(1.5), z.int()]),
					}),
				),
			).toEqual([
				{ key: "name", kind: "string", multiple: false, required: true },
				{ key: "size", kind: "integer", multiple: false, required: true },
				{ key: "value", kind: "number", multiple: false, required: true },
			]);
		});

		it("describes a string flag when the property is a union including a non-primitive", () => {
			expect(
				describeOptions(
					z.object({
						value: z.union([z.string(), z.array(z.string())]),
						withLiteral: z.union([z.literal("a"), z.object({})]),
					}),
				),
			).toEqual([
				{ key: "value", kind: "string", multiple: false, required: true },
				{ key: "withLiteral", kind: "string", multiple: false, required: true },
			]);
		});

		it("describes a single choice when the property is a literal", () => {
			expect(describeOptions(z.object({ only: z.literal("one") }))).toEqual([
				{
					choices: ["one"],
					key: "only",
					kind: "string",
					multiple: false,
					required: true,
				},
			]);
		});

		it("describes the inner type when the property is nullable", () => {
			expect(
				describeOptions(z.object({ limit: z.number().nullable() })),
			).toEqual([
				{ key: "limit", kind: "number", multiple: false, required: true },
			]);
		});

		it("describes the inner choices when the property is a nullable enum", () => {
			expect(
				describeOptions(z.object({ level: z.enum(["a", "b"]).nullable() })),
			).toEqual([
				{
					choices: ["a", "b"],
					key: "level",
					kind: "string",
					multiple: false,
					required: true,
				},
			]);
		});

		it("describes an optional flag when the property is optional", () => {
			expect(
				describeOptions(z.object({ auth: z.string().optional() })),
			).toEqual([
				{ key: "auth", kind: "string", multiple: false, required: false },
			]);
		});

		it("describes a multiple string flag when the property is an array of strings", () => {
			expect(describeOptions(z.object({ tags: z.array(z.string()) }))).toEqual([
				{ key: "tags", kind: "string", multiple: true, required: true },
			]);
		});

		it("describes a multiple number flag when the property is an array of numbers", () => {
			expect(describeOptions(z.object({ ids: z.array(z.number()) }))).toEqual([
				{ key: "ids", kind: "number", multiple: true, required: true },
			]);
		});

		it("describes multiple choices when the property is an array of enums", () => {
			expect(
				describeOptions(
					z.object({
						reason: z
							.array(z.enum(["author", "subscribed"]))
							.default(["author"]),
					}),
				),
			).toEqual([
				{
					choices: ["author", "subscribed"],
					default: ["author"],
					key: "reason",
					kind: "string",
					multiple: true,
					required: false,
				},
			]);
		});

		it("describes a multiple json flag when the property is an array of objects", () => {
			expect(
				describeOptions(
					z.object({ labels: z.array(z.object({ name: z.string() })) }),
				),
			).toEqual([
				{ key: "labels", kind: "json", multiple: true, required: true },
			]);
		});

		it("describes a multiple json flag when the property is an array of booleans", () => {
			expect(describeOptions(z.object({ bits: z.array(z.boolean()) }))).toEqual(
				[{ key: "bits", kind: "json", multiple: true, required: true }],
			);
		});

		it("describes a multiple json flag when the property is an array of arrays", () => {
			expect(
				describeOptions(z.object({ grid: z.array(z.array(z.string())) })),
			).toEqual([
				{ key: "grid", kind: "json", multiple: true, required: true },
			]);
		});

		it("describes a multiple json flag when the array has no item schema", () => {
			expect(
				describeOptions({
					"~standard": {
						jsonSchema: {
							input: () => ({
								properties: { anything: { type: "array" } },
								type: "object",
							}),
							output: vi.fn(),
						},
						validate: vi.fn(),
						vendor: "test",
						version: 1,
					},
				}),
			).toEqual([
				{ key: "anything", kind: "json", multiple: true, required: false },
			]);
		});

		it("describes a json flag when the property is an object", () => {
			expect(
				describeOptions(z.object({ config: z.object({ a: z.number() }) })),
			).toEqual([
				{ key: "config", kind: "json", multiple: false, required: true },
			]);
		});

		it("describes a string flag when the property is unrepresentable in JSON Schema", () => {
			expect(
				describeOptions(
					z.object({ custom: z.custom<RegExp>(), when: z.date() }),
				),
			).toEqual([
				{ key: "custom", kind: "string", multiple: false, required: true },
				{ key: "when", kind: "string", multiple: false, required: true },
			]);
		});

		it("describes the input type when the property is transformed", () => {
			expect(
				describeOptions(
					z.object({
						pattern: z.string().transform((value) => new RegExp(value)),
					}),
				),
			).toEqual([
				{ key: "pattern", kind: "string", multiple: false, required: true },
			]);
		});

		it("describes a mixed flag when the property is a union of strings and numbers", () => {
			expect(
				describeOptions(z.object({ value: z.union([z.string(), z.number()]) })),
			).toEqual([
				{
					key: "value",
					kind: "mixed",
					multiple: false,
					required: true,
					types: ["string", "number"],
				},
			]);
		});

		it("describes a number flag when the property is a union of numeric types", () => {
			expect(
				describeOptions(
					z.object({ value: z.union([z.number(), z.number().int()]) }),
				),
			).toEqual([
				{ key: "value", kind: "number", multiple: false, required: true },
			]);
		});

		it("includes the description when the property is described", () => {
			expect(
				describeOptions(
					z.object({ auth: z.string().describe("GitHub auth token") }),
				),
			).toEqual([
				{
					description: "GitHub auth token",
					key: "auth",
					kind: "string",
					multiple: false,
					required: true,
				},
			]);
		});

		it("includes metadata when the property has meta", () => {
			expect(
				describeOptions(
					z.object({
						secret: z.string().optional().meta({
							defaultDescription: "process.env.SECRET",
							description: "A secret",
							hidden: true,
							placeholder: "token",
							short: "s",
						}),
					}),
				),
			).toEqual([
				{
					defaultDescription: "process.env.SECRET",
					description: "A secret",
					hidden: true,
					key: "secret",
					kind: "string",
					multiple: false,
					placeholder: "token",
					required: false,
					short: "s",
				},
			]);
		});

		it("ignores metadata when it is not the expected type", () => {
			expect(
				describeOptions(
					z.object({
						name: z.string().meta({ hidden: "yes", placeholder: 1, short: 2 }),
					}),
				),
			).toEqual([
				{ key: "name", kind: "string", multiple: false, required: true },
			]);
		});

		it("describes an optional flag when a required property has a default", () => {
			expect(
				describeOptions(z.object({ bandwidth: z.number().int().default(6) })),
			).toEqual([
				{
					default: 6,
					key: "bandwidth",
					kind: "integer",
					multiple: false,
					required: false,
				},
			]);
		});

		it("describes flags in declaration order", () => {
			expect(
				describeOptions(
					z.object(
						Object.fromEntries(["b", "a", "c"].map((key) => [key, z.string()])),
					),
				).map((flag) => flag.key),
			).toEqual(["b", "a", "c"]);
		});

		it("returns no flags when the object has no properties", () => {
			expect(describeOptions(z.object({}))).toEqual([]);
		});

		it("resolves references when the property is a shared schema", () => {
			const level = z.enum(["low", "high"]).meta({ id: "level" });

			expect(
				describeOptions(z.object({ input: level, output: level.optional() })),
			).toEqual([
				{
					choices: ["low", "high"],
					key: "input",
					kind: "string",
					multiple: false,
					required: true,
				},
				{
					choices: ["low", "high"],
					key: "output",
					kind: "string",
					multiple: false,
					required: false,
				},
			]);
		});
	});

	describe("with references", () => {
		const createSchema = (jsonSchema: Record<string, unknown>) => ({
			"~standard": {
				jsonSchema: { input: () => jsonSchema, output: vi.fn() },
				validate: vi.fn(),
				vendor: "test",
				version: 1 as const,
			},
		});

		it("decodes JSON Pointer escapes when resolving references", () => {
			expect(
				describeOptions(
					createSchema({
						$defs: {
							"a b": { type: "boolean" },
							"a~b": { enum: ["x", "y"] },
							"ns/num": { description: "Slashed", type: "number" },
						},
						properties: {
							escaped: { $ref: "#/$defs/a~0b" },
							slashed: { $ref: "#/$defs/ns~1num" },
							spaced: { $ref: "#/$defs/a%20b" },
							unencoded: { $ref: "#/$defs/%E0%A4%A" },
						},
						type: "object",
					}),
				),
			).toEqual([
				{
					choices: ["x", "y"],
					key: "escaped",
					kind: "string",
					multiple: false,
					required: false,
				},
				{
					description: "Slashed",
					key: "slashed",
					kind: "number",
					multiple: false,
					required: false,
				},
				{ key: "spaced", kind: "boolean", multiple: false, required: false },
				{ key: "unencoded", kind: "string", multiple: false, required: false },
			]);
		});

		it("resolves a reference to the root schema", () => {
			expect(
				describeOptions(
					createSchema({
						properties: { name: { type: "string" } },
						type: "object",
					}),
				),
			).toHaveLength(1);
			expect(
				describeOptions(
					createSchema({
						properties: { self: { $ref: "#" } },
						type: "object",
					}),
				),
			).toEqual([
				{ key: "self", kind: "json", multiple: false, required: false },
			]);
		});

		it("resolves a Zod schema whose id contains a slash", () => {
			expect(
				describeOptions(
					z.object({
						count: z.number().meta({ description: "Count", id: "ns/count" }),
					}),
				),
			).toEqual([
				{
					description: "Count",
					key: "count",
					kind: "number",
					multiple: false,
					required: true,
				},
			]);
		});

		it("resolves a root reference to its object definition", () => {
			expect(
				describeOptions(
					createSchema({
						$defs: {
							Options: {
								properties: { name: { type: "string" } },
								required: ["name"],
								type: "object",
							},
						},
						$ref: "#/$defs/Options",
					}),
				),
			).toEqual([
				{ key: "name", kind: "string", multiple: false, required: true },
			]);
		});

		it("keeps outer metadata over referenced metadata", () => {
			expect(
				describeOptions(
					createSchema({
						$defs: {
							Count: { description: "Inner", type: "integer" },
						},
						properties: {
							count: { $ref: "#/$defs/Count", description: "Outer" },
						},
						type: "object",
					}),
				),
			).toEqual([
				{
					description: "Outer",
					key: "count",
					kind: "integer",
					multiple: false,
					required: false,
				},
			]);
		});

		it("falls back to the remaining schema when a reference is unresolvable", () => {
			expect(
				describeOptions(
					createSchema({
						properties: {
							missing: { $ref: "#/$defs/Missing", description: "Gone" },
						},
						type: "object",
					}),
				),
			).toEqual([
				{
					description: "Gone",
					key: "missing",
					kind: "string",
					multiple: false,
					required: false,
				},
			]);
		});

		it("returns no flags when the object schema has no properties", () => {
			expect(describeOptions(createSchema({ type: "object" }))).toEqual([]);
		});

		it("describes types when the schema uses an array of types", () => {
			expect(
				describeOptions(
					createSchema({
						properties: {
							either: { type: ["number", "string"] },
							maybe: { type: ["integer", "null"] },
							nothing: { type: "null" },
						},
						type: "object",
					}),
				),
			).toEqual([
				{
					key: "either",
					kind: "mixed",
					multiple: false,
					required: false,
					types: ["number", "string"],
				},
				{ key: "maybe", kind: "integer", multiple: false, required: false },
				{ key: "nothing", kind: "string", multiple: false, required: false },
			]);
		});

		it("describes choices when the schema uses oneOf", () => {
			expect(
				describeOptions(
					createSchema({
						properties: {
							mode: { oneOf: [{ const: "a" }, { const: "b" }] },
						},
						type: "object",
					}),
				),
			).toEqual([
				{
					choices: ["a", "b"],
					key: "mode",
					kind: "string",
					multiple: false,
					required: false,
				},
			]);
		});
	});

	describe("with a record of schemas", () => {
		it("describes each schema as a flag with its schema attached", () => {
			const options = {
				bandwidth: z.number().default(6).describe("Max requests"),
				name: z.string(),
				tags: z.array(z.string()).optional(),
			};

			expect(describeOptions(options)).toEqual([
				{
					default: 6,
					description: "Max requests",
					key: "bandwidth",
					kind: "number",
					multiple: false,
					required: false,
					schema: options.bandwidth,
				},
				{
					key: "name",
					kind: "string",
					multiple: false,
					required: true,
					schema: options.name,
				},
				{
					key: "tags",
					kind: "string",
					multiple: true,
					required: false,
					schema: options.tags,
				},
			]);
		});

		it("describes a flag as optional when its schema accepts undefined without a default", () => {
			const options = { maybe: z.string().optional().meta({ short: "m" }) };

			expect(describeOptions(options)).toEqual([
				{
					key: "maybe",
					kind: "string",
					multiple: false,
					required: false,
					schema: options.maybe,
					short: "m",
				},
			]);
		});

		it("describes a flag as required when its schema throws for undefined", () => {
			const schema = z.string();
			const options = {
				name: {
					"~standard": {
						...schema["~standard"],
						validate: () => {
							throw new Error("Missing");
						},
					},
				},
			};

			expect(describeOptions(options)).toEqual([
				{
					key: "name",
					kind: "string",
					multiple: false,
					required: true,
					schema: options.name,
				},
			]);
		});

		it("describes a flag as optional when its schema validates asynchronously", () => {
			const later = z.string();
			const options = {
				later: {
					"~standard": {
						...later["~standard"],
						validate: async (value: unknown) =>
							await later["~standard"].validate(value),
					},
				},
			};

			expect(describeOptions(options)).toEqual([
				{
					key: "later",
					kind: "string",
					multiple: false,
					required: false,
					schema: options.later,
				},
			]);
		});
	});

	describe("with a Valibot schema", () => {
		it("describes flags when the schema is converted with toStandardJsonSchema", () => {
			expect(
				describeOptions(
					toStandardJsonSchema(
						v.object({
							count: v.optional(v.number(), 3),
							level: v.picklist(["low", "high"]),
							name: v.pipe(v.string(), v.description("Your name")),
							tags: v.optional(v.array(v.string())),
						}),
					),
				),
			).toEqual([
				{
					default: 3,
					key: "count",
					kind: "number",
					multiple: false,
					required: false,
				},
				{
					choices: ["low", "high"],
					key: "level",
					kind: "string",
					multiple: false,
					required: true,
				},
				{
					description: "Your name",
					key: "name",
					kind: "string",
					multiple: false,
					required: true,
				},
				{ key: "tags", kind: "string", multiple: true, required: false },
			]);
		});
	});

	describe("with an ArkType schema", () => {
		it("describes flags when the schema is an ArkType type", () => {
			expect(
				describeOptions(
					type({
						"count?": "number.integer",
						level: "'low' | 'high'",
						tags: "string[]",
						verbose: "boolean",
					}),
				),
			).toEqual([
				{
					choices: ["high", "low"],
					key: "level",
					kind: "string",
					multiple: false,
					required: true,
				},
				{ key: "tags", kind: "string", multiple: true, required: true },
				{ key: "verbose", kind: "boolean", multiple: false, required: true },
				{ key: "count", kind: "integer", multiple: false, required: false },
			]);
		});
	});

	describe("with schema defaults missing from the input JSON Schema", () => {
		it("reads defaults from the ArkType JSON Schema when the schema is from ArkType", () => {
			expect(
				describeOptions(
					type({
						color: ["boolean", "=", true],
						count: ["number", "=", 5],
						"name?": "string",
					}),
				),
			).toEqual([
				{
					default: true,
					key: "color",
					kind: "boolean",
					multiple: false,
					required: false,
				},
				{
					default: 5,
					key: "count",
					kind: "number",
					multiple: false,
					required: false,
				},
				{ key: "name", kind: "string", multiple: false, required: false },
			]);
		});

		it("reads defaults from the output JSON Schema when the input lacks them", () => {
			const createSchema = (output: () => Record<string, unknown>) => ({
				"~standard": {
					jsonSchema: {
						input: () => ({
							properties: { count: { type: "number" } },
							required: ["count"],
							type: "object",
						}),
						output,
					},
					validate: vi.fn(),
					vendor: "test",
					version: 1 as const,
				},
			});

			expect(
				describeOptions(
					createSchema(() => ({
						properties: { count: { default: 3, type: "number" } },
						type: "object",
					})),
				),
			).toEqual([
				{
					default: 3,
					key: "count",
					kind: "number",
					multiple: false,
					required: false,
				},
			]);
			expect(describeOptions(createSchema(() => ({ type: "string" })))).toEqual(
				[{ key: "count", kind: "number", multiple: false, required: true }],
			);
		});

		it("reads a default from the output JSON Schema when a record schema's input lacks it", () => {
			const schema = {
				"~standard": {
					jsonSchema: {
						input: () => ({ type: "number" }),
						output: () => ({ default: 3, type: "number" }),
					},
					validate: () => ({ value: 3 }),
					vendor: "test",
					version: 1 as const,
				},
			};

			expect(describeOptions({ count: schema })).toEqual([
				{
					default: 3,
					key: "count",
					kind: "number",
					multiple: false,
					required: false,
					schema,
				},
			]);
		});
	});

	it.each([
		["a string", z.string()],
		[
			"a union of objects",
			z.union([z.object({ a: z.string() }), z.object({ b: z.string() })]),
		],
		["an array", z.array(z.string())],
	])("throws a helpful TypeError when the schema is %s", (_, schema) => {
		expect(() => describeOptions(schema)).toThrow(
			new TypeError(
				"Options schemas must describe an object of flags, such as z.object({ ... }), but the schema from zod doesn't. Unions, intersections, and other non-object schemas aren't supported.",
			),
		);
	});

	it("describes flags when the schema is an object without an explicit type", () => {
		expect(
			describeOptions({
				"~standard": {
					jsonSchema: {
						input: () => ({ properties: { name: { type: "string" } } }),
						output: vi.fn(),
					},
					validate: vi.fn(),
					vendor: "test",
					version: 1,
				},
			}),
		).toEqual([
			{ key: "name", kind: "string", multiple: false, required: false },
		]);
	});

	it("throws a helpful TypeError when the schema is an intersection without an explicit type", () => {
		expect(() =>
			describeOptions({
				"~standard": {
					jsonSchema: {
						input: () => ({
							allOf: [{ type: "object" }],
							properties: { name: { type: "string" } },
						}),
						output: vi.fn(),
					},
					validate: vi.fn(),
					vendor: "test",
					version: 1,
				},
			}),
		).toThrow(TypeError);
	});

	it("throws a helpful TypeError when the schema does not implement Standard JSON Schema", () => {
		const schema = {
			"~standard": { validate: vi.fn(), vendor: "legacy", version: 1 },
		};

		expect(() => describeOptions(schema as never)).toThrow(
			new TypeError(
				"Schemas from legacy must implement Standard JSON Schema (https://standardschema.dev/json-schema) to be used as CLI args.",
			),
		);
	});

	it("throws a helpful TypeError when a record's schema does not implement Standard JSON Schema", () => {
		const schema = {
			"~standard": { validate: vi.fn(), vendor: "legacy", version: 1 },
		};

		expect(() => describeOptions({ name: schema as never })).toThrow(TypeError);
	});
});

describe(describePositionals, () => {
	it("describes a string rest kind when the schema is an array of strings", () => {
		expect(describePositionals(z.array(z.string()))).toEqual({
			description: undefined,
			kinds: [],
			placeholder: undefined,
			rest: "string",
			root: expect.objectContaining({ type: "array" }),
		});
	});

	it("describes a number rest kind when the schema is an array of numbers", () => {
		expect(describePositionals(z.array(z.number()))).toMatchObject({
			kinds: [],
			rest: "number",
		});
	});

	it("describes each kind when the schema is a tuple", () => {
		expect(
			describePositionals(z.tuple([z.number(), z.string()])),
		).toMatchObject({ kinds: ["number", "string"], rest: undefined });
	});

	it("describes kinds and a rest kind when the schema is a tuple with a rest", () => {
		expect(
			describePositionals(z.tuple([z.number().int(), z.string()], z.boolean())),
		).toMatchObject({ kinds: ["integer", "string"], rest: "boolean" });
	});

	it("describes mixed kinds as value descriptions when the schema has mixed items", () => {
		expect(
			describePositionals(
				z.tuple(
					[z.union([z.literal("auto"), z.number()])],
					z.union([z.number(), z.boolean()]),
				),
			),
		).toMatchObject({
			kinds: [{ choices: ["auto"], kind: "mixed", types: ["number"] }],
			rest: { kind: "mixed", types: ["number", "boolean"] },
		});
	});

	it("includes the description and placeholder when the schema has metadata", () => {
		expect(
			describePositionals(
				z
					.array(z.string())
					.meta({ description: "Files to check", placeholder: "files" }),
			),
		).toMatchObject({ description: "Files to check", placeholder: "files" });
	});

	it("does not describe item limits when the array has none", () => {
		expect(describePositionals(z.array(z.string()))).toMatchObject({
			maxItems: undefined,
			minItems: undefined,
		});
	});

	it("describes item limits when the array has them", () => {
		expect(
			describePositionals(z.array(z.string()).min(1).max(3)),
		).toMatchObject({ maxItems: 3, minItems: 1 });
	});

	it("describes the tuple length as the item limits when the tuple has no rest", () => {
		expect(
			describePositionals(z.tuple([z.number(), z.string()])),
		).toMatchObject({ maxItems: 2, minItems: 2 });
	});

	it("describes the prefix length as the maximum when a tuple schema has no rest or maxItems", () => {
		expect(
			describePositionals({
				"~standard": {
					jsonSchema: {
						input: () => ({
							items: false,
							prefixItems: [{ type: "number" }, { type: "string" }],
							type: "array",
						}),
						output: vi.fn(),
					},
					validate: vi.fn(),
					vendor: "test",
					version: 1,
				},
			}),
		).toMatchObject({
			kinds: ["number", "string"],
			maxItems: 2,
			minItems: undefined,
			rest: undefined,
		});
	});

	it("does not describe a maximum when the tuple has a rest", () => {
		expect(
			describePositionals(z.tuple([z.number()], z.string())),
		).toMatchObject({ maxItems: undefined, minItems: 1 });
	});

	it("describes kinds when the schema is a Valibot array", () => {
		expect(
			describePositionals(toStandardJsonSchema(v.array(v.number()))),
		).toMatchObject({ kinds: [], rest: "number" });
	});
});
