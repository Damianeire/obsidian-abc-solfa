import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFence, parseFenceOptions, parseGroup } from "../src/layers.ts";

test("fence options override layers", () => {
	assert.deepEqual(parseFence("```abc-solfa"), {});
	assert.deepEqual(parseFence("```abc-solfa solfa=off"), { solfa: false });
	assert.deepEqual(parseFence("````abc-solfa staff=off sticks=on solfa=yes"), { staff: false, sticks: true, solfa: true });
	assert.deepEqual(parseFence("~~~abc-solfa rhythm=on"), { sticks: true });
	assert.deepEqual(parseFence("```abc-solfa colour=red solfa=maybe"), {});
});

test("group= on the fence line", () => {
	assert.equal(parseGroup("```abc-solfa"), null);
	assert.equal(parseGroup("```abc-solfa group=3+3+3"), "3+3+3");
	assert.equal(parseGroup("```abc-solfa staff=off group=2+2+3 solfa=off"), "2+2+3");
	assert.equal(parseGroup("```abc-solfa group=4"), "4");
	assert.equal(parseGroup("```abc-solfa group=3+x"), null);
	assert.equal(parseGroup("```abc-solfa subgroup=3+3"), null);
	assert.deepEqual(parseFenceOptions("```abc-solfa group=2+2+3 solfa=off"), { layers: { solfa: false }, group: "2+2+3" });
});
