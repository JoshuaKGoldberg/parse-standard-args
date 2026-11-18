import type { StandardSchemaV1 } from "@standard-schema/spec";

import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { type } from "arktype";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import * as z from "zod";

import type { ArgsSchema } from "./types.ts";

import { validateOptions, validatePositionals } from "./validateArgs.ts";

function createAsyncSchema<Schema extends ArgsSchema>(schema: Schema) {
	return {
		"~standard": {
			...schema["~standard"],
			validate: async (value: unknown) =>
				await schema["~standard"].validate(value),
		},
	} as Schema;
}

function createIssuesSchema(issues: StandardSchemaV1.Issue[]): ArgsSchema {
	return {
		"~standard": {
			...z.string()["~standard"],
			validate: () => ({ issues }),
		},
	};
}

function createThrowingSchema(error: unknown): ArgsSchema {
	return {
		"~standard": {
			...z.string()["~standard"],
			validate: () => {
				throw error;
			},
		},
	};
}

describe(validateOptions, () => {
	describe("with an object schema", () => {
		it("returns the validated value when the values are valid", () => {
			expect(
				validateOptions(
					z.object({ count: z.number().default(1), name: z.string() }),
					{ name: "Josh" },
				),
			).toEqual({ value: { count: 1, name: "Josh" } });
		});

		it("returns transformed values when the schema transforms", () => {
			expect(
				validateOptions(
					z.object({
						patterns: z
							.array(z.string())
							.transform((values) => values.map((value) => new RegExp(value))),
					}),
					{ patterns: ["^a", "b$"] },
				),
			).toEqual({ value: { patterns: [/^a/, /b$/] } });
		});

		it("prefixes issue messages with their flag when values are invalid", () => {
			expect(
				validateOptions(
					z.object({ count: z.number().positive(), name: z.string() }),
					{ count: 0 },
				),
			).toEqual({
				issues: [
					{
						flag: "count",
						kind: "validation",
						message: "--count: Too small: expected number to be >0",
					},
					{
						flag: "name",
						kind: "validation",
						message:
							"--name: Invalid input: expected string, received undefined",
					},
				],
			});
		});

		it("includes nested paths when an issue is inside a flag's value", () => {
			expect(
				validateOptions(
					z.object({ labels: z.array(z.object({ name: z.string() })) }),
					{ labels: [{ name: "a" }, {}] },
				),
			).toEqual({
				issues: [
					{
						flag: "labels",
						kind: "validation",
						message:
							"--labels[1].name: Invalid input: expected string, received undefined",
					},
				],
			});
		});

		it("does not prefix the message when an issue has no path", () => {
			expect(
				validateOptions(
					z
						.object({ max: z.number(), min: z.number() })
						.refine(({ max, min }) => min < max, "min must be less than max"),
					{ max: 1, min: 2 },
				),
			).toEqual({
				issues: [{ kind: "validation", message: "min must be less than max" }],
			});
		});

		it("returns an issue without a stack when the schema throws an error", () => {
			expect(
				validateOptions(createThrowingSchema(new Error("Oh no")), {}),
			).toEqual({
				issues: [{ kind: "validation", message: "Oh no" }],
			});
		});

		it("throws a TypeError when a Zod transform throws", () => {
			expect(() =>
				validateOptions(
					z.object({
						pattern: z.string().transform((value) => new RegExp(value)),
					}),
					{ pattern: "(" },
				),
			).toThrow(
				new TypeError(
					"Schemas must validate synchronously and report issues rather than throw, but one returned a Promise.",
				),
			);
		});

		it("returns an issue when the schema throws a non-error", () => {
			expect(validateOptions(createThrowingSchema("Oh no"), {})).toEqual({
				issues: [{ kind: "validation", message: "Oh no" }],
			});
		});

		it("normalizes path segment objects when an issue's path uses them", () => {
			expect(
				validateOptions(
					createIssuesSchema([
						{ message: "Bad", path: [{ key: "labels" }, { key: 0 }, "name"] },
					]),
					{},
				),
			).toEqual({
				issues: [
					{
						flag: "labels",
						kind: "validation",
						message: "--labels[0].name: Bad",
					},
				],
			});
		});

		it("does not prefix the message when an issue has an undefined path", () => {
			expect(
				validateOptions(createIssuesSchema([{ message: "Bad" }]), {}),
			).toEqual({ issues: [{ kind: "validation", message: "Bad" }] });
		});

		it("throws a TypeError when the schema validates asynchronously", () => {
			expect(() =>
				validateOptions(createAsyncSchema(z.object({ name: z.string() })), {
					name: "Josh",
				}),
			).toThrow(
				new TypeError(
					"Schemas must validate synchronously and report issues rather than throw, but one returned a Promise.",
				),
			);
		});

		it("returns issues when the schema is a Valibot schema", () => {
			expect(
				validateOptions(toStandardJsonSchema(v.object({ count: v.number() })), {
					count: "1",
				}),
			).toEqual({
				issues: [
					{
						flag: "count",
						kind: "validation",
						message: '--count: Invalid type: Expected number but received "1"',
					},
				],
			});
		});

		it("returns issues when the schema is an ArkType schema", () => {
			expect(
				validateOptions(type({ level: "'a' | 'b'" }), { level: "c" }),
			).toEqual({
				issues: [
					{
						flag: "level",
						kind: "validation",
						message: '--level: level must be "a" or "b" (was "c")',
					},
				],
			});
		});
	});

	describe("with a record of schemas", () => {
		it("returns validated values with defaults filled when the values are valid", () => {
			expect(
				validateOptions(
					{
						count: z.number().default(6),
						name: z.string(),
						optional: z.string().optional(),
					},
					{ name: "Josh" },
				),
			).toEqual({ value: { count: 6, name: "Josh" } });
		});

		it("includes an undefined value when the key was given as undefined", () => {
			const result = validateOptions(
				{ optional: z.string().optional() },
				{ optional: undefined },
			);

			expect(result).toEqual({ value: { optional: undefined } });
			expect(result.value).toHaveProperty("optional");
		});

		it("does not include values for unknown keys", () => {
			expect(
				validateOptions({ name: z.string() }, { extra: 1, name: "Josh" }),
			).toEqual({ value: { name: "Josh" } });
		});

		it("returns issues per key when values are invalid", () => {
			expect(
				validateOptions(
					{
						count: z.number().int(),
						labels: z.array(z.object({ name: z.string() })),
						name: z.string(),
					},
					{ count: 1.5, labels: [{}] },
				),
			).toEqual({
				issues: [
					{
						flag: "count",
						kind: "validation",
						message: "--count: Invalid input: expected int, received number",
					},
					{
						flag: "labels",
						kind: "validation",
						message:
							"--labels[0].name: Invalid input: expected string, received undefined",
					},
					{
						flag: "name",
						kind: "validation",
						message:
							"--name: Invalid input: expected string, received undefined",
					},
				],
			});
		});

		it("returns an issue for the key when its schema throws", () => {
			expect(
				validateOptions(
					{
						name: z.string(),
						pattern: createThrowingSchema(new Error("Oh no")),
					},
					{ name: "Josh", pattern: "(" },
				),
			).toEqual({
				issues: [
					{ flag: "pattern", kind: "validation", message: "--pattern: Oh no" },
				],
			});
		});

		it("throws a TypeError when a schema validates asynchronously", () => {
			expect(() =>
				validateOptions(
					{ name: createAsyncSchema(z.string().default("Josh")) },
					{},
				),
			).toThrow(
				new TypeError(
					"Schemas must validate synchronously and report issues rather than throw, but one returned a Promise.",
				),
			);
		});
	});
});

