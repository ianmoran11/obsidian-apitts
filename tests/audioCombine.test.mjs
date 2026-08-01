import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const entryPoint = fileURLToPath(new URL("../src/audio/encode.ts", import.meta.url));
const result = await build({
  entryPoints: [entryPoint],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`;
const { WavChunkMp3Encoder } = await import(moduleUrl);

function makeMonoWav(sampleRate, seconds, frequency) {
  const sampleCount = Math.floor(sampleRate * seconds);
  const dataLength = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const writeTag = (offset, value) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeTag(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeTag(8, "WAVE");
  writeTag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeTag(36, "data");
  view.setUint32(40, dataLength, true);

  for (let i = 0; i < sampleCount; i++) {
    const sample = Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 8000);
    view.setInt16(44 + i * 2, sample, true);
  }
  return buffer;
}

function encode(wavs) {
  const encoder = new WavChunkMp3Encoder();
  for (const wav of wavs) encoder.appendWav(wav);
  return encoder.finish();
}

test("combines sequential WAV chunks into one larger MP3 stream", () => {
  const first = makeMonoWav(24_000, 1, 440);
  const second = makeMonoWav(24_000, 1, 660);
  const oneChunkBytes = encode([first]).byteLength;
  const combined = encode([first, second]);

  assert.ok(oneChunkBytes > 0);
  assert.ok(combined.byteLength > oneChunkBytes * 1.7);
});

test("rejects inconsistent WAV sample rates", () => {
  const encoder = new WavChunkMp3Encoder();
  encoder.appendWav(makeMonoWav(24_000, 0.1, 440));
  assert.throws(
    () => encoder.appendWav(makeMonoWav(22_050, 0.1, 440)),
    /inconsistent WAV sample rates/,
  );
});
