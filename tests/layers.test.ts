import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFence } from "../src/layers.ts";

test("fence options override layers", () => {
	assert.deepEqual(parseFence("```abc-solfa"), {});
	assert.deepEqual(parseFence("```abc-solfa solfa=off"), { solfa: false });
	assert.deepEqual(parseFence("````abc-solfa staff=off sticks=on solfa=yes"), { staff: false, sticks: true, solfa: true });
	assert.deepEqual(parseFence("~~~abc-solfa rhythm=on"), { sticks: true });
	assert.deepEqual(parseFence("```abc-solfa colour=red solfa=maybe"), {});
});
