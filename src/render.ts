// One abc-solfa code block: a header of layer toggles and the rendered tune.

import { MarkdownRenderChild } from "obsidian";
import abcjs from "abcjs";
import type { AbcSolfaSettings } from "./settings.ts";
import { LAYER_NAMES, type LayerName, type Layers } from "./layers.ts";
import { parseTune } from "./parse.ts";
import { withSolfa } from "./lyrics.ts";

const LABELS: Record<LayerName, string> = { staff: "Staff", solfa: "Sol-fa", sticks: "Rhythm" };

export class AbcSolfaBlock extends MarkdownRenderChild {
	// Buttons pressed on this block; they win over the fence line and the settings.
	private clicked: Partial<Layers> = {};

	constructor(
		containerEl: HTMLElement,
		private source: string,
		private fence: Partial<Layers>,
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
		return { ...this.getSettings().layers, ...this.fence, ...this.clicked };
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
			if (name === "sticks") {
				btn.disabled = true;
				btn.setAttr("title", "Rhythm sticks are not available yet");
				continue;
			}
			btn.addEventListener("click", () => {
				this.clicked[name] = !layers[name];
				this.render();
			});
		}

		const body = el.createDiv({ cls: "abc-solfa-body" });
		if (!layers.staff) {
			body.createDiv({
				cls: "abc-solfa-note",
				text: "Views without the staff are not available yet. Turn the staff back on to see the tune.",
			});
			return;
		}

		let abc = this.source;
		try {
			if (layers.solfa) {
				const tune = parseTune(abc);
				if (tune) {
					abc = withSolfa(abc, tune, {
						tonicRule: settings.tonicRule,
						style: settings.syllableStyle,
						octaveMarks: settings.octaveMarks,
					});
				}
			}
			const target = body.createDiv({ cls: "abc-solfa-staff" });
			// A smaller lyric font stops syllables running together in busy bars of eighths.
			const [tune] = abcjs.renderAbc(target, abc, {
				responsive: "resize",
				add_classes: true,
				format: { vocalfont: "sans-serif 10" },
			});
			if (tune?.warnings?.length) {
				const w = body.createEl("details", { cls: "abc-solfa-warnings" });
				w.createEl("summary", { text: `ABC warnings (${tune.warnings.length})` });
				// abcjs warnings contain its own markup, so show them as plain text.
				for (const msg of tune.warnings) w.createDiv({ text: msg.replace(/<[^>]*>/g, "") });
			}
		} catch (e) {
			body.empty();
			body.createDiv({ cls: "abc-solfa-error", text: `Could not render this tune: ${e instanceof Error ? e.message : String(e)}` });
		}
	}
}
