<h1 align="center">Parse Standard Args</h1>

<p align="center">Parses CLI args with node:util parseArgs and a Standard Schema, with friendly errors and generated help. 🎛️</p>

<p align="center">
	<!-- prettier-ignore-start -->
	<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
	<a href="#contributors" target="_blank"><img alt="👪 All Contributors: 1" src="https://img.shields.io/badge/%F0%9F%91%AA_all_contributors-1-21bb42.svg" /></a>
<!-- ALL-CONTRIBUTORS-BADGE:END -->
	<!-- prettier-ignore-end -->
	<a href="https://github.com/JoshuaKGoldberg/parse-standard-args/blob/main/.github/CODE_OF_CONDUCT.md" target="_blank"><img alt="🤝 Code of Conduct: Kept" src="https://img.shields.io/badge/%F0%9F%A4%9D_code_of_conduct-kept-21bb42" /></a>
	<a href="https://codecov.io/gh/JoshuaKGoldberg/parse-standard-args" target="_blank"><img alt="🧪 Coverage" src="https://img.shields.io/codecov/c/github/JoshuaKGoldberg/parse-standard-args?label=%F0%9F%A7%AA%20coverage" /></a>
	<a href="https://github.com/JoshuaKGoldberg/parse-standard-args/blob/main/LICENSE.md" target="_blank"><img alt="📝 License: MIT" src="https://img.shields.io/badge/%F0%9F%93%9D_license-MIT-21bb42.svg" /></a>
	<a href="http://npmjs.com/package/parse-standard-args" target="_blank"><img alt="📦 npm version" src="https://img.shields.io/npm/v/parse-standard-args?color=21bb42&label=%F0%9F%93%A6%20npm" /></a>
	<img alt="💪 TypeScript: Strict" src="https://img.shields.io/badge/%F0%9F%92%AA_typescript-strict-21bb42.svg" />
</p>

## Usage

```shell
npm i parse-standard-args
```

Define your CLI's options as one object schema from any library that supports [Standard JSON Schema](https://standardschema.dev/json-schema), such as [Zod](https://zod.dev) 4.2+ or [ArkType](https://arktype.io):

```ts
import { createCli } from "parse-standard-args";
import { z } from "zod";

const cli = createCli({
	description: "Greets people from the command-line. 👋",
	examples: ["greet --name Josh --times 3"],
	name: "greet",
	options: z.object({
		loud: z.boolean().default(false).meta({ short: "l" }),
		name: z.string().describe("Who to greet"),
		times: z.number().int().positive().default(1).describe("How many times"),
	}),
	version: "1.0.0",
});

const parsed = await cli.run(process.argv.slice(2));

if (parsed) {
	// { loud: boolean; name: string; times: number }
	const { loud, name, times } = parsed.values;
}
```

