import { Notice, Plugin, type MarkdownPostProcessorContext } from "obsidian";
import { AbcSolfaSettingTab, DEFAULT_SETTINGS, type AbcSolfaSettings } from "./settings.ts";
import { AbcSolfaBlock } from "./render.ts";
import { parseFenceOptions, type FenceOptions } from "./layers.ts";

export default class AbcSolfaPlugin extends Plugin {
	settings: AbcSolfaSettings = DEFAULT_SETTINGS;
	private blocks = new Set<AbcSolfaBlock>();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new AbcSolfaSettingTab(this.app, this));
		const processor = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			ctx.addChild(new AbcSolfaBlock(el, source, this.fenceOptions(el, ctx), () => this.settings, this.blocks, (size) => {
				this.settings.size = size;
				void this.saveSettings();
			}));
		};
		this.registerMarkdownCodeBlockProcessor("abc-solfa", processor);
		if (this.settings.handleAbcBlocks) {
			// Another ABC plugin may already show these blocks; only one plugin can.
			try {
				this.registerMarkdownCodeBlockProcessor("abc", processor);
				this.registerMarkdownCodeBlockProcessor("music-abc", processor);
			} catch {
				new Notice("ABC Sol-fa: another plugin already shows abc blocks. Turn it off to show them here, or turn off \"Show abc blocks\" in the ABC Sol-fa settings.");
			}
		}
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
