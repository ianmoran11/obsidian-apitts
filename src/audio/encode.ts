import { Mp3Encoder } from "@breezystack/lamejs";

/**
 * Decode a 16-bit PCM WAV ArrayBuffer into its mono samples and sample rate.
 * Returns null if the buffer is not a supported WAV file.
 */
export function decodeWavPcm(buffer: ArrayBuffer): {
  sampleRate: number;
  /** Mono Int16 PCM samples (channels are averaged when stereo). */
  samples: Int16Array;
} | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 44) return null;
  const view = new DataView(buffer);

  const riff = readTag(view, 0);
  const wave = readTag(view, 8);
  if (riff !== "RIFF" || wave !== "WAVE") return null;

  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  if (bitsPerSample !== 16) return null;

  // Walk the chunks to find "data".
  let offset = 36;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= bytes.length) {
    const id = readTag(view, offset);
    const size = view.getUint32(offset + 4, true);
    if (id === "data") {
      dataOffset = offset + 8;
      dataLength = size;
      break;
    }
    offset += 8 + size + (size % 2); // chunks are word-aligned
  }
  if (dataOffset < 0) return null;

  const bytesPerFrame = numChannels * (bitsPerSample / 8);
  const frameCount = Math.floor(Math.min(dataLength, bytes.length - dataOffset) / bytesPerFrame);
  const samples = new Int16Array(frameCount);

  for (let i = 0; i < frameCount; i++) {
    const base = dataOffset + i * bytesPerFrame;
    if (numChannels === 1) {
      samples[i] = view.getInt16(base, true);
    } else {
      // Average all channels into mono.
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += view.getInt16(base + ch * 2, true);
      }
      samples[i] = Math.round(sum / numChannels);
    }
  }

  return { sampleRate, samples };
}

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * Encode 16-bit PCM mono samples into an MP3 ArrayBuffer at the given bitrate.
 */
export function encodeMp3(
  sampleRate: number,
  samples: Int16Array,
  bitrateKbps = 96,
): ArrayBuffer {
  const encoder = new Mp3Encoder(1, sampleRate, bitrateKbps);
  const chunks: Uint8Array[] = [];
  const blockSize = 1152;

  for (let i = 0; i < samples.length; i += blockSize) {
    const block = samples.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(block);
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
  }

  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail));

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    merged.set(chunk, cursor);
    cursor += chunk.length;
  }

  return merged.buffer;
}

/**
 * Transcode a WAV ArrayBuffer to MP3. Returns null if the input is not a
 * decodable 16-bit PCM WAV (so callers can fall back to the original bytes).
 */
export function wavToMp3(wav: ArrayBuffer, bitrateKbps = 96): ArrayBuffer | null {
  const decoded = decodeWavPcm(wav);
  if (!decoded) return null;
  return encodeMp3(decoded.sampleRate, decoded.samples, bitrateKbps);
}