`cli.run` parses args with [`node:util`'s `parseArgs`](https://nodejs.org/api/util.html#utilparseargsconfig), validates them with your schema, and either returns the values or prints what the user needs:

<!-- cspell:ignore nmae -->

```plaintext
$ greet --times abc --nmae Josh
--times: Expected a number, received "abc".
Unknown flag: --nmae (did you mean --name?)
--name is required.
Run 'greet --help' for usage.
```

```plaintext
$ greet --help
Usage: greet [options]

Greets people from the command-line. 👋

Options:
  -l, --loud
      --name <string>    Who to greet (required)
      --times <integer>  How many times (default: 1)
  -h, --help             Show this help message
  -v, --version          Show the version number

Examples:
  greet --name Josh --times 3
```

Errors set `process.exitCode` to `1` (configurable with `run(args, { exitCode })`), and nothing ever prints a stack trace.
Unknown flags get "did you mean" suggestions for likely typos and abbreviations, such as `--repo` for `--repository`, or `--l` for the flag whose short alias is `-l`.
Hidden flags are never suggested.

### Flags

Each property of the options schema is a flag, named exactly as its key: `createdBy` is `--createdBy`, and `"dry-run"` is `--dry-run`.
How each flag is parsed comes from its schema's JSON Schema:

| Schema type                        | Command-line                          | Value                     |
| ---------------------------------- | ------------------------------------- | ------------------------- |
| `boolean`                          | `--flag`, `--flag false`, `--no-flag` | `true` / `false`          |
| `number` / `integer`               | `--flag 12`                           | `12`                      |
| `string`                           | `--flag value`                        | `"value"`                 |
| enum / literals                    | `--flag a`                            | `"a"` (shown as `<a\|b>`) |
| `array`                            | `--flag a --flag b`                   | `["a", "b"]`              |
| `object`, arrays of them           | `--flag '{"a":1}'`                    | parsed JSON               |
| unions, such as `"auto" \| number` | `--flag auto`, `--flag 4`             | `"auto"`, `4`             |

Numbers are converted before validation, so schemas can use plain `z.number()` rather than `z.coerce.number()`.
Strings that aren't numbers, such as `""`, `"abc"`, or `"0x10"`, are reported instead of becoming `NaN` or `0`.
Enum values are checked against their choices, as in `--reporter: Expected "json" or "text", received "nope".`
Unions of different types, such as `z.union([z.literal("auto"), z.number()])` or `z.literal(["a", 1, true])`, convert each value to the first match of: a literal whose text it is, a number (if numbers are allowed), `true` or `false` (if booleans are allowed), or else the string as-is.
Unions that allow booleans may also be given without a value, as in `--color` for `true`.

A flag that requires a value reports an error if it's followed by another flag, as in `--owner --verbose`, rather than taking `--verbose` as its value.
A following arg starting with `--` is always treated as a flag; one starting with a single `-` is only treated as a flag if it's made of known short flags, so values such as `--words -dashy` and `--offset -5` work.
Any value can be passed inline, as in `--owner=--weird`.
Short flags can take inline values too, as in `-f=value` or `-q=false`.

An unknown short flag group is reported once, as in `Unknown flag: -w (in -weird.js)`.
When positionals are allowed, args starting with `-` can be passed as positionals after a `--` terminator, as in `format -- -weird.js`, and negative numbers are positionals when the next positional is numeric, as in `offset -5`.

> Errors thrown by schema transforms, such as `new RegExp(value)` on an invalid pattern, are reported without a stack trace, but can't be attributed to their flag.
> Prefer reporting issues instead, such as with Zod's `ctx.addIssue`, so the error names the flag.

Metadata for help text and parsing comes from `.describe()` and `.meta()` (or your library's equivalent):

| Metadata             | Effect                                                 |
| -------------------- | ------------------------------------------------------ |
| `description`        | Explanation shown in `--help`                          |
| `default`            | Shown in `--help` as `(default: ...)`                  |
| `defaultDescription` | Shown in `--help` instead of the raw default value     |
| `hidden`             | Leaves the flag out of `--help`                        |
| `placeholder`        | Name for the flag's value in `--help`, as in `<regex>` |
| `short`              | Single-character alias, as in `-l`                     |

`createCli` throws a `TypeError` if a short alias isn't exactly one character, or if two flags (including the built-in `--help` and `--version`) share one.
It also throws if the options schema isn't an object, such as a union of objects, or can't be converted to JSON Schema.

### Positionals

Positional arguments are only allowed if you provide a `positionals` schema for their array.
Args after a `--` terminator are always positionals; `terminatorIndex` in parse results says how many positionals came before it.
Its `placeholder`, `description`, `minItems`, and `maxItems` are used in help text, as in `<patterns...>` or `[globs...]`:

```ts
const cli = createCli({
	name: "format",
	options: z.object({ dryRun: z.boolean().default(false) }),
	positionals: z.array(z.string()).min(1).meta({ placeholder: "patterns" }),
});
```

### `createCli` Settings

| Setting            | Type                                            | Description                                                                                                               |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `description`      | `string`                                        | Sentence(s) describing what the CLI does, for help text.                                                                  |
| `examples`         | `string[]`                                      | Example commands, printed as-is in help text.                                                                             |
| `footer`           | `string`                                        | Text printed at the end of help text, such as a link to docs.                                                             |
| `help`             | `boolean` or `{ description?, short? }`         | Whether to add `--help`, with `-h` if no option uses it (default: `true`).                                                |
| `name`             | `string`                                        | Name of the CLI, as typed to run it. **Required.**                                                                        |
| `options`          | schema or `Record<string, schema>`              | Either one object schema, or a record of per-flag schemas. **Required.**                                                  |
| `positionals`      | schema                                          | Schema for the array of positionals; if omitted, none are allowed.                                                        |
| `positionalsUsage` | `string`                                        | Usage text for positionals in help (default: from the schema's `placeholder`).                                            |
| `strict`           | `boolean` or `"warn"`                           | Whether unknown flags and unexpected positionals are errors (default: `true`); `"warn"` ignores them but prints warnings. |
| `usage`            | `string`                                        | Usage text after the name in help, such as `[--dry-run] <patterns...>`.                                                   |
| `version`          | `string` or `{ version, description?, short? }` | Version to print for `--version`, with `-v` if no option uses it.                                                         |

With `strict: false` or `"warn"`, unknown flags are collected into `unknown`.
If no `positionals` schema is given, an unknown flag takes the next arg as its value (unless it looks like a flag), as in `--old-flag value` for `{ "old-flag": "value" }`.
If positionals are allowed, there's no way to tell whether that arg was meant as the unknown flag's value or as a positional, so it's a positional.

`createCli` returns:

- `run(args, { error?, exitCode?, log?, warn? })`: parses args, printing help, version, warnings, or errors; returns `{ positionals, terminatorIndex?, unknown, values, warnings }` or `undefined` if the CLI shouldn't continue.
- `parse(args)`: parses args without printing, returning a result whose `type` is `"error"`, `"help"`, `"values"`, or `"version"` (with the `text` to print, if any).
  Both `"error"` and `"values"` results include `warnings`.
- `formatHelp()`: returns the help text.
- `flags`: descriptors of each flag, for building your own help or prompts.

### Lower-Level APIs

For CLIs that need more control, such as prompting for missing values before validation, the building blocks are exported too:

- `describeOptions(options)`: describes each flag from its schema
- `parseRawArgs({ args, flags, positionals?, strict? })`: parses and converts args without validating them
- `validateOptions(options, values)` / `validatePositionals(schema, values)`: validates values, reporting issues per flag
- `formatHelp(...)`, `formatFlagUsage(flag)`, `formatFlagDescription(flag)`, `formatFlagType(flag)`: help text pieces
- `formatIssues(issues)` and `getClosestFlag(flag, knownFlags)`: friendly errors and "did you mean" suggestions

Each issue has a `message` ready to print, the `flag` it's for (if any), and a `kind` for styling or handling it yourself: `"invalid"`, `"missing"`, `"unexpected"`, `"unknown"`, or `"validation"`.
A flag is reported as `--flag is required.` (`"missing"`) only if it wasn't provided and the schema rejects it being missing, so schemas that fill in missing values, such as with `z.preprocess`, work as expected.

### Prompts

`parse-standard-args/prompts` prompts with [`@clack/prompts`](https://www.npmjs.com/package/@clack/prompts) for flags that weren't provided.
Install `@clack/prompts` to use it:

```ts
import { describeOptions, parseRawArgs } from "parse-standard-args";
import { promptForOptions } from "parse-standard-args/prompts";

const flags = describeOptions(options);
const { values } = parseRawArgs({ args, flags });
const result = await promptForOptions({ flags, values });

if (!result.cancelled) {
	// result.completed: provided and prompted values together
}
```

Visible flags are prompted for if they're required or have a default to confirm; hidden flags never are.
Booleans are prompted with a confirm, enums and literals with a select (or a multiselect for repeatable flags), and everything else with text input.
Repeatable flags accept comma-separated text, as in `a, b`.

`completed` and `prompted` hold values as entered, ready to be validated with `validateOptions` like parsed args.
Pass `parse: true` to store each flag's schema output, such as transformed values, instead.

Flags from a record of per-flag schemas are validated as they're entered, and prompted again if their schema rejects the value.
Flags from one object schema can't be validated individually, so validate `completed` afterwards.

### TypeScript

Option values are typed from the options schema's output type.
If you export a type derived from the schema under [`isolatedDeclarations`](https://www.typescriptlang.org/tsconfig/#isolatedDeclarations), annotate the schema's type explicitly or keep a hand-written interface that the schema `satisfies`.

### Other Schema Libraries

Any library implementing both Standard Schema and Standard JSON Schema works.
Constraints that JSON Schema can't express, such as Valibot's `v.check()` or ArkType's `.narrow()` and `Date`, are described by their base types.
For [Valibot](https://valibot.dev), wrap schemas with [`toStandardJsonSchema`](https://www.npmjs.com/package/@valibot/to-json-schema):

```ts
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

const cli = createCli({
	name: "greet",
	options: toStandardJsonSchema(v.object({ name: v.string() })),
});
```

## Development

See [`.github/CONTRIBUTING.md`](./.github/CONTRIBUTING.md), then [`.github/DEVELOPMENT.md`](./.github/DEVELOPMENT.md).
Thanks! 🎛️

## Contributors

<!-- spellchecker: disable -->
<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center"><a href="http://www.joshuakgoldberg.com"><img src="https://avatars.githubusercontent.com/u/3335181?v=4?s=100" width="100px;" alt="Josh Ghoulberg 👻"/><br /><sub><b>Josh Ghoulberg 👻</b></sub></a><br /><a href="https://github.com/JoshuaKGoldberg/parse-standard-args/commits?author=JoshuaKGoldberg" title="Code">💻</a> <a href="#content-JoshuaKGoldberg" title="Content">🖋</a> <a href="https://github.com/JoshuaKGoldberg/parse-standard-args/commits?author=JoshuaKGoldberg" title="Documentation">📖</a> <a href="#ideas-JoshuaKGoldberg" title="Ideas, Planning, & Feedback">🤔</a> <a href="#infra-JoshuaKGoldberg" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-JoshuaKGoldberg" title="Maintenance">🚧</a> <a href="#projectManagement-JoshuaKGoldberg" title="Project Management">📆</a> <a href="#tool-JoshuaKGoldberg" title="Tools">🔧</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
<!-- spellchecker: enable -->

> 💝 This package was templated with [`create-typescript-app`](https://github.com/JoshuaKGoldberg/create-typescript-app) using the [Bingo framework](https://create.bingo).
