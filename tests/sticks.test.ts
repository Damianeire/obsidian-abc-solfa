import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import abcjs from "abcjs";
import { parseTune } from "../src/parse.ts";
import { musicLineEnds, syllables } from "../src/lyrics.ts";
import { beatUnits, defaultGrouping, lookup, parseGrouping } from "../src/rhythmTable.ts";
import { drawSticks, groupBeats, stickLines, toSvgString, withStickSpace, type BeatGroup } from "../src/stick.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const name = (beats: number[], durs: number[], rests?: boolean[]) => lookup(beats, durs, rests)?.name ?? null;

// Pattern names bar by bar, "?" where the table has nothing.
function barsOf(abc: string): string[][] {
	const tune = parseTune(abc)!;
	const out = new Map<number, string[]>();
	for (const g of groupBeats(tune.notes, defaultGrouping(tune.meter))) {
		if (!out.has(g.bar)) out.set(g.bar, []);
		out.get(g.bar)!.push(g.pattern?.name ?? "?");
	}
	return [...out.values()];
}

test("simple-meter beats", () => {
	assert.equal(name([4], [4]), "ta");
	assert.equal(name([4], [2, 2]), "ti-ti");
	assert.equal(name([4], [1, 1, 1, 1]), "tika-tika");
	assert.equal(name([4], [2, 1, 1]), "ti-tika");
	assert.equal(name([4], [1, 1, 2]), "tika-ti");
	assert.equal(name([4, 4], [8]), "ta-a");
	assert.equal(name([4, 4], [6, 2]), "ta-i ti");
	assert.deepEqual(lookup([4], [1, 1, 2])!.notes.map((n) => n.syllable), ["ti", "ka", "ti"]);
});

test("compound-meter beats", () => {
	assert.equal(name([6], [6]), "ta-i");
	assert.equal(name([6], [2, 2, 2]), "ti-ti-ti");
	assert.equal(name([6], [4, 2]), "ta ti");
	assert.equal(name([6], [2, 4]), "ti ta");
	assert.equal(name([6], [1, 1, 2, 2]), "tika-ti-ti");
	// A quarter's worth of notes is not a compound beat, and the reverse.
	assert.equal(name([6], [2, 2]), null);
	assert.equal(name([4], [2, 2, 2]), null);
});

test("rests", () => {
	assert.equal(name([4], [4], [true]), "rest");
	assert.equal(name([6], [6], [true]), "rest");
	assert.equal(name([4, 4], [8], [true]), "half rest");
	// A rest inside a beat keeps the beat's shape; the beam breaks and leaves a flag.
	const p = lookup([4], [2, 2], [false, true])!;
	assert.equal(p.name, "ti-ti with rest");
	assert.deepEqual(p.beams, []);
	assert.equal(p.notes[0].flags, 1);
	assert.equal(p.notes[1].rest, true);
	// Two of three eighths still share a beam.
	assert.deepEqual(lookup([6], [2, 2, 2], [true, false, false])!.beams, [{ from: 1, to: 2, level: 1 }]);
});

test("default grouping for each meter", () => {
	const units = (num: number, den: number) => beatUnits(defaultGrouping({ num, den }));
	assert.deepEqual(units(4, 4), [4, 4, 4, 4]);
	assert.deepEqual(units(3, 4), [4, 4, 4]);
	assert.deepEqual(units(2, 4), [4, 4]);
	assert.deepEqual(units(6, 8), [6, 6]);
	assert.deepEqual(units(9, 8), [6, 6, 6]);
	assert.deepEqual(units(12, 8), [6, 6, 6, 6]);
	assert.deepEqual(units(2, 2), [4, 4, 4, 4]);
	assert.deepEqual(defaultGrouping({ num: 9, den: 8 }), parseGrouping("3+3+3", { num: 9, den: 8 }));
	assert.deepEqual(beatUnits(parseGrouping("2+2+3", { num: 7, den: 8 })!), [4, 4, 6]);
	assert.equal(parseGrouping("3+x", { num: 6, den: 8 }), null);
});

