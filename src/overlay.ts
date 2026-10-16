// Draws stick notation into an abcjs SVG, in the space left above each staff by
// withStickSpace(). Plain DOM, no Obsidian imports.

import type { BarLine, Note } from "./parse.ts";
import {
	drawBarLine, drawEndings, drawSticks, ENDING_ROOM, isRepeat, stickSpace, STICK_HEIGHT, TUPLET_ROOM,
	type BeatGroup, type PlacedBar, type SvgNode,
} from "./stick.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
// abcjs moves one "pitch" step of the staff this many units (spacing.STEP).
const ABCJS_STEP = (30 * 93) / 720;

export function toDom(node: SvgNode, doc: Document = document): SVGElement {
	const e = doc.createElementNS(SVG_NS, node.tag);
	for (const [k, v] of Object.entries(node.attrs)) {
		if (k !== "xmlns") e.setAttribute(k, String(v));
	}
	if (node.text !== undefined) e.textContent = node.text;
	for (const c of node.children ?? []) e.appendChild(toDom(c, doc));
	return e;
}

// renderedTune is what abcjs.renderAbc returned. Its notes and bar lines are walked the
// same way as parse.ts walks them, so the nth note here is notes[n] and the nth bar
// line is bars[n]. Repeat signs and ending brackets go in the stick band at the staff's
// own bar line positions.
export function addSticksToStaff(
	svg: SVGSVGElement, renderedTune: any, notes: Note[], groups: BeatGroup[], bars: BarLine[] = [], syllables = true,
): void {
	const xs: number[] = new Array(notes.length);
	const lineTops: number[] = new Array(notes.length);
	const placed: { top: number; bar: PlacedBar }[] = [];
	const extents = new Map<number, { start: number; end: number }>();
	let i = 0;
	for (const line of renderedTune.lines ?? []) {
		const staff = line.staff?.[0];
		const voice = staff?.voices?.[0];
		if (!voice) continue;
		const s0 = line.staffGroup?.staffs?.[0];
		// The highest point anything on this staff reaches; the space sits above it.
		const top = s0 ? s0.absoluteY - ABCJS_STEP * s0.top : 0;
		const sg = line.staffGroup;
		if (sg) extents.set(top, { start: sg.startx ?? 0, end: (sg.startx ?? 0) + (sg.w ?? 0) });
		for (const el of voice as any[]) {
			if (el.el_type === "bar") {
				const b = bars[placed.length];
				if (b) placed.push({ top, bar: { x: el.abselem?.x ?? 0, type: b.type, ending: b.ending, endsEnding: b.endsEnding } });
				continue;
			}
			if (el.el_type !== "note" || el.rest?.type === "spacer" || el.rest?.type === "invisible") continue;
			const abs = el.abselem;
			const head = abs?.heads?.[0];
			xs[i] = head ? head.x + head.w / 2 : (abs?.x ?? 0) + (abs?.w ?? 0) / 2;
			lineTops[i] = top;
			i++;
		}
	}
	if (i !== notes.length) return; // the two walks disagree; draw nothing rather than misplace sticks
	const barsOk = placed.length === bars.length;
	const endings = barsOk && bars.some((b) => b.ending);
	const space = stickSpace(endings, syllables);

	const doc = svg.ownerDocument;
	const root = doc.createElementNS(SVG_NS, "g");
	root.setAttribute("class", "abc-solfa-sticks");
	// One group per staff line, since each line has its own height.
	const byTop = new Map<number, BeatGroup[]>();
	for (const b of groups) {
		const t = lineTops[b.first];
		if (!byTop.has(t)) byTop.set(t, []);
		byTop.get(t)!.push(b);
	}
	const lines: { g: SVGGElement; top: number }[] = [];
	let open: string | null = null;
	for (const [t, bs] of byTop) {
		const g = doc.createElementNS(SVG_NS, "g");
		const bandTop = t - space + 2;
		const stickTop = bandTop + (endings ? ENDING_ROOM : 0) + TUPLET_ROOM;
		const nodes = drawSticks(bs, notes, xs, stickTop, syllables);
		if (barsOk) {
			const lineBars = placed.filter((p) => p.top === t).map((p) => p.bar);
			// Plain bar lines are left to the staff; repeat signs are drawn so the sticks
			// can be read on their own.
			for (const b of lineBars) if (isRepeat(b.type)) nodes.push(drawBarLine(b.type, b.x, stickTop, stickTop + STICK_HEIGHT));
			if (endings) {
				const ext = extents.get(t) ?? { start: 0, end: svg.viewBox.baseVal?.width ?? 0 };
				const e = drawEndings(lineBars, ext.start, ext.end, bandTop, open);
				open = e.open;
				nodes.push(...e.nodes);
			}
		}
		for (const n of nodes) g.appendChild(toDom(n, doc));
		root.appendChild(g);
		lines.push({ g, top: t });
	}
	svg.appendChild(root);
	fitToStaffs(svg, lines);
}

// abcjs sometimes keeps empty room above a staff (for brackets and the like). Once the
// SVG is on the page its real extent can be measured, and the sticks moved down to it.
function fitToStaffs(svg: SVGSVGElement, lines: { g: SVGGElement; top: number }[], tries = 10): void {
	if (!svg.isConnected) {
		if (tries > 0) requestAnimationFrame(() => fitToStaffs(svg, lines, tries - 1));
		return;
	}
	const wrappers = Array.from(svg.querySelectorAll<SVGGElement>("g.abcjs-staff-wrapper"));
	if (wrappers.length !== lines.length) return;
	lines.forEach(({ g, top }, k) => {
		const box = wrappers[k].getBBox();
		if (box.height > 0 && box.y > top + 0.5) g.setAttribute("transform", `translate(0 ${box.y - top})`);
	});
}
