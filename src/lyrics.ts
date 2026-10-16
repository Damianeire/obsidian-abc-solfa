// Adds a w: line of sol-fa syllables after each music line of an ABC tune.
// abcjs then lays the syllables out under the notes like any other lyric verse.

import type { Note, Tune } from "./parse.ts";
import { doPitchClass, octaveMark, referenceDo, syllable, toLetters, type SyllableStyle, type TonicRule } from "./solfa.ts";

export interface SolfaOptions {
	tonicRule: TonicRule;
	style: SyllableStyle;
	octaveMarks: boolean;
}

// One syllable (or "*" to skip a tied continuation) per pitched note; rests take no
// syllable because abcjs does not align lyrics to rests.
export function syllables(notes: Note[], opts: SolfaOptions): (string | null)[] {
	const pitched = notes.filter((n) => n.midi !== null);
	const firstKey = pitched[0]?.key;
	const refDo = firstKey
		? referenceDo(pitched.map((n) => n.midi!), doPitchClass(firstKey, opts.tonicRule))
		: 60;
	return notes.map((n) => {
		if (n.midi === null) return null;
		if (n.tieFromPrev) return "*";
		const doPc = doPitchClass(n.key, opts.tonicRule);
		let s = syllable(n.midi, doPc, n.inflection);
		if (opts.style === "letters") s = toLetters(s);
		if (opts.octaveMarks) {
			// Keep the reference octave when the key changes, by moving it to the new do.
			const ref = refDo + ((((doPc - refDo) % 12) + 18) % 12) - 6;
			s += octaveMark(n.midi, ref);
		}
		return s;
	});
}

// For each note, the index of the source line its lyrics belong after: the last line
// of its music line, since a line ending in a backslash continues onto the next.
export function musicLineEnds(abc: string, notes: { startChar: number }[]): number[] {
	const lines = abc.split("\n");
	const lineStarts: number[] = [];
	let pos = 0;
	for (const l of lines) {
		lineStarts.push(pos);
		pos += l.length + 1;
	}
	const lineOf = (char: number) => {
		let lo = 0, hi = lineStarts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (lineStarts[mid] <= char) lo = mid; else hi = mid - 1;
		}
		return lo;
	};
	const groupEnd = (i: number) => {
		while (i < lines.length - 1 && lines[i].trimEnd().endsWith("\\")) i++;
		return i;
	};
	return notes.map((n) => groupEnd(lineOf(n.startChar)));
}

export function withSolfa(abc: string, tune: Tune, opts: SolfaOptions): string {
	const lines = abc.split("\n");
	const ends = musicLineEnds(abc, tune.notes);
	const sylls = syllables(tune.notes, opts);
	const byLine = new Map<number, string[]>();
	tune.notes.forEach((n, i) => {
		const s = sylls[i];
		if (s === null) return;
		const end = ends[i];
		if (!byLine.has(end)) byLine.set(end, []);
		byLine.get(end)!.push(s);
	});

	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		out.push(lines[i]);
		const words = byLine.get(i);
		if (!words) continue;
		// After any lyric lines the tune already has, so they stay as the first verses.
		while (i + 1 < lines.length && /^\s*w:/.test(lines[i + 1])) out.push(lines[++i]);
		out.push("w: " + words.join(" "));
	}
	return out.join("\n");
}
