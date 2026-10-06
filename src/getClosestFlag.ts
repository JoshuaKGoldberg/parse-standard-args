/**
 * Finds the known flag most likely meant by a mistyped flag, if any are close.
 * @param flag Unknown flag name, without leading dashes.
 * @param knownFlags Known flag names, without leading dashes.
 * @returns The closest known flag within a small edit distance, or the only one it abbreviates, if any.
 */
export function getClosestFlag(flag: string, knownFlags: string[]) {
	// Single characters are short flags, which aren't meaningfully close to long ones.
	if (flag.length < 2) {
		return undefined;
	}

	const maximumDistance = Math.min(2, Math.max(1, Math.floor(flag.length / 2)));
	let closest: string | undefined;
	let closestDistance = Infinity;

	for (const knownFlag of knownFlags) {
		const distance = getEditDistance(
			flag.toLowerCase(),
			knownFlag.toLowerCase(),
		);

		if (distance <= maximumDistance && distance < closestDistance) {
			closest = knownFlag;
			closestDistance = distance;
		}
	}

	return closest ?? getOnlyAbbreviated(flag, knownFlags);
}

function getEditDistance(left: string, right: string) {
	let previous = Array.from({ length: right.length + 1 }, (_, i) => i);

	for (let i = 1; i <= left.length; i += 1) {
		const current = [i];

		for (let j = 1; j <= right.length; j += 1) {
			current[j] = Math.min(
				previous[j] + 1,
				current[j - 1] + 1,
				previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
			);
		}

		previous = current;
	}

	return previous[right.length];
}

function getOnlyAbbreviated(flag: string, knownFlags: string[]) {
	const lowerFlag = flag.toLowerCase();
	const abbreviated = knownFlags.filter((knownFlag) =>
		knownFlag.toLowerCase().startsWith(lowerFlag),
	);

	return abbreviated.length === 1 ? abbreviated[0] : undefined;
}
