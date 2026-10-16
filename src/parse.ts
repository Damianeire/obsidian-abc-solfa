// Wraps abcjs parseOnly and returns a plain note list that the sol-fa and stick
// layers work from. Only the first voice of the first staff is read.

import abcjs from "abcjs";
import { accidentalSemitones, naturalSemitones, type KeyInfo } from "./solfa.ts";

export interface Note {
	midi: number | null; // null for a rest
	inflection: number; // +1 raised above the key signature, -1 lowered, 0 as written in the key
	duration: number; // in whole notes, after any tuplet
	tieFromPrev: boolean; // continuation of a tied note: no new syllable
	tuplet: number | null; // the n of (n, when the note is inside a tuplet
	bar: number; // 0-based bar count from the start of the tune
	key: KeyInfo; // key in force at this note
	startChar: number;
	endChar: number;
}

export interface Meter {
	num: number;
	den: number;
}

export interface Tune {
	key: KeyInfo;
	meter: Meter | null;
	notes: Note[];
	warnings: string[];
}

const LETTERS = "CDEFGAB";

function keyInfo(k: any): KeyInfo {
	return {
		root: k?.root ?? "none",
		acc: k?.acc ?? "",
		mode: k?.mode ?? "",
		accidentals: (k?.accidentals ?? []).map((a: any) => ({ note: String(a.note).toUpperCase(), acc: a.acc })),
	};
}

function meterOf(m: any): Meter | null {
	const v = m?.value?.[0];
	if (!v) return null;
	if (m.type === "common_time") return { num: 4, den: 4 };
	if (m.type === "cut_time") return { num: 2, den: 2 };
	const num = Number(v.num), den = Number(v.den);
	return Number.isFinite(num) && Number.isFinite(den) ? { num, den } : null;
}

// abcjs pitch: 0 is middle C, counted in diatonic steps.
function letterOf(p: number): string {
	return LETTERS[((p % 7) + 7) % 7];
}

function midiOf(p: number, semis: number): number {
	return 60 + 12 * Math.floor(p / 7) + naturalSemitones(letterOf(p)) + semis;
}

function keySemis(key: KeyInfo, letter: string): number {
	const a = key.accidentals.find((x) => x.note === letter);
	return a ? accidentalSemitones(a.acc) : 0;
}

export function parseTune(abc: string): Tune | null {
	const tune = abcjs.parseOnly(abc)[0];
	if (!tune) return null;

	const notes: Note[] = [];
	let key = keyInfo(tune.getKeySignature());
	const firstKey = key;
	let bar = 0;
	let barAcc = new Map<number, number>(); // diatonic pitch -> semitones, for the rest of the bar
	let tieCarry = new Map<number, number>(); // pitches tied from the previous note
	let tupletMult: number | null = null, tupletN: number | null = null;

	for (const line of tune.lines) {
		const staff = line.staff?.[0];
		const voice = staff?.voices?.[0];
		if (!voice) continue;
		if (staff.key) key = keyInfo(staff.key);

		for (const el of voice as any[]) {
			if (el.el_type === "key") {
				key = keyInfo(el);
				barAcc = new Map();
			} else if (el.el_type === "bar") {
				bar++;
				barAcc = new Map();
			} else if (el.el_type === "note") {
				if (el.rest?.type === "spacer" || el.rest?.type === "invisible") continue;
				if (el.startTriplet) {
					tupletN = el.startTriplet;
					tupletMult = el.tripletMultiplier ?? null;
				}
				const duration = el.duration * (tupletMult ?? 1);
				const tuplet = tupletN;
				if (el.endTriplet) tupletMult = tupletN = null;

				const base = { duration, tuplet, bar, key, startChar: el.startChar, endChar: el.endChar };
				if (!el.pitches?.length) {
					notes.push({ ...base, midi: null, inflection: 0, tieFromPrev: false });
					tieCarry = new Map();
					continue;
				}

				// Chords: the top note carries the tune.
				const pitches = [...el.pitches].sort((a: any, b: any) => a.pitch - b.pitch);
				const nextCarry = new Map<number, number>();
				let top: { midi: number; inflection: number; tied: boolean } | null = null;
				for (const pt of pitches) {
					const p = pt.pitch;
					const letter = letterOf(p);
					let semis: number;
					if (pt.accidental) {
						semis = accidentalSemitones(pt.accidental);
						barAcc.set(p, semis);
					} else if (pt.endTie && tieCarry.has(p)) {
						semis = tieCarry.get(p)!;
					} else {
						semis = barAcc.get(p) ?? keySemis(key, letter);
					}
					if (pt.startTie) nextCarry.set(p, semis);
					const inflection = Math.sign(semis - keySemis(key, letter));
					top = { midi: midiOf(p, semis), inflection, tied: !!pt.endTie };
				}
				tieCarry = nextCarry;
				notes.push({ ...base, midi: top!.midi, inflection: top!.inflection, tieFromPrev: top!.tied });
			}
		}
	}

	return { key: firstKey, meter: meterOf(tune.getMeter()), notes, warnings: tune.warnings ?? [] };
}
