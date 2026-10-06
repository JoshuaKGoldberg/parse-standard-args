import type { TextOptions } from "@clack/prompts";

import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import type { ArgsSchema, FlagDescriptor, FlagKind } from "../types.ts";

import { describeOptions } from "../describeOptions.ts";
import { promptForFlag, promptForOptions } from "./promptForOptions.ts";

const cancel = Symbol("cancel");

const mockConfirm = vi.fn();
const mockSelect = vi.fn();
const mockText = vi.fn();

vi.mock("@clack/prompts", () => ({
	get confirm() {
		return mockConfirm;
	},
	isCancel: (value: unknown) => value === cancel,
	get select() {
		return mockSelect;
	},
	get text() {
		return mockText;
	},
}));

function createAsyncSchema(schema: ArgsSchema): ArgsSchema {
	return {
		"~standard": {
			...schema["~standard"],
			validate: async (value: unknown) =>
				await schema["~standard"].validate(value),
		},
	};
}

function createFlag(
	key: string,
	kind: FlagKind,
	overrides: Partial<FlagDescriptor> = {},
): FlagDescriptor {
	return { key, kind, multiple: false, required: false, ...overrides };
}

async function getValidator(flag: FlagDescriptor) {
	mockText.mockResolvedValueOnce(cancel);

	await promptForFlag(flag, "Message");

	return (mockText.mock.calls[0][0] as TextOptions).validate as (
		text: string | undefined,
	) => string | undefined;
}

