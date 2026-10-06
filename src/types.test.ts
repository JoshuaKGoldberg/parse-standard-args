import { describe, expectTypeOf, it } from "vitest";
import * as z from "zod";

import type { InferOptions, OptionsDefinition } from "./types.ts";

function infer<Options extends OptionsDefinition>(options: Options) {
	return options as unknown as InferOptions<Options>;
}

describe("InferOptions", () => {
	it("infers the output type when options are an object schema", () => {
		expectTypeOf(
			infer(z.object({ count: z.number().default(1) })),
		).toEqualTypeOf<{ count: number }>();
	});

	it("makes keys optional when options are a record and their output may be undefined", () => {
		expectTypeOf(
			infer({
				count: z.number(),
				name: z.string().optional(),
				size: z.number().default(1),
			}),
		).toEqualTypeOf<{
			count: number;
			name?: string | undefined;
			size: number;
		}>();
	});
});
