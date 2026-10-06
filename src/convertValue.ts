import type { ValueDescription } from "./types.ts";

import { numberPattern } from "./numberPattern.ts";

/**
 * Converts a raw string value per its kind, such as parsing numbers and JSON.
 * @param description How to convert the value.
 * @param value Raw string value, as provided on the command-line.
 * @returns The converted value, or an Error explaining why it couldn't be.
 */
export function convertValue(description: ValueDescription, value: string) {
	switch (description.kind) {
		case "boolean":
			if (value === "true" || value === "false") {
				return value === "true";
			}

			return new Error(
				`Expected true or false, received ${JSON.stringify(value)}.`,
			);

		case "integer":
		case "number":
			if (!numberPattern.test(value)) {
				return new Error(
					`Expected a number, received ${JSON.stringify(value)}.`,
				);
			}

			return Number(value);

		case "json":
			try {
				return JSON.parse(value) as unknown;
			} catch {
				return new Error(
					`Expected valid JSON, received ${JSON.stringify(value)}.`,
				);
			}

		case "mixed":
			return convertMixed(description, value);

		case "string":
			return value;
	}
}

/**
 * Formats choices as a list, such as `"a", "b", or "c"`.
 * @param choices Allowed values.
 * @returns The choices as readable text.
 */
export function formatChoices(choices: readonly unknown[]) {
	const formatted = choices.map((choice) => JSON.stringify(choice));

	return formatted.length > 2
		? `${formatted.slice(0, -1).join(", ")}, or ${formatted[formatted.length - 1]}`
		: formatted.join(" or ");
}

function convertMixed(description: ValueDescription, value: string) {
	const { choices = [], types = [] } = description;
	const choiceIndex = choices.findIndex((choice) => String(choice) === value);

	if (choiceIndex !== -1) {
		return choices[choiceIndex];
	}

	if (!types.length) {
		return new Error(
			`Expected ${formatChoices(choices)}, received ${JSON.stringify(value)}.`,
		);
	}

	if (
		(types.includes("integer") || types.includes("number")) &&
		numberPattern.test(value)
	) {
		return Number(value);
	}

	if (types.includes("boolean") && (value === "false" || value === "true")) {
		return value === "true";
	}

	return value;
}