describe(promptForFlag, () => {
	it("prompts with confirm when the flag is a boolean", async () => {
		mockConfirm.mockResolvedValueOnce(true);

		const result = await promptForFlag(
			createFlag("dryRun", "boolean", { default: false }),
			"Dry run?",
		);

		expect(result).toBe(true);
		expect(mockConfirm).toHaveBeenCalledWith({
			initialValue: false,
			message: "Dry run?",
		});
	});

	it("prompts with select when the flag has choices", async () => {
		mockSelect.mockResolvedValueOnce(2);

		const result = await promptForFlag(
			createFlag("size", "number", { choices: [1, 2], default: 1 }),
			"Size?",
		);

		expect(result).toBe(2);
		expect(mockSelect).toHaveBeenCalledWith({
			initialValue: 1,
			message: "Size?",
			options: [
				{ label: "1", value: 1 },
				{ label: "2", value: 2 },
			],
		});
	});

	it("prompts with text when the flag is a multiple boolean", async () => {
		mockText.mockResolvedValueOnce("[true]");

		const result = await promptForFlag(
			createFlag("bits", "json", { multiple: true }),
			"Bits?",
		);

		expect(result).toEqual([true]);
		expect(mockConfirm).not.toHaveBeenCalled();
	});

	it("prompts with text and wraps the value in an array when the flag is multiple with choices", async () => {
		mockText.mockResolvedValueOnce("author");

		const result = await promptForFlag(
			createFlag("reason", "string", {
				choices: ["author", "subscribed"],
				multiple: true,
			}),
			"Reason?",
		);

		expect(result).toEqual(["author"]);
		expect(mockSelect).not.toHaveBeenCalled();
	});

	it("prompts with text and returns the string when the flag is a string", async () => {
		mockText.mockResolvedValueOnce("Josh");

		const result = await promptForFlag(createFlag("name", "string"), "Name?");

		expect(result).toBe("Josh");
		expect(mockText).toHaveBeenCalledWith({
			message: "Name?",
			validate: expect.any(Function),
		});
	});

	it("includes the default as a placeholder when the flag has one", async () => {
		mockText.mockResolvedValueOnce("8");

		const result = await promptForFlag(
			createFlag("bandwidth", "integer", { default: 6 }),
			"Bandwidth?",
		);

		expect(result).toBe(8);
		expect(mockText).toHaveBeenCalledWith({
			message: "Bandwidth?",
			placeholder: "6",
			validate: expect.any(Function),
		});
	});

	it("returns the default when nothing is entered and the flag has a default", async () => {
		mockText.mockResolvedValueOnce("");

		const result = await promptForFlag(
			createFlag("bandwidth", "integer", { default: 6 }),
			"Bandwidth?",
		);

		expect(result).toBe(6);
	});

	it("converts the text to a number when the flag is a number", async () => {
		mockText.mockResolvedValueOnce("1.5");

		expect(await promptForFlag(createFlag("ratio", "number"), "Ratio?")).toBe(
			1.5,
		);
	});

	it("parses the text as JSON when the flag is json", async () => {
		mockText.mockResolvedValueOnce('{"a":1}');

		expect(
			await promptForFlag(createFlag("config", "json"), "Config?"),
		).toEqual({ a: 1 });
	});

	it("keeps a JSON array as-is when the flag is a multiple json flag", async () => {
		mockText.mockResolvedValueOnce('[{"name":"a"},{"name":"b"}]');

		expect(
			await promptForFlag(
				createFlag("labels", "json", { multiple: true }),
				"Labels?",
			),
		).toEqual([{ name: "a" }, { name: "b" }]);
	});

	it("wraps a JSON object in an array when the flag is a multiple json flag", async () => {
		mockText.mockResolvedValueOnce('{"name":"a"}');

		expect(
			await promptForFlag(
				createFlag("labels", "json", { multiple: true }),
				"Labels?",
			),
		).toEqual([{ name: "a" }]);
	});

	it("wraps the value in an array when the flag is a multiple number flag", async () => {
		mockText.mockResolvedValueOnce("3");

		expect(
			await promptForFlag(
				createFlag("ids", "number", { multiple: true }),
				"Ids?",
			),
		).toEqual([3]);
	});

	it("returns the cancel symbol when the text prompt is cancelled", async () => {
		mockText.mockResolvedValueOnce(cancel);

		expect(await promptForFlag(createFlag("name", "string"), "Name?")).toBe(
			cancel,
		);
	});

	describe("validate", () => {
		it("asks for a value when the text is empty and the flag has no default", async () => {
			const validate = await getValidator(createFlag("name", "string"));

			expect(validate("")).toBe("Please enter a value.");
			expect(validate(undefined)).toBe("Please enter a value.");
		});

		it("allows empty text when the flag has a default", async () => {
			const validate = await getValidator(
				createFlag("name", "string", { default: "Josh" }),
			);

			expect(validate("")).toBeUndefined();
		});

		it("allows any text when the flag is a string without a schema", async () => {
			const validate = await getValidator(createFlag("name", "string"));

			expect(validate("anything")).toBeUndefined();
		});

		it("asks for a number when the text is not numeric and the flag is a number", async () => {
			const validate = await getValidator(createFlag("ratio", "number"));

			expect(validate("abc")).toBe("Please enter a numeric value.");
			expect(validate("0x10")).toBe("Please enter a numeric value.");
			expect(validate("Infinity")).toBe("Please enter a numeric value.");
			expect(validate(" ")).toBe("Please enter a numeric value.");
			expect(validate("1.5")).toBeUndefined();
			expect(validate("-1e3")).toBeUndefined();
		});

		it("asks for a number when the text is not numeric and the flag is an integer", async () => {
			const validate = await getValidator(createFlag("count", "integer"));

			expect(validate("abc")).toBe("Please enter a numeric value.");
			expect(validate("2")).toBeUndefined();
		});

		it("asks for valid JSON when the text is invalid JSON and the flag is json", async () => {
			const validate = await getValidator(createFlag("config", "json"));

			expect(validate("{")).toBe("Please enter valid JSON.");
			expect(validate("{}")).toBeUndefined();
		});

		it("returns the schema's first issue message when the flag has a schema", async () => {
			const validate = await getValidator(
				createFlag("count", "integer", { schema: z.number().int().min(1) }),
			);

			expect(validate("0")).toBe("Too small: expected number to be >=1");
			expect(validate("1.5")).toBe(
				"Invalid input: expected int, received number",
			);
			expect(validate("1")).toBeUndefined();
		});

		it("validates the value as an array when the flag is multiple with a schema", async () => {
			const validate = await getValidator(
				createFlag("tags", "string", {
					multiple: true,
					schema: z.array(z.string().min(2)),
				}),
			);

			expect(validate("a")).toBe(
				"Too small: expected string to have >=2 characters",
			);
			expect(validate("ab")).toBeUndefined();
		});

		it("skips schema validation when the schema validates asynchronously", async () => {
			const validate = await getValidator(
				createFlag("name", "string", {
					schema: createAsyncSchema(z.string().min(5)),
				}),
			);

			expect(validate("a")).toBeUndefined();
		});
	});
});

