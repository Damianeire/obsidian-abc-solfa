# ABC Sol-fa

An Obsidian plugin that renders ABC tunes and adds Kodály teaching layers: sol-fa syllables under the notes, and (in a later version) stick rhythm notation.

It uses its own block name, `abc-solfa`, so it works alongside other ABC plugins that handle plain `abc` blocks.

## Usage

````
```abc-solfa
X: 1
T: The Man in the Bog
M: 6/8
L: 1/8
K: Gmaj
~G3 dBG|ABc AGE|EDB, DGA|BAG cBA|
```
````

Each block has buttons for Staff, Sol-fa and Rhythm. A button changes that block until the note is reloaded. To set a block permanently, add options to the fence line:

````
```abc-solfa solfa=off
````

Options are `staff`, `solfa` and `sticks` (or `rhythm`), each `on` or `off`. Anything not set on the fence uses the plugin settings.

## Sol-fa

Movable do. By default do is the major tonic of the key signature, as in Kodály teaching: minor tunes are la-based, Dorian tunes re-based and Mixolydian tunes so-based. In the settings you can put do on the tune's home note instead.

Accidentals use chromatic syllables: raised notes take di, ri, fi, si, li and lowered notes take ra, me, se, le, ta (lowered ti is ta, as in British Kodály practice). An accidental lasts to the end of the bar.

Syllables can be shown as words (do re mi) or letters (d r m). Octave marks show notes above the main octave as d' and below it as l,.

Notes:
- Only the first voice of a tune gets syllables.
- If a tune already has `w:` lyrics, they stay and the sol-fa appears as an extra verse below them.
- Tied notes take one syllable.

## Development

```bash
npm install
npm test
npm run build
node scripts/install-plugin.mjs "/path/to/vault"
```

## Licence

MIT. Includes [abcjs](https://github.com/paulrosen/abcjs) (MIT).
