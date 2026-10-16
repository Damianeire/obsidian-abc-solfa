// Kodály stick notation from the parse.ts note list. Pure functions: notes are grouped
// into beats, each beat is looked up in rhythmTable.ts, and the result is drawn as a
// small SVG tree that render.ts turns into DOM and the tests turn into a string.

import type { BarLine, Note } from "./parse.ts";
import { beatUnits, lookup, tupletPattern, UNITS_PER_WHOLE, type Grouping, type Pattern, type TupletNote } from "./rhythmTable.ts";

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

// The bar lines tell a pickup into a new part (after a double bar or repeat sign) from
// a short first or second ending, which is counted from its start.
export function groupBeats(notes: Note[], grouping: Grouping, barLines: BarLine[] = []): BeatGroup[] {
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
		// A short bar is a pickup, counted back from the bar line, when it opens the tune,
		// follows a double bar or repeat sign, or completes the short bar before it (the end
		// of one part and the start of the next). An ending is never a pickup.
		const prev = bars[k - 1];
		const short = (b?: typeof bar) => !!b && b.total < barLen - EPS;
		const before = barLines.find((l) => l.bar === bar.bar);
		const section = !!before && before.type !== "bar_thin";
		const pickup = short(bar) && !before?.ending &&
			(k === 0 || section || (short(prev) && near(prev.total + bar.total, barLen)));
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
	const items: TupletNote[] = [];
	const pad = (dur: number) => items.push({ dur, written: dur, tuplet: null, tupletStart: false, rest: true });
	if (lead > EPS) pad(lead);
	for (let i = from; i < to; i++) {
		const nt = notes[i];
		items.push({ dur: units(nt), written: nt.written * UNITS_PER_WHOLE, tuplet: nt.tuplet, tupletStart: nt.tupletStart, rest: nt.midi === null });
	}
	if (trail > EPS) pad(trail);
	let p = lookup(group.beats, items.map((x) => x.dur), items.map((x) => x.rest));
	// Tuplets the table does not list are built from the notes' written lengths.
	if (!p && items.some((x) => x.tuplet !== null)) p = tupletPattern(group.beats, items);
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
		tuplets: p.tuplets?.filter((t) => t.from >= lead && t.to < last).map((t) => ({ ...t, from: t.from - lead, to: t.to - lead })),
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
export const TUPLET_ROOM = 8; // above the sticks, for a triplet's 3 and tie arcs
export const ENDING_ROOM = 12; // above that, for first and second ending brackets
// Room above a staff for sticks, their syllables and triplet numbers.
export const STICK_SPACE = TUPLET_ROOM + STICK_HEIGHT + ROW + 8;
export const stickSpace = (endings: boolean) => STICK_SPACE + (endings ? ENDING_ROOM : 0);

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
			// A tied note is held, not spoken again.
			if (n.syllable && !isTied(notes, g.first + k)) kids.push(text(x(k), sylY, n.syllable, "abc-solfa-rhythm-syl"));
		});
		for (const b of g.pattern.beams) {
			const y = top + (b.level - 1) * BEAM_GAP;
			let x1 = x(b.from), x2 = x(b.to);
			// A stub points back to the note before, or on to the next for the first note.
			if (b.from === b.to) { if (b.from > 0) x1 -= STUB; else x2 += STUB; }
			kids.push(el("rect", { class: "abc-solfa-beam", x: x1 - 0.75, y, width: x2 - x1 + 1.5, height: BEAM }));
		}
		for (const t of g.pattern.tuplets ?? []) {
			const mid = (x(t.from) + x(t.to)) / 2;
			kids.push(text(mid, top - 3, String(t.n), "abc-solfa-tuplet"));
			if (t.bracket) {
				const y = top - 5, x1 = x(t.from) - 3, x2 = x(t.to) + 3;
				const d = `M${num(x1)} ${y + 3} V${y} H${num(mid - 5)} M${num(mid + 5)} ${y} H${num(x2)} V${y + 3}`;
				kids.push(el("path", { class: "abc-solfa-bracket", d, fill: "none" }));
			}
		}
		out.push(el("g", { class: "abc-solfa-beat" }, kids));
	}
	out.push(...drawTies(groups, notes, xs, top));
	return out;
}