describe(validatePositionals, () => {
	it("returns the validated value when the positionals are valid", () => {
		expect(validatePositionals(z.array(z.string()).min(1), ["a", "b"])).toEqual(
			{ value: ["a", "b"] },
		);
	});

	it("labels issues by argument position when an element is invalid", () => {
		expect(
			validatePositionals(z.tuple([z.number(), z.number().min(5)]), [1, 2]),
		).toEqual({
			issues: [
				{
					kind: "validation",
					message: "Argument 2: Too small: expected number to be >=5",
				},
			],
		});
	});

	it("does not prefix issues when the array itself is invalid", () => {
		expect(validatePositionals(z.array(z.string()).min(2), ["a"])).toEqual({
			issues: [
				{
					kind: "validation",
					message: "Too small: expected array to have >=2 items",
				},
			],
		});
	});

	it("does not prefix the issue when the schema throws", () => {
		expect(
			validatePositionals(createThrowingSchema(new Error("Oh no")), []),
		).toEqual({ issues: [{ kind: "validation", message: "Oh no" }] });
	});

	it("throws a TypeError when the schema validates asynchronously", () => {
		expect(() =>
			validatePositionals(createAsyncSchema(z.array(z.number())), ["a"]),
		).toThrow(
			new TypeError(
				"Schemas must validate synchronously and report issues rather than throw, but one returned a Promise.",
			),
		);
	});
});
