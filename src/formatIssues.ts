import type { ArgsIssue } from "./types.ts";

/**
 * Formats issues as one line each, with suggestions for mistyped flags.
 * @param issues Issues from parsing or validating args.
 * @returns Lines of text, ready to be printed.
 */
export function formatIssues(issues: ArgsIssue[]) {
	return issues.map(formatIssue).join("\n");
}

/**
 * Formats a single issue as one line, with a suggestion for a mistyped flag.
 * @param issue Issue from parsing or validating args.
 * @returns One line of text, ready to be printed.
 */
export function formatIssue(issue: ArgsIssue) {
	return issue.suggestion
		? `${issue.message} (did you mean --${issue.suggestion}?)`
		: issue.message;
}