const isTied = (notes: Note[], i: number) => i > 0 && notes[i].tieFromPrev && notes[i].midi !== null && notes[i - 1].midi !== null;

// A tie is an arc over the sticks from one note to the next. Where the two notes are
// on different lines, each line gets half an arc running off the edge.
const TIE_STUB = 12;
function drawTies(groups: BeatGroup[], notes: Note[], xs: number[], top: number): SvgNode[] {
	const shown = new Set<number>();
	for (const g of groups) for (let k = 0; k < g.count; k++) shown.add(g.first + k);
	const arc = (x1: number, x2: number) => {
		const d = `M${num(x1)} ${top - 1} Q${num((x1 + x2) / 2)} ${top - 7} ${num(x2)} ${top - 1}`;
		return el("path", { class: "abc-solfa-tie", d, fill: "none" });
	};
	const out: SvgNode[] = [];
	for (const i of shown) {
		if (isTied(notes, i)) out.push(shown.has(i - 1) ? arc(xs[i - 1] + 2, xs[i] - 2) : arc(xs[i] - TIE_STUB, xs[i] - 2));
		if (i + 1 < notes.length && isTied(notes, i + 1) && !shown.has(i + 1)) out.push(arc(xs[i] + 2, xs[i] + TIE_STUB));
	}
	return out;
}

// Bar lines and repeat signs, laid out from their left edge the way abcjs spaces them,
// so they line up with the staff: dots, thin line, thick line, thin line, dots.
interface BarLayout {
	dots: number[];
	thins: number[];
	thick: number | null; // centre of the thick line
	first: number; // the first line, where an ending stops
	last: number; // the last line, where an ending starts
	width: number;
}

export const isRepeat = (type: string) => type.endsWith("repeat");

export function layoutBar(type: string): BarLayout {
	const out: BarLayout = { dots: [], thins: [], thick: null, first: 0, last: 0, width: 0 };
	const lines: number[] = [];
	let dx = 0;
	if (type === "bar_right_repeat" || type === "bar_dbl_repeat") { out.dots.push(1.5); dx += 6; }
	if (type !== "bar_left_repeat" && type !== "bar_thick_thin" && type !== "bar_invisible") { out.thins.push(dx); lines.push(dx); }
	if (["bar_right_repeat", "bar_dbl_repeat", "bar_left_repeat", "bar_thin_thick", "bar_thick_thin"].includes(type)) {
		dx += 4;
		out.thick = dx;
		lines.push(dx);
		dx += 2;
	}
	if (["bar_left_repeat", "bar_thick_thin", "bar_thin_thin", "bar_dbl_repeat"].includes(type)) { dx += 3; out.thins.push(dx); lines.push(dx); }
	if (type === "bar_left_repeat" || type === "bar_dbl_repeat") { dx += 4; out.dots.push(dx); }
	out.first = lines[0] ?? 0;
	out.last = lines.at(-1) ?? 0;
	out.width = dx + 2;
	return out;
}

export function drawBarLine(type: string, x: number, y1: number, y2: number): SvgNode {
	const l = layoutBar(type);
	const mid = (y1 + y2) / 2;
	const kids: SvgNode[] = l.thins.map((dx) => el("line", { class: "abc-solfa-barline", x1: x + dx, y1, x2: x + dx, y2 }));
	if (l.thick !== null) kids.push(el("rect", { class: "abc-solfa-thick", x: x + l.thick - 1.5, y: y1, width: 3, height: y2 - y1 }));
	for (const dx of l.dots) for (const cy of [mid - 4, mid + 4]) kids.push(el("circle", { class: "abc-solfa-dot", cx: x + dx, cy, r: 1.5 }));
	return el("g", { class: isRepeat(type) ? "abc-solfa-bar abc-solfa-repeat" : "abc-solfa-bar" }, kids);
}

// A bar line placed on one line of music.
export interface PlacedBar {
	x: number; // left edge
	type: string;
	ending: string | null;
	endsEnding: boolean;
}

