/** Known DeepInfra text-to-speech models exposed by the plugin. */

export type TtsModelKind = "preset" | "voiceDesign";

export interface TtsModelOption {
  /** DeepInfra model slug used in the inference URL. */
  slug: string;
  /** Human-readable label shown in dropdowns. */
  label: string;
  /** How the model selects a voice. */
  kind: TtsModelKind;
}

/**
 * Models available in the TTS model dropdown. Add new DeepInfra TTS models here.
 * - `preset` models take a short voice id (e.g. Kokoro voices).
 * - `voiceDesign` models take a natural-language voice description.
 */
export const TTS_MODELS: TtsModelOption[] = [
  {
    slug: "hexgrad/Kokoro-82M",
    label: "Kokoro-82M (preset voices)",
    kind: "preset",
  },
  {
    slug: "Qwen/Qwen3-TTS-VoiceDesign",
    label: "Qwen3-TTS-VoiceDesign (described voices)",
    kind: "voiceDesign",
  },
];

/**
 * Default natural-language voice description for voice-design models.
 * Qwen3-TTS-VoiceDesign is trained on natural-language descriptions, not
 * tag/`key:value` syntax, so the default reads as a sentence.
 */
export const DEFAULT_VOICE_DESCRIPTION =
  "A bright, engaging American male storyteller voice";

export function findTtsModel(slug: string): TtsModelOption | undefined {
  const normalized = slug.trim().toLowerCase();
  return TTS_MODELS.find((model) => model.slug.toLowerCase() === normalized);
}

/** True when the model slug selects a voice-design model (description-driven). */
export function isVoiceDesignModel(slug: string): boolean {
  const known = findTtsModel(slug);
  if (known) return known.kind === "voiceDesign";
  // Fall back to a name-based heuristic so custom voice-design slugs work too.
  return slug.toLowerCase().includes("voicedesign");
}
