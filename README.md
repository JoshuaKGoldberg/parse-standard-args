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
Unknown flags get "did you mean" suggestions for likely typos and abbreviations, such as `--repo` for `--repository`.

### Flags

Each property of the options schema is a flag, named exactly as its key: `createdBy` is `--createdBy`, and `"dry-run"` is `--dry-run`.
How each flag is parsed comes from its schema's JSON Schema:

| Schema type              | Command-line                          | Value                     |
| ------------------------ | ------------------------------------- | ------------------------- |
| `boolean`                | `--flag`, `--flag false`, `--no-flag` | `true` / `false`          |
| `number` / `integer`     | `--flag 12`                           | `12`                      |
| `string`                 | `--flag value`                        | `"value"`                 |
| enum / literals          | `--flag a`                            | `"a"` (shown as `<a\|b>`) |
| `array`                  | `--flag a --flag b`                   | `["a", "b"]`              |
| `object`, arrays of them | `--flag '{"a":1}'`                    | parsed JSON               |

Numbers are converted before validation, so schemas can use plain `z.number()` rather than `z.coerce.number()`.
Strings that aren't numbers, such as `""`, `"abc"`, or `"0x10"`, are reported instead of becoming `NaN` or `0`.
Enum values are checked against their choices, as in `--reporter: Expected "json" or "text", received "nope".`

A flag that requires a value reports an error if it's followed by another flag, as in `--owner --help`, rather than taking `--help` as its value.
Values that start with `-` can be passed inline, as in `--owner=-weird`.
Negative numbers can be passed either way, as in `--offset -5`.

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

### Positionals

Positional arguments are only allowed if you provide a `positionals` schema for their array.
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

`createCli` returns:

- `run(args, { error?, exitCode?, log?, warn? })`: parses args, printing help, version, warnings, or errors; returns `{ positionals, values, warnings }` or `undefined` if the CLI shouldn't continue.
- `parse(args)`: parses args without printing, returning a result whose `type` is `"error"`, `"help"`, `"values"`, or `"version"` (with the `text` to print, if any).
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

Booleans are prompted with a confirm, enums and literals with a select, and everything else with text input validated against the flag's schema.

### TypeScript

Option values are typed from the options schema's output type.
If you export a type derived from the schema under [`isolatedDeclarations`](https://www.typescriptlang.org/tsconfig/#isolatedDeclarations), annotate the schema's type explicitly or keep a hand-written interface that the schema `satisfies`.

### Other Schema Libraries

Any library implementing both Standard Schema and Standard JSON Schema works.
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
