// Kodály stick notation from the parse.ts note list. Pure functions: notes are grouped
// into beats, each beat is looked up in rhythmTable.ts, and the result is drawn as a
// small SVG tree that render.ts turns into DOM and the tests turn into a string.

import type { Note } from "./parse.ts";
import { beatUnits, lookup, UNITS_PER_WHOLE, type Grouping, type Pattern } from "./rhythmTable.ts";

// Tuplet durations are not exact in floating point, so positions are compared loosely.
const EPS = 1e-4;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;

// One looked-up beat (or several beats for a long note): notes[first .. first+count-1].
export interface BeatGroup {
	bar: number;
	first: number;
	count: number;
	beats: number[]; // lengths of the beats it covers, in sixteenths
	pattern: Pattern | null; // null when the table has nothing for these notes
}

const units = (n: Note) => n.duration * UNITS_PER_WHOLE;

export function groupBeats(notes: Note[], grouping: Grouping): BeatGroup[] {
	const beatLens = beatUnits(grouping);
	const bounds = [0];
	for (const l of beatLens) bounds.push(bounds.at(-1)! + l);
	const barLen = bounds.at(-1)!;

	// Consecutive runs of notes in the same bar.
	const bars: { bar: number; first: number; count: number; total: number }[] = [];
	notes.forEach((n, i) => {
		const last = bars.at(-1);
		if (last && last.bar === n.bar) { last.count++; last.total += units(n); }
		else bars.push({ bar: n.bar, first: i, count: 1, total: units(n) });
	});

	const out: BeatGroup[] = [];
	bars.forEach((bar, k) => {
		// A short bar is a pickup, counted back from the bar line, when it opens the tune
		// or completes the short bar before it (the end of one part and the start of the next).
		const prev = bars[k - 1];
		const short = (b?: typeof bar) => !!b && b.total < barLen - EPS;
		const pickup = short(bar) && (k === 0 || (short(prev) && near(prev.total + bar.total, barLen)));
		let pos = pickup ? barLen - bar.total : 0;

		let i = bar.first;
		const end = bar.first + bar.count;
		while (i < end) {
			let startBeat = 0;
			while (startBeat + 1 < bounds.length - 1 && bounds[startBeat + 1] <= pos + EPS) startBeat++;
			const start = pos;
			let j = i;
			let endBeat = -1;
			while (j < end) {
				pos += units(notes[j]);
				j++;
				endBeat = bounds.findIndex((b, m) => m > startBeat && near(b, pos));
				if (endBeat >= 0 || pos > barLen + EPS) break;
			}
			out.push(makeGroup(notes, bar.bar, i, j, start, pos, startBeat, endBeat, bounds, beatLens));
			i = j;
		}
	});
	return out;
}

function makeGroup(
	notes: Note[], bar: number, from: number, to: number, start: number, end: number,
	startBeat: number, endBeat: number, bounds: number[], beatLens: number[],
): BeatGroup {
	const group: BeatGroup = { bar, first: from, count: to - from, beats: [], pattern: null };
	if (end > bounds.at(-1)! + EPS) return group; // overfull bar
	// A group that stops short of a beat line (the last notes of a short bar) still
	// covers the beat it is in; the missing time is looked up as rests and then dropped.
	if (endBeat < 0) endBeat = bounds.findIndex((b) => b > end - EPS);
	group.beats = beatLens.slice(startBeat, endBeat);
	const lead = start - bounds[startBeat];
	const trail = bounds[endBeat] - end;
	const durs: number[] = [], rests: boolean[] = [];
	if (lead > EPS) { durs.push(lead); rests.push(true); }
	for (let i = from; i < to; i++) { durs.push(units(notes[i])); rests.push(notes[i].midi === null); }
	if (trail > EPS) { durs.push(trail); rests.push(true); }
	const p = lookup(group.beats, durs, rests);
	if (p) group.pattern = trim(p, lead > EPS ? 1 : 0, trail > EPS ? 1 : 0);
	return group;
}

// Drops padding notes from either end of a pattern.
function trim(p: Pattern, lead: number, trail: number): Pattern {
	if (!lead && !trail) return p;
	const last = p.notes.length - trail;
	return {
		...p,
		notes: p.notes.slice(lead, last),
		beams: p.beams.filter((b) => b.from >= lead && b.to < last).map((b) => ({ ...b, from: b.from - lead, to: b.to - lead })),
		tuplet: p.tuplet && p.tuplet.from >= lead && p.tuplet.to < last
			? { ...p.tuplet, from: p.tuplet.from - lead, to: p.tuplet.to - lead }
			: undefined,
	};
}

// A tiny SVG tree, so the drawing code stays free of the DOM.
export interface SvgNode {
	tag: string;
	attrs: Record<string, string | number>;
	children?: SvgNode[];
	text?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v: string | number) => (typeof v === "number" ? String(Math.round(v * 100) / 100) : v);

