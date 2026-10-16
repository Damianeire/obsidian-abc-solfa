import { Plugin, type MarkdownPostProcessorContext } from "obsidian";
import { AbcSolfaSettingTab, DEFAULT_SETTINGS, type AbcSolfaSettings } from "./settings.ts";
import { AbcSolfaBlock } from "./render.ts";
import { parseFenceOptions, type FenceOptions } from "./layers.ts";

export default class AbcSolfaPlugin extends Plugin {
	settings: AbcSolfaSettings = DEFAULT_SETTINGS;
	private blocks = new Set<AbcSolfaBlock>();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new AbcSolfaSettingTab(this.app, this));
		this.registerMarkdownCodeBlockProcessor("abc-solfa", (source, el, ctx) => {
			ctx.addChild(new AbcSolfaBlock(el, source, this.fenceOptions(el, ctx), () => this.settings, this.blocks, (size) => {
				this.settings.size = size;
				void this.saveSettings();
			}));
		});
	}

	onunload() {
		this.blocks.clear();
	}

	// Obsidian passes only the block body, so read the fence line from the note text.
	private fenceOptions(el: HTMLElement, ctx: MarkdownPostProcessorContext): FenceOptions {
		const info = ctx.getSectionInfo(el);
		if (!info) return { layers: {}, group: null };
		const line = info.text.split("\n")[info.lineStart] ?? "";
		return parseFenceOptions(line);
	}

	async loadSettings() {
		const saved = (await this.loadData()) ?? {};
		this.settings = {
			...DEFAULT_SETTINGS,
			...saved,
			layers: { ...DEFAULT_SETTINGS.layers, ...saved.layers },
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
		for (const b of this.blocks) b.render();
	}
}