// First and second ending brackets for one line, as a line with a hook down at the start
// and the ending's number. `open` is the label of an ending carried on from the line
// before; the label of one still open at the end of the line is returned for the next.
export function drawEndings(bars: PlacedBar[], lineStart: number, lineEnd: number, y: number, open: string | null): { nodes: SvgNode[]; open: string | null } {
	const nodes: SvgNode[] = [];
	const HOOK = 7;
	let cur: { x: number; label: string; hook: boolean } | null = open ? { x: lineStart, label: open, hook: false } : null;
	const close = (x2: number, hookRight: boolean) => {
		if (!cur) return;
		let d = `M${num(cur.x)} ${y + (cur.hook ? HOOK : 0)} V${y} H${num(x2)}`;
		if (hookRight) d += ` V${y + HOOK}`;
		const kids: SvgNode[] = [el("path", { d, fill: "none" })];
		if (cur.hook) kids.push({ tag: "text", attrs: { x: cur.x + 3, y: y + 9, class: "abc-solfa-ending-label" }, text: cur.label });
		nodes.push(el("g", { class: "abc-solfa-ending" }, kids));
		cur = null;
	};
	for (const b of bars) {
		const l = layoutBar(b.type);
		if (b.endsEnding) close(b.x + l.first, isRepeat(b.type));
		if (b.ending) {
			close(b.x + l.first, false);
			cur = { x: b.x + l.last, label: b.ending, hook: true };
		}
	}
	const carry = cur ? (cur as { label: string }).label : null;
	close(lineEnd, false);
	return { nodes, open: carry };
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
	bars: BarLine[]; // the tune's bar lines
	barLines: number[]; // a line number per bar line, counted the same way as `lines`
}

// Sticks without a staff: one SVG per line of music, bars side by side, each note
// given room in proportion to its length. Bar lines, repeat signs and ending brackets
// are drawn as written.
export function stickLines(notes: Note[], grouping: Grouping, opts: StickLayoutOptions): SvgNode[] {
	const groups = groupBeats(notes, grouping, opts.bars);

	// Notes and bar lines in the order they are written.
	const items: { char: number; line: number; note?: number; bar?: number }[] = [
		...notes.map((n, i) => ({ char: n.startChar, note: i, line: opts.lines[i] })),
		...opts.bars.map((b, k) => ({ char: b.startChar, bar: k, line: opts.barLines[k] })),
	].sort((a, b) => a.char - b.char);

	const PAD = 10;
	const xs: number[] = new Array(notes.length);
	const placed = new Map<number, PlacedBar[]>();
	const widths = new Map<number, number>();
	let line = items[0]?.line, x = PAD;
	for (const it of items) {
		if (it.line !== line) {
			widths.set(line, x);
			line = it.line;
			x = PAD;
		}
		if (it.note !== undefined) {
			const w = Math.max(opts.solfa ? 24 : 18, 14 + 6 * units(notes[it.note]));
			xs[it.note] = x + 6;
			x += w;
		} else if (it.bar !== undefined) {
			const b = opts.bars[it.bar];
			if (!placed.has(line)) placed.set(line, []);
			placed.get(line)!.push({ x: x - PAD / 2, type: b.type, ending: b.ending, endsEnding: b.endsEnding });
			x += layoutBar(b.type).width;
		}
	}
	if (items.length) widths.set(line, x);

	const endings = opts.bars.some((b) => b.ending);
	const endingY = 4;
	const top = 4 + (opts.sticks ? TUPLET_ROOM : 0) + (endings ? ENDING_ROOM : 0);
	const solfaY = top + (opts.sticks ? STICK_HEIGHT + 2 * ROW : ROW) - 2;
	const height = solfaY + (opts.solfa ? 6 : -ROW + 6);
	const out: SvgNode[] = [];
	let open: string | null = null;
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
		const bars = placed.get(ln) ?? [];
		for (const b of bars) kids.push(drawBarLine(b.type, b.x, top, height - 2));
		const e = drawEndings(bars, PAD / 2, width - 2, endingY, open);
		open = e.open;
		kids.push(...e.nodes);
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
