import type { FlagDescriptor } from "./types.ts";

export interface FormatHelpSettings {
	/**
	 * Sentence(s) describing what the CLI does.
	 */
	description?: string;

	/**
	 * Example commands, printed as-is under an "Examples:" heading.
	 */
	examples?: string[];

	/**
	 * Descriptors of all flags to print, in order.
	 */
	flags: FlagDescriptor[];

	/**
	 * Text printed after everything else, such as a link to docs.
	 */
	footer?: string;

	/**
	 * Name of the CLI, as typed to run it.
	 */
	name: string;

	/**
	 * Positionals usage text, such as `&lt;patterns...>`, and an optional description.
	 */
	positionals?: PositionalsHelp;

	/**
	 * Usage text after the CLI's name, overriding `[options]` and the positionals usage.
	 */
	usage?: string;

	/**
	 * Maximum line width to wrap option descriptions to, such as the terminal's columns.
	 */
	width?: number;
}

export interface PositionalsHelp {
	/**
	 * Explanation of the positionals, printed under an "Arguments:" heading.
	 */
	description?: string;

	/**
	 * Usage text for positionals, such as `&lt;patterns...>`.
	 */
	usage: string;
}

/**
 * Formats plain-text help for a CLI: usage, description, options, and examples.
 * @param settings The CLI's name, flags, and other metadata.
 * @returns Help text, ready to be printed.
 */
export function formatHelp(settings: FormatHelpSettings) {
	const {
		description,
		examples,
		flags,
		footer,
		name,
		positionals,
		usage,
		width: maximumWidth,
	} = settings;
	const visibleFlags = flags.filter((flag) => !flag.hidden);
	const anyShort = visibleFlags.some((flag) => flag.short);
	const rows = visibleFlags.map((flag) => [
		formatFlagUsage(flag, anyShort),
		formatFlagDescription(flag),
	]);
	const width = Math.max(...rows.map(([usage]) => usage.length));

	return [
		`Usage: ${[name, usage ?? [visibleFlags.length && "[options]", positionals?.usage].filter(Boolean).join(" ")].filter(Boolean).join(" ")}`,
		description && `\n${description}`,
		positionals?.description &&
			`\nArguments:\n  ${positionals.usage}  ${positionals.description}`,
		rows.length &&
			[
				"\nOptions:",
				...rows.map(([usage, text]) =>
					`  ${usage.padEnd(width)}  ${wrapText(text, width + 4, maximumWidth)}`.trimEnd(),
				),
			].join("\n"),
		examples?.length &&
			["\nExamples:", ...examples.map((example) => `  ${example}`)].join("\n"),
		footer && `\n${footer}`,
	]
		.filter(Boolean)
		.join("\n");
}

/**
 * Formats a flag's description, including its default and whether it's required.
 * @param flag Descriptor of the flag.
 * @returns The description text shown next to the flag in help.
 */
export function formatFlagDescription(flag: FlagDescriptor) {
	const details = [
		flag.required && "required",
		flag.defaultDescription
			? `default: ${flag.defaultDescription}`
			: flag.default !== undefined &&
				!(flag.kind === "boolean" && flag.default === false) &&
				!(Array.isArray(flag.default) && !flag.default.length) &&
				`default: ${formatValue(flag.default)}`,
		flag.multiple && "repeatable",
	].filter(Boolean);

	return [flag.description, details.length && `(${details.join(", ")})`]
		.filter(Boolean)
		.join(" ");
}

/**
 * Formats how a flag is written, such as `-f, --filename &lt;string>`.
 * @param flag Descriptor of the flag.
 * @param alignShort Whether to indent flags without a short alias to align with ones that have one.
 * @returns The flag's usage text shown in help.
 */
export function formatFlagUsage(flag: FlagDescriptor, alignShort = true) {
	const name =
		flag.kind === "boolean" && flag.default === true
			? `--[no-]${flag.key}`
			: `--${flag.key}`;

	return [
		flag.short ? `-${flag.short}, ` : alignShort && "    ",
		name,
		flag.kind !== "boolean" && ` <${formatValueName(flag)}>`,
	]
		.filter(Boolean)
		.join("");
}

/**
 * Formats a flag's type as TypeScript-like text, such as `string[]` or `"a" | "b"`.
 * @param flag Descriptor of the flag.
 * @returns The flag's type name.
 */
export function formatFlagType(flag: FlagDescriptor) {
	const base = flag.choices
		? flag.choices.map((choice) => JSON.stringify(choice)).join(" | ")
		: flag.kind;

	if (!flag.multiple) {
		return base;
	}

	return flag.choices && flag.choices.length > 1 ? `(${base})[]` : `${base}[]`;
}

function formatValue(value: unknown) {
	return typeof value === "string" ? value : JSON.stringify(value);
}

function formatValueName(flag: FlagDescriptor) {
	if (flag.placeholder) {
		return flag.placeholder;
	}

	if (flag.choices) {
		return flag.choices.map(formatValue).join("|");
	}

	return flag.kind;
}

/**
 * Word-wraps text to fit within a maximum line width, indenting continued lines.
 * Text isn't wrapped if there's no maximum or too little room for it to help.
 */
function wrapText(text: string, indent: number, maximumWidth?: number) {
	const available = maximumWidth && maximumWidth - indent;

	if (!available || available < 20 || text.length <= available) {
		return text;
	}

	const lines: string[] = [];
	let line = "";

	for (const word of text.split(" ")) {
		if (line && line.length + word.length + 1 > available) {
			lines.push(line);
			line = word;
		} else {
			line = line ? `${line} ${word}` : word;
		}
	}

	lines.push(line);

	return lines.join(`\n${" ".repeat(indent)}`);
}