test("jig: two dotted-quarter beats a bar, all in the table", () => {
	const bars = barsOf(fixture("jig-man-in-the-bog.abc"));
	assert.equal(bars.length, 32);
	assert.ok(bars.every((b) => b.length === 2 && !b.includes("?")));
	assert.deepEqual(bars[0], ["ta-i", "ti-ti-ti"]); // ~G3 dBG
	assert.deepEqual(bars[7], ["ti-ti-ti", "ta ti"]); // AGF G2F
});

test("slip jig: three beats a bar, sixteenths included", () => {
	const bars = barsOf(fixture("slip-jig.abc"));
	assert.ok(bars.every((b) => b.length === 3 && !b.includes("?")));
	assert.deepEqual(bars[0], ["ta ti", "ta ti", "ti-ti-ti"]); // G2B E2B BAG
	assert.deepEqual(bars[3], ["tika-ti-ti", "ti-ti-ti", "ti-ti-ti"]); // B/c/dB AGF DEF
	assert.deepEqual(bars[7].at(-1), "ta-i"); // E3
});

test("reel: four quarter beats a bar, eighth-note triplets as tri-o-la", () => {
	const bars = barsOf(fixture("reel.abc"));
	assert.ok(bars.every((b) => b.length === 4));
	assert.deepEqual(bars[0], ["ti-ti", "tri-o-la", "ti-ti", "ti-ti"]); // dD (3DDD ADFA
	assert.deepEqual(bars[2], ["ti-ti", "ta", "ti-ti", "ti-ti"]); // BE ~E2 gfed
	assert.equal(bars.flat().filter((p) => p === "tri-o-la").length, 4);
	assert.ok(!bars.flat().includes("?"));
	assert.equal(barsOf(fixture("triplets.abc"))[7].at(-1), "tri-o-la"); // AF (3EFG
});

test("triplet drawing: one beam and a 3 above it", () => {
	const tune = parseTune("X:1\nM:2/4\nL:1/8\nK:C\n(3CDE F2|\n")!;
	const groups = groupBeats(tune.notes, defaultGrouping(tune.meter));
	const svg = drawSticks(groups, tune.notes, tune.notes.map((_, i) => 10 + 20 * i), 10).map(toSvgString).join("");
	assert.match(svg, /<text x="30" y="7" class="abc-solfa-tuplet" text-anchor="middle">3<\/text>/);
	assert.deepEqual([...svg.matchAll(/class="abc-solfa-rhythm-syl"[^>]*>([^<]+)</g)].map((m) => m[1]), ["tri", "o", "la", "ta"]);
	assert.equal(svg.split("<rect ").length - 1, 1);
});

test("pickups count back from the bar line", () => {
	const tune = parseTune("X:1\nM:6/8\nL:1/8\nK:D\nA|d2A FED|\n")!;
	const [pickup] = groupBeats(tune.notes, defaultGrouping(tune.meter));
	assert.equal(pickup.count, 1);
	assert.equal(pickup.pattern!.notes.length, 1);
	assert.equal(pickup.pattern!.notes[0].flags, 1); // a lone ti with a flag
	// The short bar at the end of one part and the pickup that starts the next.
	assert.deepEqual(barsOf(fixture("triplets.abc"))[9], ["ti-ti"]);
});

const svgOf = (groups: BeatGroup[], n: number) => {
	const tune = parseTune("X:1\nM:4/4\nL:1/16\nK:C\nC4 C2C2 CCCC C2CC|\n")!;
	return drawSticks(groups.slice(n, n + 1), tune.notes, tune.notes.map((_, i) => 10 + 20 * i), 0).map(toSvgString).join("");
};

