// Kodály stick notation: the one table that says which beat patterns have a stick
// drawing and which rhythm syllables go with them. stick.ts only looks things up here.
//
// Durations are counted in sixteenths (a quarter note is 4, a dotted quarter is 6).
// A pattern covers one beat, or several beats for long notes such as ta-a.

import type { Meter } from "./parse.ts";

export const UNITS_PER_WHOLE = 16;

// How one note of a pattern is drawn.
export interface StickNote {
	dur: number; // sixteenths
	syllable: string; // shown under the stick; "" for a rest
	rest?: boolean;
	head?: "open"; // half notes and longer: a stem with an open note head
	dot?: boolean;
	flags?: number; // a lone eighth (1) or sixteenth (2) with no beam to join
}

// A beam joins notes from..to (indexes into the pattern) at a level: 1 for eighths,
// 2 for sixteenths. A beam with from === to is a short stub on that note.
export interface Beam {
	from: number;
	to: number;
	level: number;
}

export interface Pattern {
	name: string;
	beats: number[]; // length of each beat it covers, in sixteenths
	notes: StickNote[];
	beams: Beam[];
}

const n = (dur: number, syllable: string, extra: Partial<StickNote> = {}): StickNote => ({ dur, syllable, ...extra });
const r = (dur: number): StickNote => ({ dur, syllable: "", rest: true });
const b = (from: number, to: number, level = 1): Beam => ({ from, to, level });

const Q = 4; // simple beat: a quarter
const DQ = 6; // compound beat: a dotted quarter

export const PATTERNS: Pattern[] = [
	// Simple meters (2/4, 3/4, 4/4): one beat
	{ name: "ta", beats: [Q], notes: [n(4, "ta")], beams: [] },
	{ name: "ti-ti", beats: [Q], notes: [n(2, "ti"), n(2, "ti")], beams: [b(0, 1)] },
	{ name: "tika-tika", beats: [Q], notes: [n(1, "ti"), n(1, "ka"), n(1, "ti"), n(1, "ka")], beams: [b(0, 3), b(0, 3, 2)] },
	{ name: "ti-tika", beats: [Q], notes: [n(2, "ti"), n(1, "ti"), n(1, "ka")], beams: [b(0, 2), b(1, 2, 2)] },
	{ name: "tika-ti", beats: [Q], notes: [n(1, "ti"), n(1, "ka"), n(2, "ti")], beams: [b(0, 2), b(0, 1, 2)] },
	{ name: "tim-ka", beats: [Q], notes: [n(3, "tim", { dot: true }), n(1, "ka")], beams: [b(0, 1), b(1, 1, 2)] },
	{ name: "ti-kam", beats: [Q], notes: [n(1, "ti"), n(3, "kam", { dot: true })], beams: [b(0, 1), b(0, 0, 2)] },
	// Simple meters: across beats
	{ name: "ta-a", beats: [Q, Q], notes: [n(8, "ta-a", { head: "open" })], beams: [] },
	{ name: "ta-i ti", beats: [Q, Q], notes: [n(6, "ta-i", { dot: true }), n(2, "ti", { flags: 1 })], beams: [] },
	{ name: "ti ta ti", beats: [Q, Q], notes: [n(2, "ti", { flags: 1 }), n(4, "ta"), n(2, "ti", { flags: 1 })], beams: [] },
	{ name: "ta-a-a", beats: [Q, Q, Q], notes: [n(12, "ta-a-a", { head: "open", dot: true })], beams: [] },
	{ name: "ta-a-a-a", beats: [Q, Q, Q, Q], notes: [n(16, "ta-a-a-a", { head: "open" })], beams: [] },
	// Simple meters: rests
	{ name: "rest", beats: [Q], notes: [r(4)], beams: [] },
	{ name: "half rest", beats: [Q, Q], notes: [r(8)], beams: [] },

	// Compound meters (6/8, 9/8, 12/8): one dotted-quarter beat
	{ name: "ta-i", beats: [DQ], notes: [n(6, "ta-i", { dot: true })], beams: [] },
	{ name: "ti-ti-ti", beats: [DQ], notes: [n(2, "ti"), n(2, "ti"), n(2, "ti")], beams: [b(0, 2)] },
	{ name: "ta ti", beats: [DQ], notes: [n(4, "ta"), n(2, "ti", { flags: 1 })], beams: [] },
	{ name: "ti ta", beats: [DQ], notes: [n(2, "ti", { flags: 1 }), n(4, "ta")], beams: [] },
	{ name: "tika-ti-ti", beats: [DQ], notes: [n(1, "ti"), n(1, "ka"), n(2, "ti"), n(2, "ti")], beams: [b(0, 3), b(0, 1, 2)] },
	{ name: "ti-tika-ti", beats: [DQ], notes: [n(2, "ti"), n(1, "ti"), n(1, "ka"), n(2, "ti")], beams: [b(0, 3), b(1, 2, 2)] },
	{ name: "ti-ti-tika", beats: [DQ], notes: [n(2, "ti"), n(2, "ti"), n(1, "ti"), n(1, "ka")], beams: [b(0, 3), b(2, 3, 2)] },
	{ name: "tika-tika-tika", beats: [DQ], notes: [1, 2, 3, 4, 5, 6].map((i) => n(1, i % 2 ? "ti" : "ka")), beams: [b(0, 5), b(0, 5, 2)] },
	{ name: "tim-ka-ti", beats: [DQ], notes: [n(3, "tim", { dot: true }), n(1, "ka"), n(2, "ti")], beams: [b(0, 2), b(1, 1, 2)] },
	// Compound meters: across beats
	{ name: "ta-i-i", beats: [DQ, DQ], notes: [n(12, "ta-i-i", { head: "open", dot: true })], beams: [] },
	// Compound meters: rests
	{ name: "rest", beats: [DQ], notes: [r(6)], beams: [] },
];

