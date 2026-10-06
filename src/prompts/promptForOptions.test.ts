import type { TextOptions } from "@clack/prompts";

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import type { ArgsSchema, FlagDescriptor, FlagKind } from "../types.ts";

import { describeOptions } from "../describeOptions.ts";
import { promptForFlag, promptForOptions } from "./promptForOptions.ts";

const cancel = Symbol("cancel");

const mockConfirm = vi.fn();
const mockLogError = vi.fn();
const mockMultiselect = vi.fn();
const mockSelect = vi.fn();
const mockText = vi.fn();

vi.mock("@clack/prompts", () => ({
	get confirm() {
		return mockConfirm;
	},
	isCancel: (value: unknown) => value === cancel,
	log: {
		get error() {
			return mockLogError;
		},
	},
	get multiselect() {
		return mockMultiselect;
	},
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

async function getValidator(flag: FlagDescriptor) {
	mockText.mockResolvedValueOnce(cancel);

	await promptForFlag(flag, "Message");

	return (mockText.mock.calls[0][0] as TextOptions).validate as (
		text: string | undefined,
	) => string | undefined;
}

beforeEach(() => {
	for (const mock of [
		mockConfirm,
		mockLogError,
		mockMultiselect,
		mockSelect,
		mockText,
	]) {
		mock.mockReset();
	}
});

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

	it("prompts with select when the flag is mixed with only choices", async () => {
		mockSelect.mockResolvedValueOnce(1);

		const result = await promptForFlag(
			createFlag("value", "mixed", { choices: ["a", 1], types: [] }),
			"Value?",
		);

		expect(result).toBe(1);
		expect(mockText).not.toHaveBeenCalled();
	});

	it("prompts with multiselect when the flag is multiple with choices", async () => {
		mockMultiselect.mockResolvedValueOnce(["author", "subscribed"]);

		const result = await promptForFlag(
			createFlag("reason", "string", {
				choices: ["author", "subscribed"],
				default: ["subscribed"],
				multiple: true,
			}),
			"Reason?",
		);

		expect(result).toEqual(["author", "subscribed"]);
		expect(mockMultiselect).toHaveBeenCalledWith({
			initialValues: ["subscribed"],
			message: "Reason?",
			options: [
				{ label: "author", value: "author" },
				{ label: "subscribed", value: "subscribed" },
			],
			required: false,
		});
	});

	it("requires a selection when the flag is required and multiple with choices", async () => {
		mockMultiselect.mockResolvedValueOnce(["a"]);

		await promptForFlag(
			createFlag("letters", "string", {
				choices: ["a", "b"],
				multiple: true,
				required: true,
			}),
			"Letters?",
		);

		expect(mockMultiselect).toHaveBeenCalledWith({
			message: "Letters?",
			options: [
				{ label: "a", value: "a" },
				{ label: "b", value: "b" },
			],
			required: true,
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

	it("prompts with text and returns the string when the flag is a string", async () => {
		mockText.mockResolvedValueOnce("Josh");

		const result = await promptForFlag(createFlag("name", "string"), "Name?");

		expect(result).toBe("Josh");
		expect(mockText).toHaveBeenCalledWith({
			message: "Name?",
			validate: expect.any(Function),
		});
	});

	it("prompts with text when the flag is mixed with types", async () => {
		mockText.mockResolvedValueOnce("5");

		const result = await promptForFlag(
			createFlag("concurrency", "mixed", {
				choices: ["auto"],
				types: ["number"],
			}),
			"Concurrency?",
		);

		expect(result).toBe(5);
		expect(mockSelect).not.toHaveBeenCalled();
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

	it("includes a string default as-is as a placeholder when the flag has one", async () => {
		mockText.mockResolvedValueOnce("");

		await promptForFlag(
			createFlag("name", "string", { default: "Josh" }),
			"Name?",
		);

		expect(mockText).toHaveBeenCalledWith(
			expect.objectContaining({ placeholder: "Josh" }),
		);
	});

	it("includes a comma-separated default as a placeholder when the flag is multiple", async () => {
		mockText.mockResolvedValueOnce("");

		const result = await promptForFlag(
			createFlag("tags", "string", { default: ["a", "b"], multiple: true }),
			"Tags?",
		);

		expect(result).toEqual(["a", "b"]);
		expect(mockText).toHaveBeenCalledWith(
			expect.objectContaining({ placeholder: "a, b" }),
		);
	});

	it("includes a JSON default as a placeholder when the flag is a multiple json flag", async () => {
		mockText.mockResolvedValueOnce("");

		await promptForFlag(
			createFlag("labels", "json", { default: [{ a: 1 }], multiple: true }),
			"Labels?",
		);

		expect(mockText).toHaveBeenCalledWith(
			expect.objectContaining({ placeholder: '[{"a":1}]' }),
		);
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

	it("splits comma-separated text when the flag is a multiple string flag", async () => {
		mockText.mockResolvedValueOnce(" a, b ,, c ");

		expect(
			await promptForFlag(
				createFlag("tags", "string", { multiple: true }),
				"Tags?",
			),
		).toEqual(["a", "b", "c"]);
	});

	it("splits and converts comma-separated text when the flag is a multiple number flag", async () => {
		mockText.mockResolvedValueOnce("3, -4.5");

		expect(
			await promptForFlag(
				createFlag("ids", "number", { multiple: true }),
				"Ids?",
			),
		).toEqual([3, -4.5]);
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

		it("asks for a value when the text has only commas and the flag is multiple", async () => {
			const validate = await getValidator(
				createFlag("tags", "string", { multiple: true }),
			);

			expect(validate(" , ,")).toBe("Please enter a value.");
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

		it("asks for a number when any comma-separated value is not numeric and the flag is a multiple number flag", async () => {
			const validate = await getValidator(
				createFlag("ids", "integer", { multiple: true }),
			);

			expect(validate("1, x")).toBe("Please enter a numeric value.");
			expect(validate("1, 2")).toBeUndefined();
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

		it("reports the conversion error when a comma-separated value can't be converted", async () => {
			const validate = await getValidator(
				createFlag("bits", "boolean", { multiple: true }),
			);

			expect(validate("true, maybe")).toBe(
				'Expected true or false, received "maybe".',
			);
			expect(validate("true, false")).toBeUndefined();
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

			expect(validate("ab, c")).toBe(
				"Too small: expected string to have >=2 characters",
			);
			expect(validate("ab, cd")).toBeUndefined();
		});

		it("returns the error message when the flag's schema throws an error", async () => {
			const validate = await getValidator(
				createFlag("name", "string", {
					schema: createThrowingSchema(new Error("Oh no")),
				}),
			);

			expect(validate("a")).toBe("Oh no");
		});

		it("returns the thrown value as a message when the flag's schema throws a non-error", async () => {
			const validate = await getValidator(
				createFlag("name", "string", {
					schema: createThrowingSchema("Oh no"),
				}),
			);

			expect(validate("a")).toBe("Oh no");
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

	it("does not prompt for a hidden flag even when it is required", async () => {
		const result = await promptForOptions({
			flags: [
				createFlag("secret", "string", { hidden: true, required: true }),
				createFlag("debug", "boolean", { default: false, hidden: true }),
			],
			values: {},
		});

		expect(result).toEqual({ cancelled: false, completed: {}, prompted: {} });
		expect(mockText).not.toHaveBeenCalled();
		expect(mockConfirm).not.toHaveBeenCalled();
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

	it("prompts for a flag named like an object property when it has no value", async () => {
		mockText.mockResolvedValueOnce("x");

		const result = await promptForOptions({
			flags: [createFlag("constructor", "string", { required: true })],
			values: {},
		});

		expect(result).toEqual({
			cancelled: false,
			completed: { constructor: "x" },
			prompted: { constructor: "x" },
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

	it("stores prompted values as entered when the flag's schema transforms them", async () => {
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
			completed: { bandwidth: 6, pattern: "^a" },
			prompted: { bandwidth: 6, pattern: "^a" },
		});
	});

	it("stores the schema's output when parse is enabled", async () => {
		mockText.mockResolvedValueOnce("").mockResolvedValueOnce("^a");

		const result = await promptForOptions({
			flags: describeOptions({
				bandwidth: z.number().default(6),
				pattern: z.string().transform((value) => new RegExp(value)),
			}),
			parse: true,
			values: {},
		});

		expect(result).toEqual({
			cancelled: false,
			completed: { bandwidth: 6, pattern: /^a/ },
			prompted: { bandwidth: 6, pattern: /^a/ },
		});
	});

	it("prompts again with the schema's issues when an async schema rejects the prompted value", async () => {
		mockText.mockResolvedValueOnce("abc").mockResolvedValueOnce("12345");

		const result = await promptForOptions({
			flags: [
				createFlag("code", "string", {
					required: true,
					schema: createAsyncSchema(
						z.string().min(5).regex(/^\d+$/, "Must be digits"),
					),
				}),
			],
			values: {},
		});

		expect(result).toEqual({
			cancelled: false,
			completed: { code: "12345" },
			prompted: { code: "12345" },
		});
		expect(mockLogError).toHaveBeenCalledWith(
			"--code: Too small: expected string to have >=5 characters; Must be digits",
		);
		expect(mockText).toHaveBeenCalledTimes(2);
	});

	it("prompts again with the error message when the schema throws for the prompted value", async () => {
		mockConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

		const result = await promptForOptions({
			flags: [
				createFlag("dryRun", "boolean", {
					default: false,
					schema: {
						"~standard": {
							...z.boolean()["~standard"],
							validate: (value: unknown) => {
								if (value === true) {
									throw new Error("Not allowed");
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
			completed: { dryRun: false },
			prompted: { dryRun: false },
		});
		expect(mockLogError).toHaveBeenCalledWith("--dryRun: Not allowed");
	});

	it("prompts again with the thrown value when the schema throws a non-error for the prompted value", async () => {
		mockSelect.mockResolvedValueOnce("b").mockResolvedValueOnce("a");

		await promptForOptions({
			flags: [
				createFlag("letter", "string", {
					choices: ["a", "b"],
					required: true,
					schema: {
						"~standard": {
							...z.string()["~standard"],
							validate: (value: unknown) => {
								if (value === "b") {
									// eslint-disable-next-line @typescript-eslint/only-throw-error
									throw "No b";
								}

								return { value };
							},
						},
					},
				}),
			],
			values: {},
		});

		expect(mockLogError).toHaveBeenCalledWith("--letter: No b");
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
