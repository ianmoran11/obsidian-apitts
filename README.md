# APITTS

APITTS is an Obsidian plugin that generates embedded text-to-speech audio for notes using DeepInfra.

## Features

- Generate TTS for the active note, a folder, or multiple picked notes.
- Choose whole-note audio or section audio split by heading level.
- Save audio under a mirrored output folder, e.g. `Reading/Chapter 1.md` -> `_Audio/Reading/Chapter 1/001-whole-note.mp3`.
- Insert or update an embedded audio block in each note.
- Show progress and per-file logs while generation runs.

## Development

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/apitts/`, then enable the plugin.

## Settings

Set your DeepInfra API key in APITTS settings. The default model is `hexgrad/Kokoro-82M`, copied from the relevant Scholia TTS implementation.
