// Pitch to sol-fa syllable. Pure functions, no abcjs or Obsidian imports.

export type TonicRule = "key-signature" | "mode-final";
export type SyllableStyle = "full" | "letters";

export interface KeyInfo {
	root: string; // "A".."G", or "none" / "HP"
	acc: "" | "#" | "b";
	mode: string; // abcjs mode: "", "m", "Dor", "Mix", "Loc", "Phr", "Lyd"
	accidentals: { note: string; acc: string }[];
}

// Semitones above C for each letter.
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const DIATONIC: Record<number, string> = { 0: "do", 2: "re", 4: "mi", 5: "fa", 7: "so", 9: "la", 11: "ti" };
const RAISED: Record<number, string> = { 1: "di", 3: "ri", 6: "fi", 8: "si", 10: "li" };
const LOWERED: Record<number, string> = { 1: "ra", 3: "me", 6: "se", 8: "le", 10: "ta" };
// Chromatic notes that belong to the key signature (only under the mode-final rule),
// named the way they usually are in modal sol-fa: Dorian me and ta, Lydian fi, and so on.
const MODAL: Record<number, string> = { 1: "ra", 3: "me", 6: "fi", 8: "le", 10: "ta" };

const mod12 = (n: number) => ((n % 12) + 12) % 12;

export function accidentalSemitones(acc: string | undefined): number {
	switch (acc) {
		case "sharp": return 1;
		case "flat": return -1;
		case "dblsharp": return 2;
		case "dblflat": return -2;
		default: return 0; // natural, quarter tones, none
	}
}

export function naturalSemitones(letter: string): number {
	return NATURAL[letter.toUpperCase()] ?? 0;
}

// Pitch class (0 = C) that is sung as do.
// key-signature: do is the major tonic of the key signature, so Am and Em are la-based,
// Ador is re-based and Dmix is so-based. mode-final: do is the tune's home note.
export function doPitchClass(key: KeyInfo, rule: TonicRule): number {
	if (rule === "mode-final" && key.root in NATURAL) {
		return mod12(NATURAL[key.root] + (key.acc === "#" ? 1 : key.acc === "b" ? -1 : 0));
	}
	let sharps = 0, flats = 0;
	for (const a of key.accidentals) {
		if (a.acc === "sharp") sharps++;
		else if (a.acc === "flat") flats++;
	}
	if (sharps && !flats) return mod12(7 * sharps);
	if (flats && !sharps) return mod12(5 * flats);
	// No sharps or flats (C major and its modes, K:none), or an unusual mixed signature.
	return 0;
}

// inflection: +1 when an accidental raises the note above the key signature,
// -1 when it lowers it, 0 when the note is as the key signature says.
export function syllable(midi: number, doPc: number, inflection: number): string {
	const offset = mod12(midi - doPc);
	if (offset in DIATONIC) return DIATONIC[offset];
	if (inflection > 0) return RAISED[offset];
	if (inflection < 0) return LOWERED[offset];
	return MODAL[offset];
}

// "do" -> "d", "so" -> "s". Chromatic syllables keep both letters so they stay distinct.
export function toLetters(s: string): string {
	return Object.values(DIATONIC).includes(s) ? s[0] : s;
}

// MIDI number of the do that most notes sit just above, so a tune in the usual
// fiddle range reads d r m ... without octave marks for most of it.
export function referenceDo(midis: number[], doPc: number): number {
	let best = 60 + mod12(doPc - 60), bestCount = -1;
	for (let base = 36 + mod12(doPc - 36); base <= 84; base += 12) {
		const count = midis.filter((m) => m >= base && m < base + 12).length;
		if (count > bestCount) { best = base; bestCount = count; }
	}
	return best;
}

export function octaveMark(midi: number, refDo: number): string {
	const n = Math.floor((midi - refDo) / 12);
	return n > 0 ? "'".repeat(n) : ",".repeat(-n);
}
