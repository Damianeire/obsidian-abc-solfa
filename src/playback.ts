// Playing a tune with abcjs's synth. It plays recorded instrument samples, fetched
// note by note the first time they are needed; there is no beep fallback, so if the
// samples cannot be loaded the tune does not play.

import abcjs from "abcjs";

// The MusyngKite samples are fuller and less brittle than abcjs's default set.
const SOUND_FONT = "https://paulrosen.github.io/midi-js-soundfonts/MusyngKite/";

// Gentle General MIDI instruments only.
export type Instrument = "piano" | "harp" | "guitar" | "flute";
export const INSTRUMENTS: Record<Instrument, { label: string; program: number }> = {
	piano: { label: "Piano", program: 0 },
	harp: { label: "Harp", program: 46 },
	guitar: { label: "Nylon guitar", program: 24 },
	flute: { label: "Flute", program: 73 },
};

// The speeds a block can play at, as a share of the tune's tempo.
export const SPEEDS = [0.5, 0.75, 1, 1.25];

// Tempo for a tune with no Q: line, in beats a minute: quarters, or dotted quarters in
// compound meters. abcjs would play 180 and 120, which is too fast to learn from.
const DEFAULT_TEMPO = { simple: 100, compound: 72 };

// How long the last note may ring once the tune is over.
const END_RING_MS = 1500;

export type PlayState = "stopped" | "loading" | "playing";

export interface PlayOptions {
	instrument: Instrument;
	speed: number; // 1 for the tune's own tempo
	tempo: number | null; // beats a minute from the fence line, in place of Q:
	onNote: (startChars: number[] | null) => void; // the notes sounding now, by position in the source
}

// One player per block. Starting one stops whichever other block was playing.
const playing = new Set<TunePlayer>();
let audioContext: AudioContext | null = null;

// Stops every tune and lets the audio device go, when the plugin is turned off.
export function closeAudio(): void {
	for (const p of [...playing]) p.stop();
	void audioContext?.close();
	audioContext = null;
}

// The beat a teacher counts, and so what tempo= means: a dotted quarter in 3/8, 6/8,
// 9/8 and 12/8, otherwise a quarter.
function countedBeat(meter: { num: number; den?: number } | undefined): number {
	return meter && meter.den === 8 && meter.num % 3 === 0 ? 3 / 8 : 1 / 4;
}

// The tempo in abcjs's own beats a minute, which for some meters (2/2, 7/8) are not
// the beats a teacher counts.
function abcjsBpm(visualObj: abcjs.TuneObject, opts: PlayOptions): number {
	const meter = visualObj.getMeterFraction();
	const hasQ = !!(visualObj.metaText as { tempo?: unknown } | undefined)?.tempo;
	let bpm: number;
	if (opts.tempo || !hasQ) {
		const counted = countedBeat(meter);
		const perMinute = opts.tempo ?? (counted === 1 / 4 ? DEFAULT_TEMPO.simple : DEFAULT_TEMPO.compound);
		bpm = (perMinute * counted) / visualObj.getBeatLength();
	} else {
		bpm = visualObj.getBpm();
	}
	// TimingCallbacks reads a whole number, so the synth is given the same one.
	return Math.max(1, Math.round(bpm * opts.speed));
}

export class TunePlayer {
	state: PlayState = "stopped";
	private synth: abcjs.MidiBuffer | null = null;
	private timer: abcjs.TimingCallbacks | null = null;
	private onNote: PlayOptions["onNote"] | null = null;
	private run = 0; // bumped on stop, so a slow load that finishes late does not start

	constructor(private onChange: (state: PlayState, error?: string) => void) {}

	async play(source: string, opts: PlayOptions) {
		for (const other of playing) if (other !== this) other.stop();
		this.stop();
		playing.add(this);
		const run = ++this.run;
		this.set("loading");
		try {
			if (!abcjs.synth.supportsAudio()) throw new Error("This device cannot play audio.");
			// Created on the first click, as browsers only allow audio after one.
			audioContext ??= new AudioContext();
			await audioContext.resume();
			// "*" lays the tune out in a hidden element, which the synth and the note
			// timings need. Its positions are those of the source as written.
			const [visualObj] = abcjs.renderAbc("*", source);
			if (!visualObj) throw new Error("No tune found.");
			const bpm = abcjsBpm(visualObj, opts);
			const synth = new abcjs.synth.CreateSynth();
			const loaded = await synth.init({
				audioContext,
				visualObj,
				millisecondsPerMeasure: visualObj.millisecondsPerMeasure(bpm),
				options: {
					soundFontUrl: SOUND_FONT,
					program: INSTRUMENTS[opts.instrument]?.program ?? 0,
					chordsOff: true, // guitar chords in the tune would be played as a vamp
				},
				onEnded: () => {
					if (this.run === run) this.reset();
				},
			});
			// Notes that fail to load are left silent, so give up if any did.
			if (loaded.error.length) throw new Error(LOAD_FAILED);
			await synth.prime();
			if (this.run !== run) return;
			const timer = new abcjs.TimingCallbacks(visualObj, {
				qpm: bpm,
				eventCallback: (ev) => {
					if (this.run !== run) return undefined;
					if (ev && ev.type !== "end") {
						this.onNote?.(ev.startCharArray ?? (ev.startChar != null ? [ev.startChar] : []));
						return undefined;
					}
					// The tune is over. abcjs's onEnded does not always arrive, so finish
					// here, after a moment for the last note to ring.
					this.onNote?.(null);
					window.setTimeout(() => {
						if (this.run === run) this.stop();
					}, END_RING_MS);
					return undefined;
				},
			});
			this.synth = synth;
			this.timer = timer;
			this.onNote = opts.onNote;
			synth.start();
			timer.start();
			this.set("playing");
		} catch (e) {
			if (this.run !== run) return;
			this.reset();
			this.onChange("stopped", errorText(e));
		}
	}

	stop() {
		this.run++;
		this.synth?.stop();
		this.reset();
	}

	private reset() {
		this.timer?.stop();
		this.timer = null;
		this.synth = null;
		this.onNote?.(null);
		this.onNote = null;
		playing.delete(this);
		this.set("stopped");
	}

	private set(state: PlayState) {
		if (state === this.state && state === "stopped") return;
		this.state = state;
		this.onChange(state);
	}
}

const LOAD_FAILED = "The instrument sounds could not be loaded. Check the internet connection.";

// abcjs sometimes rejects with a plain object rather than an Error.
function errorText(e: unknown): string {
	return e instanceof Error ? e.message : LOAD_FAILED;
}
