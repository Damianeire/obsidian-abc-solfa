// The parts of abcjs's parse and layout output that parse.ts and overlay.ts read.
// abcjs types these loosely, so they are spelled out here and cast once where the
// data comes in; everything after that is type-checked.

export interface AbcKey {
	root?: string;
	acc?: "" | "#" | "b";
	mode?: string;
	accidentals?: { note: string; acc: string }[];
}

export interface AbcMeter {
	type: string;
	value?: { num: string; den: string }[];
}

export interface AbcPitch {
	pitch: number;
	accidental?: string;
	startTie?: object;
	endTie?: boolean;
}

// A note, rest, bar line or key change in a voice. Which fields are set depends on el_type.
export interface AbcElement extends AbcKey {
	el_type: string;
	startChar: number;
	endChar: number;
	duration: number;
	type?: string; // bar lines: bar_thin, bar_right_repeat, ...
	startEnding?: string;
	endEnding?: boolean;
	pitches?: AbcPitch[];
	rest?: { type: string };
	startTriplet?: number;
	tripletMultiplier?: number;
	endTriplet?: boolean;
	abselem?: AbcLayout; // after rendering
}

// Where abcjs put an element, after rendering.
export interface AbcLayout {
	x: number;
	w: number;
	heads?: { x: number; w: number }[];
}

export interface AbcLine {
	staff?: { key?: AbcKey; voices?: AbcElement[][] }[];
	staffGroup?: { startx?: number; w?: number; staffs?: { absoluteY: number; top: number }[] };
}

export interface AbcTune {
	lines: AbcLine[];
	warnings?: string[];
	getKeySignature(): AbcKey;
	getMeter(): AbcMeter | undefined;
}
