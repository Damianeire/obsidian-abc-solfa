import { App, PluginSettingTab, Setting } from "obsidian";
import type AbcSolfaPlugin from "./main.ts";
import type { Layers } from "./layers.ts";
import type { SyllableStyle, TonicRule } from "./solfa.ts";

export interface AbcSolfaSettings {
	layers: Layers;
	tonicRule: TonicRule;
	syllableStyle: SyllableStyle;
	octaveMarks: boolean;
	rhythmSyllables: boolean;
}

export const DEFAULT_SETTINGS: AbcSolfaSettings = {
	layers: { staff: true, solfa: true, sticks: true },
	tonicRule: "key-signature",
	syllableStyle: "full",
	octaveMarks: true,
	rhythmSyllables: true,
};

export class AbcSolfaSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: AbcSolfaPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		containerEl.empty();

		containerEl.createEl("p", {
			text: "These are the defaults for every abc-solfa block. A block can override them on its fence line, for example: ```abc-solfa solfa=off",
			cls: "setting-item-description",
		});

		new Setting(containerEl).setHeading().setName("Layers shown by default");
		new Setting(containerEl)
			.setName("Staff")
			.setDesc("The notated music.")
			.addToggle((t) => t.setValue(s.layers.staff).onChange((v) => this.save(() => (s.layers.staff = v))));
		new Setting(containerEl)
			.setName("Sol-fa")
			.setDesc("Syllables under each note.")
			.addToggle((t) => t.setValue(s.layers.solfa).onChange((v) => this.save(() => (s.layers.solfa = v))));
		new Setting(containerEl)
			.setName("Rhythm sticks")
			.setDesc("Kodály stick notation with rhythm syllables, above the staff or on its own.")
			.addToggle((t) => t.setValue(s.layers.sticks).onChange((v) => this.save(() => (s.layers.sticks = v))));

		new Setting(containerEl).setHeading().setName("Rhythm");
		new Setting(containerEl)
			.setName("Rhythm syllables")
			.setDesc("Show ta, ti-ti and the other rhythm syllables under the sticks. Turn this off to show the sticks alone.")
			.addToggle((t) => t.setValue(s.rhythmSyllables).onChange((v) => this.save(() => (s.rhythmSyllables = v))));

		new Setting(containerEl).setHeading().setName("Sol-fa");
		new Setting(containerEl)
			.setName("Where do sits")
			.setDesc("Key signature: do is the major tonic of the key signature, so minor tunes are la-based, Dorian tunes re-based and Mixolydian tunes so-based (Kodály practice). Home note: do is always the tune's home note, with altered syllables such as me and ta.")
			.addDropdown((d) =>
				d
					.addOption("key-signature", "Key signature")
					.addOption("mode-final", "Home note")
					.setValue(s.tonicRule)
					.onChange((v) => this.save(() => (s.tonicRule = v as TonicRule))),
			);
		new Setting(containerEl)
			.setName("Syllable style")
			.setDesc("Full words (do re mi) or letters (d r m).")
			.addDropdown((d) =>
				d
					.addOption("full", "Full words")
					.addOption("letters", "Letters")
					.setValue(s.syllableStyle)
					.onChange((v) => this.save(() => (s.syllableStyle = v as SyllableStyle))),
			);
		new Setting(containerEl)
			.setName("Octave marks")
			.setDesc("Mark notes above the main octave with ' and below it with , (for example d' and l,).")
			.addToggle((t) => t.setValue(s.octaveMarks).onChange((v) => this.save(() => (s.octaveMarks = v))));
	}

	private async save(change: () => void) {
		change();
		await this.plugin.saveSettings();
	}
}