const keyOf = (beats: number[], durs: (number | string)[]) => `${beats.join("+")}|${durs.join(" ")}`;

const BY_SHAPE = new Map<string, Pattern>();
const BY_EXACT = new Map<string, Pattern>();
for (const p of PATTERNS) {
	const durs = p.notes.map((x) => x.dur);
	const exact = keyOf(p.beats, p.notes.map((x) => (x.rest ? "r" : "") + x.dur));
	BY_EXACT.set(exact, p);
	if (!p.notes.some((x) => x.rest) && !BY_SHAPE.has(keyOf(p.beats, durs))) BY_SHAPE.set(keyOf(p.beats, durs), p);
}

// The pattern for notes that fill the given beats, or null when the table has none.
// Rests use a rest entry when there is one (a whole-beat rest); otherwise the pattern
// for the same durations is used with those notes drawn as rests.
export function lookup(beats: number[], durs: number[], rests: boolean[] = []): Pattern | null {
	const exact = BY_EXACT.get(keyOf(beats, durs.map((d, i) => (rests[i] ? "r" : "") + d)));
	if (exact) return exact;
	const shape = BY_SHAPE.get(keyOf(beats, durs));
	if (!shape) return null;
	if (!rests.some(Boolean)) return shape;
	return withRests(shape, rests);
}

// Rests break beams: what is left of each beam either joins two or more notes or
// becomes a flag on a single note.
function withRests(p: Pattern, rests: boolean[]): Pattern {
	const notes = p.notes.map((x, i) => (rests[i] ? r(x.dur) : { ...x }));
	const beams: Beam[] = [];
	for (const beam of p.beams) {
		let i = beam.from;
		while (i <= beam.to) {
			if (rests[i]) { i++; continue; }
			let j = i;
			while (j + 1 <= beam.to && !rests[j + 1]) j++;
			if (j > i || beam.from === beam.to) beams.push({ from: i, to: j, level: beam.level });
			else notes[i].flags = Math.max(notes[i].flags ?? 0, beam.level);
			i = j + 1;
		}
	}
	return { ...p, name: p.name + " with rest", notes, beams };
}

// Beat lengths for a bar, as counts of a unit note (1/den of a whole note), so that a
// later fence option such as group=3+3+3 can replace the default.
export interface Grouping {
	unit: number; // in whole notes
	beats: number[];
}

const DEFAULT_GROUPING: Record<string, number[]> = {
	"2/4": [1, 1],
	"3/4": [1, 1, 1],
	"4/4": [1, 1, 1, 1],
	"6/8": [3, 3],
	"9/8": [3, 3, 3],
	"12/8": [3, 3, 3, 3],
};

export function defaultGrouping(meter: Meter | null): Grouping {
	const m = meter ?? { num: 4, den: 4 };
	const known = DEFAULT_GROUPING[`${m.num}/${m.den}`];
	if (known) return { unit: 1 / m.den, beats: known };
	// Cut time and other half-note meters: count in quarters, as reels are taught.
	if (m.den === 2) return { unit: 1 / 4, beats: Array(m.num * 2).fill(1) };
	// Other eighth-note meters in threes (3/8, 15/8): dotted-quarter beats.
	if (m.den === 8 && m.num % 3 === 0) return { unit: 1 / 8, beats: Array(m.num / 3).fill(3) };
	return { unit: 1 / m.den, beats: Array(m.num).fill(1) };
}

// Reads a grouping such as "3+3+3" or "2+2+3" in units of the meter's note value.
export function parseGrouping(spec: string, meter: Meter | null): Grouping | null {
	const parts = spec.split("+").map((s) => Number(s.trim()));
	if (!parts.length || parts.some((x) => !Number.isInteger(x) || x <= 0)) return null;
	return { unit: 1 / (meter?.den ?? 4), beats: parts };
}

// Beat lengths in sixteenths.
export function beatUnits(g: Grouping): number[] {
	return g.beats.map((x) => x * g.unit * UNITS_PER_WHOLE);
}
