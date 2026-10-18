import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import abcjs from "abcjs";
import { parseTune } from "../src/parse.ts";
import { stepSize } from "../src/size.ts";
import { musicLineEnds, syllables } from "../src/lyrics.ts";
import { beatUnits, defaultGrouping, lookup, parseGrouping } from "../src/rhythmTable.ts";
import { drawEndings, drawSticks, groupBeats, stickLines, stickSpace, toSvgString, withStickSpace, type BeatGroup } from "../src/stick.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const name = (beats: number[], durs: number[], rests?: boolean[]) => lookup(beats, durs, rests)?.name ?? null;

// Pattern names bar by bar, "?" where the table has nothing.
function barsOf(abc: string, group?: string): string[][] {
	const tune = parseTune(abc)!;
	const grouping = group ? parseGrouping(group, tune.meter)! : defaultGrouping(tune.meter);
	const out = new Map<number, string[]>();
	for (const g of groupBeats(tune.notes, grouping, tune.barLines)) {
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
	// Two dotted eighths and an eighth over two beats are not in the table.
	const tune = parseTune("X:1\nM:4/4\nL:1/16\nK:C\nC3C3C2 G8|\n")!;
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
	const bars = { bars: tune.barLines, barLines: musicLineEnds(src, tune.barLines) };
	const both = stickLines(tune.notes, defaultGrouping(tune.meter), { sticks: true, solfa: syllables(tune.notes, opts), lines, ...bars });
	assert.equal(both.length, 8);
	const first = toSvgString(both[0]);
	assert.match(first, /^<svg class="abc-solfa-sticks" xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 [\d.]+ [\d.]+"/);
	assert.equal(first.split('class="abc-solfa-barline"').length - 1, 4);
	assert.deepEqual([...first.matchAll(/class="abc-solfa-solfa-syl"[^>]*>([^<]+)</g)].slice(0, 4).map((m) => m[1]), ["d", "s", "m", "d"]);

	const solfaOnly = toSvgString(stickLines(tune.notes, defaultGrouping(tune.meter), { sticks: false, solfa: syllables(tune.notes, opts), lines, ...bars })[0]);
	assert.doesNotMatch(solfaOnly, /abc-solfa-beat/);
	const sticksOnly = toSvgString(stickLines(tune.notes, defaultGrouping(tune.meter), { sticks: true, solfa: null, lines, ...bars })[0]);
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

// Sticks without a staff, as SVG strings, one per line.
function stickSvgs(abc: string, solfa = false): string[] {
	const tune = parseTune(abc)!;
	const opts = { tonicRule: "key-signature", style: "letters", octaveMarks: false } as const;
	return stickLines(tune.notes, defaultGrouping(tune.meter), {
		sticks: true,
		solfa: solfa ? syllables(tune.notes, opts) : null,
		lines: musicLineEnds(abc, tune.notes),
		bars: tune.barLines,
		barLines: musicLineEnds(abc, tune.barLines),
	}).map(toSvgString);
}
const rhythmSyls = (svg: string) => [...svg.matchAll(/class="abc-solfa-rhythm-syl"[^>]*>([^<]+)</g)].map((m) => m[1]);
const count = (svg: string, cls: string) => svg.split(`class="${cls}"`).length - 1;

test("ties: an arc from note to note, and the held note is not spoken again", () => {
	const src = fixture("ties.abc");
	// A2-A B c2-c2|d4-d2 AF|D8-| D4 z2 FA|]
	assert.deepEqual(barsOf(src), [["ta", "ti-ti", "ta", "ta"], ["ta-a", "ta", "ti-ti"], ["ta-a-a-a"], ["ta-a", "rest", "ti-ti"]]);
	const tune = parseTune(src)!;
	assert.deepEqual(tune.notes.map((n) => +n.tieFromPrev).join(""), "01001010001000");
	const [one, two] = stickSvgs(src);
	// ta tied to ti, ta tied to ta, a held half note, and half an arc running off the line.
	assert.equal(count(one, "abc-solfa-tie"), 4);
	assert.deepEqual(rhythmSyls(one), ["ta", "ti", "ta", "ta-a", "ti", "ti", "ta-a-a-a"]);
	// The whole note tied over the bar line and the line break: the next line opens
	// with the other half of the arc and no syllable on the held note.
	assert.equal(count(two, "abc-solfa-tie"), 1);
	assert.deepEqual(rhythmSyls(two), ["ti", "ti"]);
});

test("pickups: counted from the end of the bar, after a repeat sign or at the start", () => {
	const src = fixture("repeats-endings.abc");
	const bars = barsOf(src);
	assert.deepEqual(bars[0], ["ti-ti"]); // |:dB| fills the last beat
	// |:FGA| after a full second ending: a lone ti on the off beat, then ti-ti.
	const tune = parseTune(src)!;
	const groups = groupBeats(tune.notes, defaultGrouping(tune.meter), tune.barLines);
	const pickup = groups.filter((g) => g.bar === 8);
	assert.deepEqual(pickup.map((g) => g.count), [1, 2]);
	assert.equal(pickup[0].pattern!.notes[0].flags, 1);
	// Short first and second endings count from their start.
	assert.deepEqual(bars[4], ["ta", "ta", "ta"]);
	assert.deepEqual(bars[5], ["ta", "ta", "ta"]);
	// A second ending that would complete the first one is still not a pickup.
	const ends = barsOf("X:1\nM:4/4\nL:1/8\nK:D\nABc|d2d2 d2d2|1 d2d2d:|2 d2d||\n");
	assert.deepEqual(ends.at(-1), ["ta", "ti-ti with rest"]);
});

test("repeat signs and ending brackets without a staff", () => {
	const [a, b, c] = stickSvgs(fixture("repeats-endings.abc"));
	// Line one: |: ... |1 ... :|2 ... ||
	assert.equal(count(a, "abc-solfa-bar abc-solfa-repeat"), 2);
	assert.deepEqual([...a.matchAll(/class="abc-solfa-ending-label"[^>]*>([^<]+)</g)].map((m) => m[1]), ["1", "2"]);
	// The first ending closes with a hook at the repeat sign; the second has none at the double bar.
	const paths = [...a.matchAll(/<g class="abc-solfa-ending"><path d="([^"]+)"/g)].map((m) => m[1]);
	assert.equal(paths.length, 2);
	assert.match(paths[0], /^M[\d.]+ 11 V4 H[\d.]+ V11$/);
	assert.match(paths[1], /^M[\d.]+ 11 V4 H[\d.]+$/);
	assert.equal(count(b, "abc-solfa-ending"), 2);
	assert.equal(c, undefined);
	// No endings, no room left for them.
	assert.match(stickSvgs(fixture("ties.abc"))[0], /<line x1="16" y1="12" /);
	assert.match(a, /<line x1="[\d.]+" y1="24" /);
});

test("an ending carried over a line break", () => {
	const bar = (x: number, type: string, ending: string | null, endsEnding = false) => ({ x, type, ending, endsEnding });
	const one = drawEndings([bar(50, "bar_thin", "1")], 0, 200, 4, null);
	assert.equal(one.open, "1");
	assert.equal(toSvgString(one.nodes[0]), '<g class="abc-solfa-ending"><path d="M50 11 V4 H200" fill="none"></path><text x="53" y="13" class="abc-solfa-ending-label">1</text></g>');
	const two = drawEndings([bar(80, "bar_right_repeat", "2", true)], 5, 200, 4, one.open);
	assert.equal(two.open, "2");
	assert.equal(toSvgString(two.nodes[0]), '<g class="abc-solfa-ending"><path d="M5 4 V4 H86 V11" fill="none"></path></g>');
});

test("group= replaces the default grouping", () => {
	const src = fixture("seven-eight.abc");
	assert.ok(barsOf(src).flat().every((p) => p === "?")); // seven single eighths
	assert.deepEqual(barsOf(src, "2+2+3"), [["ta", "ta", "ta-i"], ["ti-ti", "ti-ti", "ta ti"], ["ta", "ta", "ta-i"]]);
	assert.deepEqual(barsOf(src, "3+2+2")[0], ["?"]); // A2B2 c3 does not fit 3+2+2
	// Counted in eighths when that is what fills the bar.
	assert.deepEqual(beatUnits(parseGrouping("3+3+2", { num: 4, den: 4 })!), [6, 6, 4]);
	assert.deepEqual(beatUnits(parseGrouping("2+2+2+3", { num: 9, den: 8 })!), [4, 4, 4, 6]);
	assert.equal(parseGrouping("3+3", { num: 9, den: 8 }), null);
	const reel = barsOf(fixture("reel.abc"), "2+2");
	assert.ok(reel.every((b) => b.length === 2));
});

test("sixteenth-note and quarter-note triplets", () => {
	const src = fixture("tuplets.abc");
	const tune = parseTune(src)!;
	const groups = groupBeats(tune.notes, defaultGrouping(tune.meter), tune.barLines);
	const sylls = groups.map((g) => g.pattern!.notes.map((n) => n.syllable).join(" "));
	// (3G/A/B/ c (3d/e/f/ g (3B2c2d2|(3cde (3fga (5ABcde f2|
	assert.deepEqual(sylls, ["tri o la ti", "tri o la ti", "tri o la", "tri o la", "tri o la", "    ", "ta"]);
	const [sixteenths, , quarters] = groups;
	assert.deepEqual(sixteenths.pattern!.beams, [{ from: 0, to: 3, level: 1 }, { from: 0, to: 2, level: 2 }]);
	assert.deepEqual(sixteenths.pattern!.tuplets, [{ from: 0, to: 2, n: 3, bracket: false }]);
	// A quarter-note triplet covers two beats, with no beam, so it gets a bracket.
	assert.deepEqual(quarters.beats, [4, 4]);
	assert.deepEqual(quarters.pattern!.beams, []);
	assert.equal(quarters.pattern!.tuplets![0].bracket, true);
	const svg = drawSticks([quarters], tune.notes, tune.notes.map((_, i) => 20 * i), 10).map(toSvgString).join("");
	assert.match(svg, /<path class="abc-solfa-bracket" d="M157 8 V5 H175 M185 5 H203 V8" fill="none">/);
	// Other tuplets: sticks, beams and the number, no syllables.
	assert.deepEqual(groups[5].pattern!.tuplets, [{ from: 0, to: 4, n: 5, bracket: false }]);
	assert.deepEqual(groups[5].pattern!.beams, [{ from: 0, to: 4, level: 1 }]);
});

test("tuplets in compound time", () => {
	const tune = parseTune(fixture("compound-tuplets.abc"))!;
	const groups = groupBeats(tune.notes, defaultGrouping(tune.meter), tune.barLines);
	// (2GA (3B/c/d/ e2|(4GABc d3|
	assert.deepEqual(groups.map((g) => g.pattern!.tuplets?.map((t) => t.n) ?? []), [[2], [3], [4], []]);
	assert.deepEqual(groups[1].pattern!.notes.map((n) => n.syllable), ["tri", "o", "la", "ta"]);
	assert.equal(groups[3].pattern!.name, "ta-i");
	assert.ok(groups.every((g) => g.pattern));
});

test("rhythm syllables can be left out", () => {
	const src = fixture("jig-man-in-the-bog.abc");
	const tune = parseTune(src)!;
	const opts = { tonicRule: "key-signature", style: "letters", octaveMarks: false } as const;
	const layout = (rhythmSyllables: boolean) => toSvgString(stickLines(tune.notes, defaultGrouping(tune.meter), {
		sticks: true,
		solfa: syllables(tune.notes, opts),
		lines: musicLineEnds(src, tune.notes),
		bars: tune.barLines,
		barLines: musicLineEnds(src, tune.barLines),
		rhythmSyllables,
	})[0]);
	const on = layout(true), off = layout(false);
	assert.ok(rhythmSyls(on).length > 0);
	assert.deepEqual(rhythmSyls(off), []);
	// The sticks and sol-fa stay, and the row the syllables took is given back.
	assert.equal(count(off, "abc-solfa-beat"), count(on, "abc-solfa-beat"));
	assert.equal(count(off, "abc-solfa-solfa-syl"), count(on, "abc-solfa-solfa-syl"));
	const height = (svg: string) => Number(svg.match(/ height="([\d.]+)"/)![1]);
	assert.equal(height(on) - height(off), 13);
	assert.equal(stickSpace(false, true) - stickSpace(false, false), 13);
});

test("larger and smaller sticks", () => {
	const tune = parseTune("X:1\nM:2/4\nL:1/8\nK:C\n(3CDE F2-|F2 G2|\n")!;
	const groups = groupBeats(tune.notes, defaultGrouping(tune.meter));
	const xs = tune.notes.map((_, i) => 10 + 20 * i);
	const big = drawSticks(groups, tune.notes, xs, 10, true, 2).map(toSvgString).join("");
	// Each note grows about the top of its stick, so it stays at its x position.
	assert.match(big, /<g transform="matrix\(2 0 0 2 -10 -10\)"><line x1="10" y1="10" x2="10" y2="32">/);
	// Beams only grow in height, so they still join the same sticks.
	assert.match(big, /<rect class="abc-solfa-beam" x="8.5" y="10" width="43" height="6">/);
	assert.equal(drawSticks(groups, tune.notes, xs, 10).map(toSvgString).join("").includes("matrix"), false);
	assert.equal(stickSpace(true, true, 1.5), stickSpace(true, true) * 1.5);

	const src = fixture("jig-man-in-the-bog.abc");
	const t = parseTune(src)!;
	const lineOf = (scale: number) => toSvgString(stickLines(t.notes, defaultGrouping(t.meter), {
		sticks: true, solfa: null, lines: musicLineEnds(src, t.notes),
		bars: t.barLines, barLines: musicLineEnds(src, t.barLines), scale,
	})[0]);
	const size = (svg: string) => svg.match(/viewBox="([^"]+)" width="([\d.]+)" height="([\d.]+)"/)!.slice(1);
	const [box, w, h] = size(lineOf(1));
	assert.deepEqual(size(lineOf(1.5)), [box, String(Number(w) * 1.5), String(Number(h) * 1.5)]);
});

test("size steps", () => {
	assert.equal(stepSize(1, 1), 1.15);
	assert.equal(stepSize(1, -1), 0.85);
	assert.equal(stepSize(2, 1), 2);
	assert.equal(stepSize(0.75, -1), 0.75);
	assert.equal(stepSize(1.2, -1), 1.15);
});

test("larger sol-fa than rhythm syllables", () => {
	const src = fixture("jig-man-in-the-bog.abc");
	const tune = parseTune(src)!;
	const opts = { tonicRule: "key-signature", style: "full", octaveMarks: false } as const;
	const lineOf = (solfaScale: number) => toSvgString(stickLines(tune.notes, defaultGrouping(tune.meter), {
		sticks: true, solfa: syllables(tune.notes, opts), lines: musicLineEnds(src, tune.notes),
		bars: tune.barLines, barLines: musicLineEnds(src, tune.barLines), solfaScale,
	})[0]);
	const normal = lineOf(1), big = lineOf(1.5);
	// The sol-fa grows about its own place under the note; the rhythm syllables do not.
	assert.doesNotMatch(normal, /matrix/);
	assert.match(big, /<g transform="matrix\(1.5 0 0 1.5 [-\d.]+ [-\d.]+\)"><text x="[\d.]+" y="[\d.]+" class="abc-solfa-solfa-syl"/);
	assert.equal(rhythmSyls(big).length, rhythmSyls(normal).length);
	assert.doesNotMatch(big, /matrix[^>]*><text[^>]*abc-solfa-rhythm-syl/);
	// The drawing is taller and wider to make room.
	const size = (svg: string) => svg.match(/ width="([\d.]+)" height="([\d.]+)"/)!.slice(1).map(Number);
	const [w1, h1] = size(normal), [w2, h2] = size(big);
	assert.ok(w2 > w1 && h2 > h1);
	assert.equal(h2 - h1, 13 * 0.5 + 6 * 0.5);
});

test("on a narrow page every line shrinks by the same amount", () => {
	const src = fixture("jig-man-in-the-bog.abc");
	const tune = parseTune(src)!;
	const svgs = stickLines(tune.notes, defaultGrouping(tune.meter), {
		sticks: true, solfa: null, lines: musicLineEnds(src, tune.notes),
		bars: tune.barLines, barLines: musicLineEnds(src, tune.barLines),
	});
	// Each line may take its share of the page, measured against the widest line.
	const widths = svgs.map((s) => Number(s.attrs.width));
	const shares = svgs.map((s) => Number(String(s.attrs.style).match(/max-width: ([\d.]+)%/)![1]));
	const widest = Math.max(...widths);
	widths.forEach((w, i) => assert.ok(Math.abs(shares[i] - (w / widest) * 100) < 0.01));
	assert.equal(Math.max(...shares), 100);
});