export function toSvgString(node: SvgNode): string {
	const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${esc(num(v))}"`).join("");
	const inner = (node.text !== undefined ? esc(node.text) : "") + (node.children ?? []).map(toSvgString).join("");
	return `<${node.tag}${attrs}>${inner}</${node.tag}>`;
}

const el = (tag: string, attrs: SvgNode["attrs"], children?: SvgNode[]): SvgNode => ({ tag, attrs, children });
const text = (x: number, y: number, s: string, cls: string): SvgNode => ({ tag: "text", attrs: { x, y, class: cls, "text-anchor": "middle" }, text: s });

// Sizes, in SVG units.
export const STICK_HEIGHT = 22;
const BEAM = 3;
const BEAM_GAP = 5;
const STUB = 6;
export const ROW = 13; // height of a row of syllables
export const TUPLET_ROOM = 8; // above the sticks, for a triplet's 3
// Room above a staff for sticks, their syllables and triplet numbers.
export const STICK_SPACE = TUPLET_ROOM + STICK_HEIGHT + ROW + 8;

function restGlyph(x: number, top: number, dur: number): SvgNode {
	const y = top + STICK_HEIGHT / 2;
	const cls = "abc-solfa-rest";
	if (dur >= 8) return el("rect", { class: cls, x: x - 5, y: y - 1, width: 10, height: 4 });
	if (dur >= 4) {
		// A quarter rest: a zigzag with a hook.
		const d = `M${x - 2} ${y - 9} l5 6 l-4 4 l5 6 c-4 -2 -7 0 -3 4`;
		const out = el("g", { class: cls }, [el("path", { d, fill: "none", "stroke-width": 1.6 })]);
		if (dur === 6) out.children!.push(el("circle", { cx: x + 6, cy: y + 2, r: 1.5, class: "abc-solfa-dot" }));
		return out;
	}
	// Eighth and sixteenth rests: a stroke with one or two blobs.
	const kids: SvgNode[] = [el("path", { d: `M${x + 3} ${y - 6} L${x - 1} ${y + 8}`, fill: "none", "stroke-width": 1.4 })];
	kids.push(el("circle", { cx: x - 1, cy: y - 5, r: 2, class: "abc-solfa-dot" }));
	if (dur < 2) kids.push(el("circle", { cx: x - 2, cy: y, r: 2, class: "abc-solfa-dot" }));
	if (dur === 3) kids.push(el("circle", { cx: x + 6, cy: y + 2, r: 1.5, class: "abc-solfa-dot" }));
	return el("g", { class: cls }, kids);
}

// Draws each beat group at the given x positions (one per note), with the sticks
// starting at `top` and the rhythm syllables underneath.
export function drawSticks(groups: BeatGroup[], notes: Note[], xs: number[], top: number): SvgNode[] {
	const out: SvgNode[] = [];
	const bottom = top + STICK_HEIGHT;
	const sylY = bottom + ROW - 2;
	for (const g of groups) {
		const x = (k: number) => xs[g.first + k];
		if (!g.pattern) {
			// Not in the table yet (triplets, odd groupings): plain sticks and a "?".
			const kids: SvgNode[] = [];
			for (let k = 0; k < g.count; k++) {
				if (notes[g.first + k].midi === null) continue;
				kids.push(el("line", { x1: x(k), y1: top + 4, x2: x(k), y2: bottom }));
			}
			const mid = (x(0) + x(g.count - 1)) / 2;
			kids.push(text(mid, sylY, "?", "abc-solfa-rhythm-syl"));
			out.push(el("g", { class: "abc-solfa-beat abc-solfa-unknown" }, kids));
			continue;
		}
		const kids: SvgNode[] = [];
		g.pattern.notes.forEach((n, k) => {
			if (n.rest) { kids.push(restGlyph(x(k), top, n.dur)); return; }
			if (n.head === "open") {
				kids.push(el("line", { x1: x(k), y1: top, x2: x(k), y2: bottom - 2 }));
				kids.push(el("ellipse", { class: "abc-solfa-head", cx: x(k) - 4, cy: bottom - 1, rx: 4.5, ry: 3, transform: `rotate(-20 ${num(x(k) - 4)} ${num(bottom - 1)})` }));
			} else {
				kids.push(el("line", { x1: x(k), y1: top, x2: x(k), y2: bottom }));
			}
			if (n.dot) kids.push(el("circle", { class: "abc-solfa-dot", cx: x(k) + 5, cy: bottom - 3, r: 1.6 }));
			for (let f = 0; f < (n.flags ?? 0); f++) {
				const y = top + f * BEAM_GAP;
				kids.push(el("path", { class: "abc-solfa-flag", d: `M${num(x(k))} ${y} q2 5 7 8`, fill: "none" }));
			}
			kids.push(text(x(k), sylY, n.syllable, "abc-solfa-rhythm-syl"));
		});
		for (const b of g.pattern.beams) {
			const y = top + (b.level - 1) * BEAM_GAP;
			let x1 = x(b.from), x2 = x(b.to);
			// A stub points back to the note before, or on to the next for the first note.
			if (b.from === b.to) { if (b.from > 0) x1 -= STUB; else x2 += STUB; }
			kids.push(el("rect", { class: "abc-solfa-beam", x: x1 - 0.75, y, width: x2 - x1 + 1.5, height: BEAM }));
		}
		const t = g.pattern.tuplet;
		if (t) kids.push(text((x(t.from) + x(t.to)) / 2, top - 3, String(t.n), "abc-solfa-tuplet"));
		out.push(el("g", { class: "abc-solfa-beat" }, kids));
	}
	return out;
}

