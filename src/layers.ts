// Which layers a block shows, and per-block overrides from the fence line,
// for example: ```abc-solfa staff=on solfa=off sticks=on

export interface Layers {
	staff: boolean;
	solfa: boolean;
	sticks: boolean;
}

export type LayerName = keyof Layers;
export const LAYER_NAMES: LayerName[] = ["staff", "solfa", "sticks"];

const ON = new Set(["on", "true", "yes", "show", "1"]);
const OFF = new Set(["off", "false", "no", "hide", "0"]);

// Reads key=value pairs after the language name. Unknown keys and values are ignored.
export function parseFence(fenceLine: string): Partial<Layers> {
	const out: Partial<Layers> = {};
	const rest = fenceLine.replace(/^\s*(`{3,}|~{3,})\s*\S*/, "");
	for (const m of rest.matchAll(/([a-z-]+)\s*=\s*([a-z0-9]+)/gi)) {
		const name = m[1].toLowerCase() === "rhythm" ? "sticks" : m[1].toLowerCase();
		const value = m[2].toLowerCase();
		if (!(LAYER_NAMES as string[]).includes(name)) continue;
		if (ON.has(value)) out[name as LayerName] = true;
		else if (OFF.has(value)) out[name as LayerName] = false;
	}
	return out;
}
