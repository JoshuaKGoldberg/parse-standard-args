/**
 * Asserts that a schema validated synchronously.
 * Zod also returns a rejected Promise when a sync schema throws.
 * @param result What the schema's `validate` returned.
 * @returns The result, if it isn't a Promise.
 */
export function assertSyncResult<Result>(result: Promise<Result> | Result) {
	if (result instanceof Promise) {
		// The rejection shouldn't crash the process on top of the TypeError.
		result.catch(() => undefined);

		throw new TypeError(
			"Schemas must validate synchronously and report issues rather than throw, but one returned a Promise.",
		);
	}

	return result;
}
