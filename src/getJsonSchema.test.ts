import { type } from "arktype";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { getJsonSchema, isArgsSchema } from "./getJsonSchema.ts";

describe(getJsonSchema, () => {
	it("returns the input JSON Schema when the schema implements Standard JSON Schema", () => {
		expect(getJsonSchema(z.object({ count: z.number().default(1) }))).toEqual({
			$schema: "https://json-schema.org/draft/2020-12/schema",
			properties: { count: { default: 1, type: "number" } },
			type: "object",
		});
	});

	it("requests draft 2020-12 with unrepresentable types allowed", () => {
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
			libraryOptions: { unrepresentable: "any" },
			target: "draft-2020-12",
		});
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
