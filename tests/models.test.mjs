import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const entryPoint = fileURLToPath(new URL("../src/tts/models.ts", import.meta.url));
const result = await build({
  entryPoints: [entryPoint],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`;
const {
  getEffectiveTtsCharacterLimit,
  getTtsModelMaxInputCharacters,
} = await import(moduleUrl);

test("caps Kokoro requests at DeepInfra's 10,000-character limit", () => {
  assert.equal(getTtsModelMaxInputCharacters("hexgrad/Kokoro-82M"), 10_000);
});

test("applies the Kokoro cap to a larger configured chunk limit", () => {
  assert.equal(
    getEffectiveTtsCharacterLimit("hexgrad/Kokoro-82M", 12_000),
    10_000,
  );
});

test("preserves a configured limit that is already below the model cap", () => {
  assert.equal(
    getEffectiveTtsCharacterLimit("hexgrad/Kokoro-82M", 8_000),
    8_000,
  );
});

test("leaves custom models uncapped when no limit is known", () => {
  assert.equal(getTtsModelMaxInputCharacters("custom/tts-model"), undefined);
  assert.equal(getEffectiveTtsCharacterLimit("custom/tts-model", 12_000), 12_000);
});
