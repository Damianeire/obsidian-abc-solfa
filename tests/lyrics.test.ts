import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import abcjs from "abcjs";
import { parseTune } from "../src/parse.ts";
import { syllables, withSolfa, type SolfaOptions } from "../src/lyrics.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const OPTS: SolfaOptions = { tonicRule: "key-signature", style: "full", octaveMarks: true };

function solfa(name: string, opts = OPTS): string[] {
	const tune = parseTune(fixture(name))!;
	return syllables(tune.notes, opts).filter((s): s is string => s !== null);
}

test("D major scale", () => {
	assert.deepEqual(solfa("scale-d.abc"), ["do", "re", "mi", "fa", "so", "la", "ti", "do'"]);
	assert.deepEqual(solfa("scale-d.abc", { ...OPTS, style: "letters" }), ["d", "r", "m", "f", "s", "l", "t", "d'"]);
	assert.deepEqual(solfa("scale-d.abc", { ...OPTS, octaveMarks: false }).at(-1), "do");
});

test("accidentals last to the bar line, and a key change moves do", () => {
	assert.deepEqual(solfa("accidentals-keychange.abc"), [
		"do'", "ta", "ta", "la", "fi", "fi", "so", // =c carries; ^G carries
		"fa", "mi", "re", "do", // new bar: G and C back to the key
		"do", "re", "mi", "fa", "so", "la", "ti", "do'", // K:G, ^f is already in the key
	]);
});

test("A Dorian and D Mixolydian under both rules", () => {
	const ador = solfa("ador.abc");
	const adorHome = solfa("ador.abc", { ...OPTS, tonicRule: "mode-final", octaveMarks: false });
	// A Dorian shares G major's signature, so A is re. The B part's ^g is di.
	assert.deepEqual(ador.slice(0, 5), ["do", "la,", "re", "re", "mi"]);
	assert.ok(ador.includes("di'"));
	assert.ok(adorHome.includes("me") && adorHome.includes("ta"), "home-note rule gives me and ta");
	const dmix = solfa("dmix.abc", { ...OPTS, octaveMarks: false });
	const tune = parseTune(fixture("dmix.abc"))!;
	const firstD = tune.notes.findIndex((n) => n.midi !== null && n.midi % 12 === 2);
	assert.equal(syllables(tune.notes, { ...OPTS, octaveMarks: false })[firstD], "so");
	assert.ok(dmix.length > 0);
});

// Every fixture: render the generated ABC with abcjs and check that the sol-fa verse
// lands on the right notes, with no syllables left over or missing.
for (const name of readdirSync(new URL("./fixtures/", import.meta.url)).filter((f) => f.endsWith(".abc"))) {
	test(`sol-fa lines up with the notes: ${name}`, () => {
		const src = fixture(name);
		const tune = parseTune(src)!;
		const expected = syllables(tune.notes, OPTS);
		const out = withSolfa(src, tune, OPTS);
		const [parsed] = abcjs.parseOnly(out);
		assert.deepEqual(parsed.warnings ?? [], [], "no abcjs warnings");

		const got: (string | null)[] = [];
		for (const line of parsed.lines) {
			for (const el of (line.staff?.[0]?.voices?.[0] ?? []) as any[]) {
				if (el.el_type !== "note" || el.rest?.type === "spacer" || el.rest?.type === "invisible") continue;
				if (!el.pitches) { got.push(null); continue; }
				const verse = el.lyric?.at(-1)?.syllable;
				got.push(verse === "" ? "*" : verse ?? "(none)");
			}
		}
		assert.deepEqual(got, expected);
	});
}

test("existing lyrics stay as the first verse", () => {
	const src = fixture("accidentals-keychange.abc");
	const out = withSolfa(src, parseTune(src)!, OPTS);
	assert.match(out, /^w: one two\nw: do re mi/m);
});

test("tied notes and triplets", () => {
	const src = "X:1\nM:6/8\nL:1/8\nK:G\nG3-G2 A|(3Bcd e2 z|\n";
	const tune = parseTune(src)!;
	assert.deepEqual(syllables(tune.notes, OPTS), ["do", "*", "re", "mi", "fa", "so", "la", null]);
	assert.deepEqual(tune.notes.slice(3, 6).map((n) => n.tuplet), [3, 3, 3]);
	assert.ok(Math.abs(tune.notes[3].duration - 1 / 12) < 1e-9);
	assert.equal(tune.notes[6].tuplet, null);
	assert.deepEqual(tune.meter, { num: 6, den: 8 });
});