test("SVG sticks, beams and syllables", () => {
	const tune = parseTune("X:1\nM:4/4\nL:1/16\nK:C\nC4 C2C2 CCCC C2CC|\n")!;
	const groups = groupBeats(tune.notes, defaultGrouping(tune.meter));
	assert.deepEqual(groups.map((g) => g.pattern?.name), ["ta", "ti-ti", "tika-tika", "ti-tika"]);
	const count = (s: string, tag: string) => s.split(`<${tag} `).length - 1;

	const ta = svgOf(groups, 0);
	assert.equal(count(ta, "line"), 1);
	assert.equal(count(ta, "rect"), 0);
	assert.match(ta, />ta<\/text>/);

	const titi = svgOf(groups, 1);
	assert.equal(count(titi, "line"), 2);
	assert.equal(count(titi, "rect"), 1);
	// The beam runs from the first stick to the second.
	assert.match(titi, /<rect class="abc-solfa-beam" x="29.25" y="0" width="21.5" height="3">/);

	const tika = svgOf(groups, 2);
	assert.equal(count(tika, "line"), 4);
	assert.equal(count(tika, "rect"), 2);
	assert.deepEqual([...tika.matchAll(/>(\w+)<\/text>/g)].map((m) => m[1]), ["ti", "ka", "ti", "ka"]);
});

test("SVG fallback for patterns not in the table", () => {
	// A sixteenth-note triplet is not in the table yet.
	const tune = parseTune("X:1\nM:4/4\nL:1/8\nK:C\n(3C/D/E/ F G2 G4|\n")!;
	const groups = groupBeats(tune.notes, defaultGrouping(tune.meter));
	assert.equal(groups[0].pattern, null);
	const svg = drawSticks(groups, tune.notes, tune.notes.map((_, i) => 20 * i), 0).map(toSvgString).join("");
	assert.match(svg, /<g class="abc-solfa-beat abc-solfa-unknown">.*>\?<\/text><\/g>/);
	assert.match(svg, />ta-a<\/text>/);
	assert.match(svg, /<ellipse class="abc-solfa-head"/);
});

test("sticks without a staff: one SVG per line, with an optional sol-fa row", () => {
	const src = fixture("jig-man-in-the-bog.abc");
	const tune = parseTune(src)!;
	const opts = { tonicRule: "key-signature", style: "letters", octaveMarks: false } as const;
	const lines = musicLineEnds(src, tune.notes);
	const both = stickLines(tune.notes, defaultGrouping(tune.meter), { sticks: true, solfa: syllables(tune.notes, opts), lines });
	assert.equal(both.length, 8);
	const first = toSvgString(both[0]);
	assert.match(first, /^<svg class="abc-solfa-sticks" xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 [\d.]+ [\d.]+"/);
	assert.equal(first.split('class="abc-solfa-barline"').length - 1, 4);
	assert.deepEqual([...first.matchAll(/class="abc-solfa-solfa-syl"[^>]*>([^<]+)</g)].slice(0, 4).map((m) => m[1]), ["d", "s", "m", "d"]);

	const solfaOnly = toSvgString(stickLines(tune.notes, defaultGrouping(tune.meter), { sticks: false, solfa: syllables(tune.notes, opts), lines })[0]);
	assert.doesNotMatch(solfaOnly, /abc-solfa-beat/);
	const sticksOnly = toSvgString(stickLines(tune.notes, defaultGrouping(tune.meter), { sticks: true, solfa: null, lines })[0]);
	assert.doesNotMatch(sticksOnly, /abc-solfa-solfa-syl/);
});

test("space for sticks goes before each music line", () => {
	const src = "X:1\nT:t\nM:6/8\nL:1/8\nK:G\nGAB cde|\\\nfed cBA|\nw: a b c\nGAB cde|\n";
	const out = withStickSpace(src, musicLineEnds(src, parseTune(src)!.notes), 40);
	assert.equal(out, "X:1\nT:t\nM:6/8\nL:1/8\nK:G\n%%vskip 40\nGAB cde|\\\nfed cBA|\nw: a b c\n%%vskip 40\nGAB cde|\n");
	const [parsed] = abcjs.parseOnly(out);
	assert.deepEqual(parsed.warnings ?? [], []);
	assert.equal(parseTune(out)!.notes.length, parseTune(src)!.notes.length);
});
