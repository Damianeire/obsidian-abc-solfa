// Draws stick notation into an abcjs SVG, in the space left above each staff by
// withStickSpace(). Plain DOM, no Obsidian imports.

import type { Note } from "./parse.ts";
import { drawSticks, STICK_SPACE, TUPLET_ROOM, type BeatGroup, type SvgNode } from "./stick.ts";

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

// renderedTune is what abcjs.renderAbc returned. Its notes are walked the same way as
// parse.ts walks them, so the nth note here is notes[n].
export function addSticksToStaff(svg: SVGSVGElement, renderedTune: any, notes: Note[], groups: BeatGroup[]): void {
	const xs: number[] = new Array(notes.length);
	const lineTops: number[] = new Array(notes.length);
	let i = 0;
	for (const line of renderedTune.lines ?? []) {
		const staff = line.staff?.[0];
		const voice = staff?.voices?.[0];
		if (!voice) continue;
		const s0 = line.staffGroup?.staffs?.[0];
		// The highest point anything on this staff reaches; the space sits above it.
		const top = s0 ? s0.absoluteY - ABCJS_STEP * s0.top : 0;
		for (const el of voice as any[]) {
			if (el.el_type !== "note" || el.rest?.type === "spacer" || el.rest?.type === "invisible") continue;
			const abs = el.abselem;
			const head = abs?.heads?.[0];
			xs[i] = head ? head.x + head.w / 2 : (abs?.x ?? 0) + (abs?.w ?? 0) / 2;
			lineTops[i] = top;
			i++;
		}
	}
	if (i !== notes.length) return; // the two walks disagree; draw nothing rather than misplace sticks

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
	for (const [t, bs] of byTop) {
		const g = doc.createElementNS(SVG_NS, "g");
		for (const n of drawSticks(bs, notes, xs, t - STICK_SPACE + TUPLET_ROOM + 2)) g.appendChild(toDom(n, doc));
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
