// Size of the sol-fa and rhythm sticks, changed with the - and + buttons on a block.

// The sizes the + and - buttons step through.
export const SIZES = [0.75, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2];

// The next size up (step 1) or down (step -1), or the same size at either end.
export function stepSize(size: number, step: 1 | -1): number {
	const next = step > 0 ? SIZES.find((v) => v > size + 1e-6) : [...SIZES].reverse().find((v) => v < size - 1e-6);
	return next ?? size;
}
