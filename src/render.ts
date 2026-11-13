// One abc-solfa code block: a header of layer toggles and the rendered tune.

import { MarkdownRenderChild } from "obsidian";
import abcjs from "abcjs";
import { PAPERS, type AbcSolfaSettings } from "./settings.ts";
import { stepSize } from "./size.ts";
import { LAYER_NAMES, type FenceOptions, type LayerName, type Layers } from "./layers.ts";
import { parseTune, type Tune } from "./parse.ts";
import { musicLineEnds, syllables, withSolfa, type SolfaOptions } from "./lyrics.ts";
import { defaultGrouping, parseGrouping, type Grouping } from "./rhythmTable.ts";
import { groupBeats, stickLines, stickSpace, withStickSpace } from "./stick.ts";
import { addSticksToStaff, staffNoteElements, toDom } from "./overlay.ts";
import { SPEEDS, TunePlayer, type PlayState } from "./playback.ts";

const LABELS: Record<LayerName, string> = { staff: "Staff", solfa: "Sol-fa", sticks: "Rhythm" };
const PLAY_LABELS: Record<PlayState, string> = { stopped: "\u25B6 Play", loading: "Loading\u2026", playing: "\u25A0 Stop" };

export class AbcSolfaBlock extends MarkdownRenderChild {
	// Buttons pressed on this block; they win over the fence line and the settings.
	private clicked: Partial<Layers> = {};
	// Kept across redraws, so toggling a layer does not stop the tune.
	private player = new TunePlayer((state, error) => this.showPlayState(state, error));
	private playBtn: HTMLButtonElement | null = null;
	private playError: HTMLElement | null = null;
	private speed = 1; // this block's playing speed, until the note is reloaded
	// What is drawn for each note, and which note starts at each position in the source,
	// so the notes can be lit up as they play.
	private noteEls: Element[][] = [];
	private noteAt = new Map<number, number>();
	private sounding: number[] | null = null;

	constructor(
		containerEl: HTMLElement,
		private source: string,
		private fence: FenceOptions,
		private getSettings: () => AbcSolfaSettings,
		private registry: Set<AbcSolfaBlock>,
		private setSize: (size: number) => void, // saves the size and redraws every block
	) {
		super(containerEl);
	}

	onload() {
		this.registry.add(this);
		this.render();
	}

	onunload() {
		this.player.stop();
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
		const paper = PAPERS.includes(settings.paper) ? settings.paper : "cream";
		el.toggleClass("abc-solfa-paper", paper !== "theme");
		el.toggleClass("abc-solfa-paper-cream", paper === "cream");
		el.toggleClass("abc-solfa-paper-white", paper === "white");

		const header = el.createDiv({ cls: "abc-solfa-header" });
		this.playBtn = header.createEl("button", { cls: "abc-solfa-toggle abc-solfa-play" });
		this.playBtn.addEventListener("click", () => {
			if (this.player.state === "stopped") this.play();
			else this.player.stop();
		});
		const speed = header.createEl("select", {
			cls: "dropdown abc-solfa-speed",
			attr: { "aria-label": "Playing speed", title: "Playing speed" },
		});
		for (const v of SPEEDS) speed.createEl("option", { text: `${Math.round(v * 100)}%`, value: String(v) });
		speed.value = String(this.speed);
		speed.addEventListener("change", () => {
			this.speed = Number(speed.value);
			// Start again at the new speed rather than wait for the next Play.
			if (this.player.state !== "stopped") this.play();
		});
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
		// Size of the sol-fa and sticks, for every block.
		for (const [label, step, name] of [["\u2212", -1, "Smaller"], ["+", 1, "Larger"]] as const) {
			const next = stepSize(settings.size, step);
			const btn = header.createEl("button", {
				text: label,
				cls: "abc-solfa-toggle abc-solfa-size",
				attr: { "aria-label": `${name} sol-fa and rhythm`, title: `${name} sol-fa and rhythm` },
			});
			if (next === settings.size) btn.disabled = true;
			else btn.addEventListener("click", () => this.setSize(next));
		}

		this.playError = el.createDiv({ cls: "abc-solfa-error" });
		this.showPlayState(this.player.state);

		const body = el.createDiv({ cls: "abc-solfa-body" });
		const solfaOpts: SolfaOptions = {
			tonicRule: settings.tonicRule,
			style: settings.syllableStyle,
			octaveMarks: settings.octaveMarks,
		};
		this.noteEls = [];
		this.noteAt.clear();
		try {
			const tune = parseTune(this.source);
			tune?.notes.forEach((n, i) => this.noteAt.set(n.startChar, i));
			const staffEls = layers.staff ? this.renderStaff(body, tune, layers, solfaOpts) : [];
			if (!layers.staff) this.renderWithoutStaff(body, tune, layers, solfaOpts);
			this.noteEls = staffEls.map((els) => [...els]);
			for (const e of Array.from(body.querySelectorAll("[data-note]"))) {
				const i = Number(e.getAttribute("data-note"));
				(this.noteEls[i] ??= []).push(e);
			}
			this.showNotes(this.sounding);
		} catch (e) {
			body.empty();
			body.createDiv({ cls: "abc-solfa-error", text: `Could not render this tune: ${e instanceof Error ? e.message : String(e)}` });
		}
	}

