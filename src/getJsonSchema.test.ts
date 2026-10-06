import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { type } from "arktype";
import * as v from "valibot";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import {
	getJsonSchema,
	getSupplementalJsonSchemas,
	isArgsSchema,
} from "./getJsonSchema.ts";

describe(getJsonSchema, () => {
	it("returns the input JSON Schema when the schema implements Standard JSON Schema", () => {
		expect(getJsonSchema(z.object({ count: z.number().default(1) }))).toEqual({
			$schema: "https://json-schema.org/draft/2020-12/schema",
			properties: { count: { default: 1, type: "number" } },
			type: "object",
		});
	});

	it("requests draft 2020-12 with options for unrepresentable types", () => {
		const input = vi.fn().mockReturnValue({ type: "string" });

		getJsonSchema({
			"~standard": {
				jsonSchema: { input, output: vi.fn() },
				validate: vi.fn(),
				vendor: "test",
				version: 1,
			},
		});

		expect(input).toHaveBeenCalledWith({
			libraryOptions: {
				errorMode: "ignore",
				fallback: expect.any(Function),
				unrepresentable: "any",
			},
			target: "draft-2020-12",
		});

		const [[{ libraryOptions }]] = input.mock.calls as [
			[{ libraryOptions: { fallback: (context: object) => unknown } }],
		];

		expect(libraryOptions.fallback({ base: { type: "string" } })).toEqual({
			type: "string",
		});
	});

	it("throws a helpful TypeError when the converter throws an error", () => {
		const cause = new Error("Unsupported schema.");
		const schema = {
			"~standard": {
				jsonSchema: {
					input: () => {
						throw cause;
					},
					output: vi.fn(),
				},
				validate: vi.fn(),
				vendor: "test",
				version: 1 as const,
			},
		};

		expect(() => getJsonSchema(schema)).toThrow(
			new TypeError(
				"Could not convert a schema from test to JSON Schema (Unsupported schema.). CLI args' input types must be representable in JSON Schema: for other types, accept a string and convert it with a transform.",
			),
		);
	});

	it("throws a helpful TypeError when the converter throws a non-error", () => {
		const schema = {
			"~standard": {
				jsonSchema: {
					input: () => {
						// eslint-disable-next-line @typescript-eslint/only-throw-error
						throw "Unsupported.";
					},
					output: vi.fn(),
				},
				validate: vi.fn(),
				vendor: "test",
				version: 1 as const,
			},
		};

		expect(() => getJsonSchema(schema)).toThrow(
			/from test to JSON Schema \(Unsupported\.\)/,
		);
	});

	it.each([
		[
			"Valibot check()",
			toStandardJsonSchema(
				v.object({
					name: v.pipe(
						v.string(),
						v.check((s) => s.length > 1),
					),
				}),
			),
		],
		[
			"Valibot custom()",
			toStandardJsonSchema(v.object({ name: v.custom<string>(() => true) })),
		],
		["ArkType Date", type({ name: "Date" })],
		[
			"ArkType narrow()",
			type({ name: type("string").narrow((s) => s.length > 1) }),
		],
	])("does not throw when given a schema with %s", (_, schema) => {
		expect(getJsonSchema(schema)).toMatchObject({ type: "object" });
	});

	it("does not throw when the schema contains types unrepresentable in JSON Schema", () => {
		expect(getJsonSchema(z.object({ when: z.date() }))).toMatchObject({
			properties: { when: {} },
		});
	});

	it("throws a helpful TypeError when the schema does not implement Standard JSON Schema", () => {
		const schema = {
			"~standard": { validate: vi.fn(), vendor: "legacy", version: 1 },
		};

		expect(() =>
			getJsonSchema(schema as never),
		).toThrowErrorMatchingInlineSnapshot(
			`[TypeError: Schemas from legacy must implement Standard JSON Schema (https://standardschema.dev/json-schema) to be used as CLI args.]`,
		);
	});
});

describe(isArgsSchema, () => {
	it("returns true when given an object schema", () => {
		expect(isArgsSchema(z.string())).toBe(true);
	});

	it("returns true when given a callable schema", () => {
		expect(isArgsSchema(type("string"))).toBe(true);
	});

	it("returns false when given a record of schemas", () => {
		expect(isArgsSchema({ name: z.string() })).toBe(false);
	});

	it("returns false when given a non-object", () => {
		expect(isArgsSchema(null)).toBe(false);
		expect(isArgsSchema("~standard")).toBe(false);
		expect(isArgsSchema(() => undefined)).toBe(false);
	});
});

describe(getSupplementalJsonSchemas, () => {
	it("returns the output JSON Schema when the schema is not from ArkType", () => {
		expect(
			getSupplementalJsonSchemas(z.object({ count: z.number().default(1) })),
		).toEqual([
			expect.objectContaining({
				properties: { count: { default: 1, type: "number" } },
			}),
		]);
	});

	it("returns the output and ArkType JSON Schemas when the schema is from ArkType", () => {
		expect(
			getSupplementalJsonSchemas(type({ count: ["number", "=", 1] })),
		).toEqual([
			expect.objectContaining({ properties: { count: { type: "number" } } }),
			expect.objectContaining({
				properties: { count: { default: 1, type: "number" } },
			}),
		]);
	});

	it("skips JSON Schemas that throw or aren't objects", () => {
		const schema = Object.assign(
			{
				"~standard": {
					jsonSchema: {
						input: vi.fn(),
						output: () => {
							throw new Error("Oh no");
						},
					},
					validate: vi.fn(),
					vendor: "test",
					version: 1 as const,
				},
			},
			{ toJsonSchema: () => "not an object" },
		);

		expect(getSupplementalJsonSchemas(schema)).toEqual([]);
	});
});