describe(promptForOptions, () => {
	it("prompts for required flags and flags with defaults that have no values", async () => {
		mockConfirm.mockResolvedValueOnce(true);
		mockText.mockResolvedValueOnce("8").mockResolvedValueOnce("Josh");

		const result = await promptForOptions({
			flags: describeOptions(
				z.object({
					bandwidth: z.number().default(6),
					dryRun: z.boolean().default(false),
					name: z.string(),
					optional: z.string().optional(),
					provided: z.string(),
				}),
			),
			values: { provided: "yes" },
		});

		expect(result).toEqual({
			cancelled: false,
			completed: { bandwidth: 8, dryRun: true, name: "Josh", provided: "yes" },
			prompted: { bandwidth: 8, dryRun: true, name: "Josh" },
		});
		expect(
			mockText.mock.calls.map(([options]) => (options as TextOptions).message),
		).toEqual(["What will the --bandwidth be?", "What will the --name be?"]);
		expect(mockConfirm).toHaveBeenCalledWith({
			initialValue: false,
			message: "What will the --dryRun be?",
		});
	});

	it("does not prompt when every flag has a value or is optional without a default", async () => {
		const result = await promptForOptions({
			flags: [
				createFlag("name", "string", { required: true }),
				createFlag("optional", "string"),
			],
			values: { name: "Josh" },
		});

		expect(result).toEqual({
			cancelled: false,
			completed: { name: "Josh" },
			prompted: {},
		});
		expect(mockText).not.toHaveBeenCalled();
	});

	it("prompts for a flag when its value is undefined", async () => {
		mockText.mockResolvedValueOnce("Josh");

		const result = await promptForOptions({
			flags: [createFlag("name", "string", { required: true })],
			values: { name: undefined },
		});

		expect(result).toEqual({
			cancelled: false,
			completed: { name: "Josh" },
			prompted: { name: "Josh" },
		});
	});

	it("includes the description in the default message when the flag has one", async () => {
		mockText.mockResolvedValueOnce("abc");

		await promptForOptions({
			flags: [
				createFlag("auth", "string", {
					description: "GitHub auth token",
					required: true,
				}),
			],
			values: {},
		});

		expect(mockText).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "What will the GitHub auth token be? (--auth)",
			}),
		);
	});

	it("uses the custom message when one is provided", async () => {
		mockText.mockResolvedValueOnce("abc");

		await promptForOptions({
			flags: [createFlag("auth", "string", { required: true })],
			message: (flag) => `Enter ${flag.key}:`,
			values: {},
		});

		expect(mockText).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Enter auth:" }),
		);
	});

	it("returns the values prompted so far when a prompt is cancelled", async () => {
		mockText.mockResolvedValueOnce("Josh").mockResolvedValueOnce(cancel);

		const result = await promptForOptions({
			flags: [
				createFlag("name", "string", { required: true }),
				createFlag("owner", "string", { required: true }),
				createFlag("repo", "string", { required: true }),
			],
			values: {},
		});

		expect(result).toEqual({ cancelled: true, prompted: { name: "Josh" } });
		expect(mockText).toHaveBeenCalledTimes(2);
	});

	it("returns cancelled when a confirm prompt is cancelled", async () => {
		mockConfirm.mockResolvedValueOnce(cancel);

		const result = await promptForOptions({
			flags: [createFlag("dryRun", "boolean", { default: false })],
			values: {},
		});

		expect(result).toEqual({ cancelled: true, prompted: {} });
	});

	it("applies the flag's schema to prompted values when the flag has a schema", async () => {
		mockText.mockResolvedValueOnce("").mockResolvedValueOnce("^a");

		const result = await promptForOptions({
			flags: describeOptions({
				bandwidth: z.number().default(6),
				pattern: z.string().transform((value) => new RegExp(value)),
			}),
			values: {},
		});

		expect(result).toEqual({
			cancelled: false,
			completed: { bandwidth: 6, pattern: /^a/ },
			prompted: { bandwidth: 6, pattern: /^a/ },
		});
	});

	it("throws an error with the schema's issues when an async schema rejects the prompted value", async () => {
		mockText.mockResolvedValueOnce("abc");

		await expect(
			promptForOptions({
				flags: [
					createFlag("name", "string", {
						required: true,
						schema: createAsyncSchema(
							z.string().min(5).regex(/^\d+$/, "Must be digits"),
						),
					}),
				],
				values: {},
			}),
		).rejects.toThrow(
			new Error(
				"--name: Too small: expected string to have >=5 characters; Must be digits",
			),
		);
	});

	it("prompts for an optional flag when its async schema rejects undefined", async () => {
		mockText.mockResolvedValueOnce("Josh");

		const result = await promptForOptions({
			flags: [
				createFlag("name", "string", {
					schema: createAsyncSchema(z.string()),
				}),
			],
			values: {},
		});

		expect(result).toEqual({
			cancelled: false,
			completed: { name: "Josh" },
			prompted: { name: "Josh" },
		});
	});

	it("does not prompt for an optional flag when its async schema accepts undefined", async () => {
		const result = await promptForOptions({
			flags: [
				createFlag("name", "string", {
					schema: createAsyncSchema(z.string().optional()),
				}),
			],
			values: {},
		});

		expect(result).toEqual({ cancelled: false, completed: {}, prompted: {} });
		expect(mockText).not.toHaveBeenCalled();
	});

	it("prompts for an optional flag when its schema throws for undefined", async () => {
		mockText.mockResolvedValueOnce("Josh");

		const result = await promptForOptions({
			flags: [
				createFlag("name", "string", {
					schema: {
						"~standard": {
							...z.string()["~standard"],
							validate: (value: unknown) => {
								if (value === undefined) {
									throw new Error("Missing");
								}

								return { value };
							},
						},
					},
				}),
			],
			values: {},
		});

		expect(result).toEqual({
			cancelled: false,
			completed: { name: "Josh" },
			prompted: { name: "Josh" },
		});
	});
});
