import { test } from "node:test";
import assert from "node:assert/strict";
import { doPitchClass, octaveMark, referenceDo, syllable, toLetters, type KeyInfo } from "../src/solfa.ts";

const key = (root: string, mode: string, accs: [string, string][], acc: "" | "#" | "b" = ""): KeyInfo => ({
	root, acc, mode, accidentals: accs.map(([note, a]) => ({ note, acc: a })),
});
const D = key("D", "", [["F", "sharp"], ["C", "sharp"]]);
const Ador = key("A", "Dor", [["F", "sharp"]]);
const Am = key("A", "m", []);
const Dmix = key("D", "Mix", [["F", "sharp"]]);
const Em = key("E", "m", [["F", "sharp"]]);
const Bb = key("B", "", [["B", "flat"], ["E", "flat"]], "b");

test("do comes from the key signature by default (Kodály, la-based minor)", () => {
	assert.equal(doPitchClass(D, "key-signature"), 2);
	assert.equal(doPitchClass(Ador, "key-signature"), 7); // A is re
	assert.equal(doPitchClass(Am, "key-signature"), 0); // A is la
	assert.equal(doPitchClass(Dmix, "key-signature"), 7); // D is so
	assert.equal(doPitchClass(Em, "key-signature"), 7); // E is la
	assert.equal(doPitchClass(Bb, "key-signature"), 10);
});

test("do on the home note follows the root of the key", () => {
	assert.equal(doPitchClass(Ador, "mode-final"), 9);
	assert.equal(doPitchClass(Dmix, "mode-final"), 2);
	assert.equal(doPitchClass(Bb, "mode-final"), 10);
});

test("diatonic syllables", () => {
	const scale = [62, 64, 66, 67, 69, 71, 73].map((m) => syllable(m, 2, 0));
	assert.deepEqual(scale, ["do", "re", "mi", "fa", "so", "la", "ti"]);
});

test("accidentals take raised or lowered syllables by direction", () => {
	assert.equal(syllable(68, 2, 1), "fi"); // G sharp in D
	assert.equal(syllable(68, 2, -1), "se");
	assert.equal(syllable(72, 2, -1), "ta"); // C natural in D
	assert.equal(syllable(63, 2, 1), "di");
	assert.equal(syllable(70, 2, -1), "le");
});

test("modal notes under the home-note rule", () => {
	// A Dorian with A as do: C is me, G is ta, F sharp is la.
	assert.equal(syllable(72, 9, 0), "me");
	assert.equal(syllable(67, 9, 0), "ta");
	assert.equal(syllable(66, 9, 0), "la");
	// D Mixolydian with D as do: C natural is ta.
	assert.equal(syllable(72, 2, 0), "ta");
});

test("letters keep chromatic syllables whole", () => {
	assert.equal(toLetters("so"), "s");
	assert.equal(toLetters("ti"), "t");
	assert.equal(toLetters("fi"), "fi");
});

test("octave marks are relative to the octave most notes sit in", () => {
	const ref = referenceDo([62, 64, 66, 67, 69, 71, 73, 74, 76], 2);
	assert.equal(ref, 62);
	assert.equal(octaveMark(62, ref), "");
	assert.equal(octaveMark(74, ref), "'");
	assert.equal(octaveMark(86, ref), "''");
	assert.equal(octaveMark(57, ref), ",");
});
