# APITTS

APITTS is an Obsidian plugin that generates embedded text-to-speech audio for notes using DeepInfra.

## Features

- Generate TTS for the active note, a folder, or multiple picked notes.
- Choose whole-note audio or section audio split by heading level.
- Save audio under a mirrored output folder, e.g. `Reading/Chapter 1.md` -> `_Audio/Reading/Chapter 1/001-whole-note.mp3`.
- Insert or update an embedded audio block in each note.
- Show progress and per-file logs while generation runs.
- Export a grouped [Base](https://help.obsidian.md/bases) into per-group folders, copying each file under a chosen filename — handy for turning lesson audio into audiobook folders.

## Export a Base to audiobook folders

Some audiobook players treat a folder as a single book, so its tracks must live together with chapter-ordered names. APITTS can build those folders from a Base, reusing the Base's own filters, grouping, and formulas (requires Obsidian 1.10+).

1. Open a `.base`, add a view, and choose the **Audiobook export** view type.
2. Group the view by the property whose value should become the folder name (e.g. a course name).
3. Open the view options and set:
   - **Filename property** — the property used as the new file name (default `formula.new-mp3-name`). If it omits the extension, the source file's extension is kept.
   - **Output folder** — destination root (default `Audiobooks`). Files are written to `Output folder / Group / Filename`.
   - **Copy or move** — copy (default) leaves the source files in place; move sends them to the trash after copying.
   - **If a file exists** — `Overwrite` (default), `Skip`, or `Keep both` (numbered suffix).
4. Click **Copy to audiobook folders**. The view shows progress and a per-file log.

A command, **Export audiobook from active base**, runs the same export while an Audiobook export view is active.

## Installation with BRAT

APITTS can be installed for beta testing with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable the BRAT plugin in Obsidian.
2. Open BRAT settings and choose **Add Beta plugin**.
3. Enter this repository URL: `https://github.com/ianmoran11/obsidian-apitts`.
4. Enable **APITTS** under **Settings → Community plugins**.

## Development

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/apitts/`, then enable the plugin.

## Release / BRAT requirements

BRAT expects this repository to have a root `manifest.json` and a GitHub release whose tag exactly matches `manifest.json`'s `version` value, for example `0.1.0`.

Each release must include these assets:

- `main.js`
- `manifest.json`
- `styles.css`

Release checklist:

1. Update `version` in `manifest.json` and `package.json`.
2. Add the same version to `versions.json`, mapped to the minimum supported Obsidian version.
3. Run `npm run build`.
4. Create and push a tag that exactly matches the plugin version, without a `v` prefix:
   ```bash
   git tag 0.1.0
   git push origin 0.1.0
   ```
5. The GitHub Actions release workflow builds the plugin and uploads the BRAT assets.

## Settings

Set your DeepInfra API key in APITTS settings. The default model is `hexgrad/Kokoro-82M`, copied from the relevant Scholia TTS implementation.