export function drawSolfaRow(sylls: (string | null)[], xs: number[], y: number): SvgNode[] {
	const out: SvgNode[] = [];
	sylls.forEach((s, i) => {
		if (s && s !== "*") out.push(text(xs[i], y, s, "abc-solfa-solfa-syl"));
	});
	return out;
}

export interface StickLayoutOptions {
	sticks: boolean;
	solfa: (string | null)[] | null; // one sol-fa syllable per note, or null for no row
	lines: number[]; // a line number per note; a new line starts where it changes
}

// Sticks without a staff: one SVG per line of music, bars side by side, each note
// given room in proportion to its length.
export function stickLines(notes: Note[], grouping: Grouping, opts: StickLayoutOptions): SvgNode[] {
	const groups = groupBeats(notes, grouping);
	const groupOf = new Map<number, BeatGroup>();
	for (const g of groups) for (let k = 0; k < g.count; k++) groupOf.set(g.first + k, g);

	const PAD = 10;
	const xs: number[] = new Array(notes.length);
	const barLines: { line: number; x: number }[] = [];
	const widths = new Map<number, number>();
	let line = opts.lines[0], x = PAD;
	notes.forEach((n, i) => {
		if (opts.lines[i] !== line) {
			barLines.push({ line, x: x - PAD / 2 });
			widths.set(line, x);
			line = opts.lines[i];
			x = PAD;
		} else if (i > 0 && n.bar !== notes[i - 1].bar) {
			barLines.push({ line, x: x - PAD / 2 });
		}
		const w = Math.max(opts.solfa ? 24 : 18, 14 + 6 * units(n));
		xs[i] = x + 6;
		x += w;
	});
	if (notes.length) {
		barLines.push({ line, x: x - PAD / 2 });
		widths.set(line, x);
	}

	const top = 4 + (opts.sticks ? TUPLET_ROOM : 0);
	const solfaY = top + (opts.sticks ? STICK_HEIGHT + 2 * ROW : ROW) - 2;
	const height = solfaY + (opts.solfa ? 6 : -ROW + 6);
	const out: SvgNode[] = [];
	for (const [ln, width] of widths) {
		const idx = notes.map((_, i) => i).filter((i) => opts.lines[i] === ln);
		const kids: SvgNode[] = [];
		if (opts.sticks) {
			const lineGroups = groups.filter((g) => opts.lines[g.first] === ln);
			kids.push(...drawSticks(lineGroups, notes, xs, top));
		}
		if (opts.solfa) {
			const sylls = notes.map((_, i) => (opts.lines[i] === ln ? opts.solfa![i] : null));
			kids.push(...drawSolfaRow(sylls, xs, solfaY));
		}
		for (const b of barLines.filter((b) => b.line === ln)) {
			kids.push(el("line", { class: "abc-solfa-barline", x1: b.x, y1: top, x2: b.x, y2: height - 2 }));
		}
		if (!idx.length) continue;
		out.push(el("svg", {
			class: "abc-solfa-sticks",
			xmlns: "http://www.w3.org/2000/svg",
			viewBox: `0 0 ${num(width)} ${num(height)}`,
			width: num(width),
			height: num(height),
		}, kids));
	}
	return out;
}

// Adds blank space above each music line (an ABC %%vskip), where the sticks are drawn
// over the staff. `ends` gives each note's last source line, from musicLineEnds().
export function withStickSpace(abc: string, ends: number[], space = STICK_SPACE): string {
	const lines = abc.split("\n");
	const starts = new Set<number>();
	for (const e of new Set(ends)) {
		let s = e;
		while (s > 0 && lines[s - 1].trimEnd().endsWith("\\")) s--;
		starts.add(s);
	}
	return lines.flatMap((l, i) => (starts.has(i) ? [`%%vskip ${space}`, l] : [l])).join("\n");
}
