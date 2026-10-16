// One abc-solfa code block: a header of layer toggles and the rendered tune.

import { MarkdownRenderChild } from "obsidian";
import abcjs from "abcjs";
import type { AbcSolfaSettings } from "./settings.ts";
import { LAYER_NAMES, type FenceOptions, type LayerName, type Layers } from "./layers.ts";
import { parseTune, type Tune } from "./parse.ts";
import { musicLineEnds, syllables, withSolfa, type SolfaOptions } from "./lyrics.ts";
import { defaultGrouping, parseGrouping, type Grouping } from "./rhythmTable.ts";
import { groupBeats, stickLines, stickSpace, withStickSpace } from "./stick.ts";
import { addSticksToStaff, toDom } from "./overlay.ts";

const LABELS: Record<LayerName, string> = { staff: "Staff", solfa: "Sol-fa", sticks: "Rhythm" };

export class AbcSolfaBlock extends MarkdownRenderChild {
	// Buttons pressed on this block; they win over the fence line and the settings.
	private clicked: Partial<Layers> = {};

	constructor(
		containerEl: HTMLElement,
		private source: string,
		private fence: FenceOptions,
		private getSettings: () => AbcSolfaSettings,
		private registry: Set<AbcSolfaBlock>,
	) {
		super(containerEl);
	}

	onload() {
		this.registry.add(this);
		this.render();
	}

	onunload() {
		this.registry.delete(this);
		this.containerEl.empty();
	}

	layers(): Layers {
		return { ...this.getSettings().layers, ...this.fence.layers, ...this.clicked };
	}

	// The fence line's group= if it fits the meter, otherwise the meter's default.
	private grouping(tune: Tune, body: HTMLElement): Grouping {
		const spec = this.fence.group;
		const g = spec ? parseGrouping(spec, tune.meter) : null;
		if (spec && !g) {
			const m = tune.meter ? `${tune.meter.num}/${tune.meter.den}` : "4/4";
			body.createDiv({ cls: "abc-solfa-note", text: `group=${spec} does not fill a bar of ${m}, so the usual grouping is used.` });
		}
		return g ?? defaultGrouping(tune.meter);
	}

	render() {
		const el = this.containerEl;
		const settings = this.getSettings();
		const layers = this.layers();
		el.empty();
		el.addClass("abc-solfa-block");

		const header = el.createDiv({ cls: "abc-solfa-header" });
		for (const name of LAYER_NAMES) {
			const btn = header.createEl("button", {
				text: LABELS[name],
				cls: "abc-solfa-toggle",
				attr: { "aria-pressed": String(layers[name]) },
			});
			if (layers[name]) btn.addClass("is-active");
			btn.addEventListener("click", () => {
				this.clicked[name] = !layers[name];
				this.render();
			});
		}

		const body = el.createDiv({ cls: "abc-solfa-body" });
		const solfaOpts: SolfaOptions = {
			tonicRule: settings.tonicRule,
			style: settings.syllableStyle,
			octaveMarks: settings.octaveMarks,
		};
		try {
			if (layers.staff) this.renderStaff(body, layers, solfaOpts);
			else this.renderWithoutStaff(body, layers, solfaOpts);
		} catch (e) {
			body.empty();
			body.createDiv({ cls: "abc-solfa-error", text: `Could not render this tune: ${e instanceof Error ? e.message : String(e)}` });
		}
	}

	private renderStaff(body: HTMLElement, layers: Layers, solfaOpts: SolfaOptions) {
		const tune = parseTune(this.source);
		let abc = this.source;
		if (tune && layers.solfa) abc = withSolfa(abc, tune, solfaOpts);
		const endings = !!tune?.barLines.some((b) => b.ending);
		if (tune && layers.sticks) {
			// Line positions have moved if sol-fa lines were added, so read them again.
			const notes = parseTune(abc)?.notes ?? [];
			abc = withStickSpace(abc, musicLineEnds(abc, notes), stickSpace(endings));
		}
		const target = body.createDiv({ cls: "abc-solfa-staff" });
		// A smaller lyric font stops syllables running together in busy bars of eighths.
		const [rendered] = abcjs.renderAbc(target, abc, {
			responsive: "resize",
			add_classes: true,
			format: { vocalfont: "sans-serif 10" },
		});
		const svg = target.querySelector("svg");
		if (tune && layers.sticks && rendered && svg) {
			const groups = groupBeats(tune.notes, this.grouping(tune, body), tune.barLines);
			addSticksToStaff(svg, rendered, tune.notes, groups, tune.barLines);
		}
		if (rendered?.warnings?.length) {
			const w = body.createEl("details", { cls: "abc-solfa-warnings" });
			w.createEl("summary", { text: `ABC warnings (${rendered.warnings.length})` });
			// abcjs warnings contain its own markup, so show them as plain text.
			for (const msg of rendered.warnings) w.createDiv({ text: msg.replace(/<[^>]*>/g, "") });
		}
	}

	// Sticks, sol-fa or both, laid out bar by bar with the tune's own line breaks.
	private renderWithoutStaff(body: HTMLElement, layers: Layers, solfaOpts: SolfaOptions) {
		if (!layers.solfa && !layers.sticks) {
			body.createDiv({ cls: "abc-solfa-note", text: "All layers are off. Turn one on to see the tune." });
			return;
		}
		const tune = parseTune(this.source);
		if (!tune || !tune.notes.length) {
			body.createDiv({ cls: "abc-solfa-note", text: "No notes found in this tune." });
			return;
		}
		const title = this.source.match(/^T:\s*(.+)$/m)?.[1]?.trim();
		if (title) body.createDiv({ cls: "abc-solfa-title", text: title });
		const grouping = layers.sticks ? this.grouping(tune, body) : defaultGrouping(tune.meter);
		const lines = stickLines(tune.notes, grouping, {
			sticks: layers.sticks,
			solfa: layers.solfa ? syllables(tune.notes, solfaOpts) : null,
			lines: musicLineEnds(this.source, tune.notes),
			bars: tune.barLines,
			barLines: musicLineEnds(this.source, tune.barLines),
		});
		const wrap = body.createDiv({ cls: "abc-solfa-sticks-only" });
		for (const line of lines) wrap.appendChild(toDom(line));
	}
}