	private play() {
		const settings = this.getSettings();
		void this.player.play(this.source, {
			instrument: settings.instrument,
			speed: this.speed,
			tempo: this.fence.tempo,
			onNote: (chars) => this.showNotes(chars),
		});
	}

	// Lights up the notes that are sounding: on the staff, its sol-fa and the sticks.
	private showNotes(chars: number[] | null) {
		this.sounding = chars;
		for (const e of Array.from(this.containerEl.querySelectorAll(".abc-solfa-playing"))) e.removeClass("abc-solfa-playing");
		for (const c of chars ?? []) {
			const i = this.noteAt.get(c);
			if (i === undefined) continue; // another voice, which has no layers
			for (const e of this.noteEls[i] ?? []) e.addClass("abc-solfa-playing");
		}
	}

	// Returns what abcjs drew for each note.
	private renderStaff(body: HTMLElement, tune: Tune | null, layers: Layers, solfaOpts: SolfaOptions): SVGElement[][] {
		const settings = this.getSettings();
		let abc = this.source;
		if (tune && layers.solfa) abc = withSolfa(abc, tune, solfaOpts);
		const endings = !!tune?.barLines.some((b) => b.ending);
		if (tune && layers.sticks) {
			// Line positions have moved if sol-fa lines were added, so read them again.
			const notes = parseTune(abc)?.notes ?? [];
			abc = withStickSpace(abc, musicLineEnds(abc, notes), stickSpace(endings, settings.rhythmSyllables, settings.size));
		}
		const target = body.createDiv({ cls: "abc-solfa-staff" });
		// A smaller lyric font stops syllables running together in busy bars of eighths.
		const [rendered] = abcjs.renderAbc(target, abc, {
			responsive: "resize",
			add_classes: true,
			format: { vocalfont: `sans-serif ${Math.round(10 * settings.size * 10) / 10}` },
		});
		const svg = target.querySelector("svg");
		if (tune && layers.sticks && rendered && svg) {
			const groups = groupBeats(tune.notes, this.grouping(tune, body), tune.barLines);
			if (!addSticksToStaff(svg, rendered, tune.notes, groups, tune.barLines, { syllables: settings.rhythmSyllables, scale: settings.size })) {
				body.createDiv({ cls: "abc-solfa-note", text: "The rhythm sticks could not be lined up with this staff. Turn the staff off to see them on their own." });
			}
		}
		if (rendered?.warnings?.length) {
			const w = body.createEl("details", { cls: "abc-solfa-warnings" });
			w.createEl("summary", { text: `ABC warnings (${rendered.warnings.length})` });
			// abcjs warnings contain its own markup, so show them as plain text.
			for (const msg of rendered.warnings) w.createDiv({ text: msg.replace(/<[^>]*>/g, "") });
		}
		return tune && rendered ? staffNoteElements(rendered, tune.notes.length) : [];
	}

	private showPlayState(state: PlayState, error?: string) {
		if (this.playBtn) {
			this.playBtn.setText(PLAY_LABELS[state]);
			this.playBtn.toggleClass("is-active", state !== "stopped");
			this.playBtn.setAttr("aria-pressed", String(state !== "stopped"));
		}
		if (this.playError) {
			this.playError.setText(error ?? "");
			this.playError.toggle(!!error);
		}
	}

	// Sticks, sol-fa or both, laid out bar by bar with the tune's own line breaks.
	private renderWithoutStaff(body: HTMLElement, tune: Tune | null, layers: Layers, solfaOpts: SolfaOptions) {
		if (!layers.solfa && !layers.sticks) {
			body.createDiv({ cls: "abc-solfa-note", text: "All layers are off. Turn one on to see the tune." });
			return;
		}
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
			rhythmSyllables: this.getSettings().rhythmSyllables,
			scale: this.getSettings().size,
			solfaScale: this.getSettings().solfaSize,
		});
		const wrap = body.createDiv({ cls: "abc-solfa-sticks-only" });
		for (const line of lines) wrap.appendChild(toDom(line));
	}
}
