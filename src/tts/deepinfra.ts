import { isVoiceDesignModel } from "./models";
import { wavToMp3 } from "../audio/encode";

export interface DeepInfraTtsRequest {
  text: string;
  model: string;
  /** Preset voice id (Kokoro-style models). */
  voice?: string;
  /** Natural-language voice description (Qwen3-TTS-VoiceDesign-style models). */
  voiceDescription?: string;
  outputFormat?: "mp3" | "wav";
}

export interface DeepInfraTtsResult {
  audio: ArrayBuffer;
  extension: "mp3" | "wav";
}

export class DeepInfraTtsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DeepInfraTtsError";
  }
}

export class DeepInfraTtsClient {
  constructor(private readonly apiKey: string) {}

  async generateSpeech(
    request: DeepInfraTtsRequest,
    signal?: AbortSignal,
  ): Promise<DeepInfraTtsResult> {
    const model = encodeURIComponent(request.model).replace(/%2F/g, "/");
    const voiceDesign = isVoiceDesignModel(request.model);
    const outputFormat = request.outputFormat ?? "mp3";
    const body: Record<string, string> = {
      output_format: outputFormat,
    };

    if (voiceDesign) {
      // Qwen3-TTS-VoiceDesign uses `input` for the text and `voice` for a
      // natural-language description of the desired voice.
      body.input = request.text;
      const description = request.voiceDescription?.trim();
      if (description) body.voice = description;
    } else {
      body.text = request.text;
      if (request.voice?.trim()) body.voice = request.voice.trim();
    }

    // DeepInfra's inference endpoints read `output_format` as a query parameter
    // (default wav); sending it only in the body yields wav audio.
    const params = new URLSearchParams({ output_format: outputFormat });
    const response = await fetch(
      `https://api.deepinfra.com/v1/inference/${model}?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      },
    );

    if (!response.ok) {
      throw new DeepInfraTtsError(
        await this.readErrorMessage(response),
        response.status,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    const result = contentType.includes("application/json")
      ? this.readJsonAudio(await response.json())
      : {
          audio: await response.arrayBuffer(),
          extension: this.detectExtension(contentType),
        };

    return this.normalizeFormat(result, outputFormat);
  }

  /**
   * Ensure the audio matches the requested format. Some DeepInfra models
   * (notably Qwen3-TTS-VoiceDesign) ignore `output_format` and always return
   * WAV, so when MP3 was requested we transcode WAV -> MP3 client-side.
   */
  private normalizeFormat(
    result: DeepInfraTtsResult,
    requestedFormat: "mp3" | "wav",
  ): DeepInfraTtsResult {
    if (requestedFormat === "mp3" && result.extension === "wav") {
      const mp3 = wavToMp3(result.audio);
      if (mp3) return { audio: mp3, extension: "mp3" };
    }
    return result;
  }

  private readJsonAudio(data: unknown): DeepInfraTtsResult {
    const audio = (data as { audio?: unknown }).audio;
    if (typeof audio !== "string") {
      throw new Error("DeepInfra TTS response did not include audio data.");
    }

    const match = audio.match(/^data:([^;]+);base64,(.*)$/);
    const base64 = match ? match[2] : audio;
    const mime = match?.[1] ?? "";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return {
      audio: bytes.buffer,
      extension: this.detectExtension(mime),
    };
  }

  /**
   * Choose the file extension from a mime type or content-type header. Defaults
   * to wav for unknown types, since DeepInfra TTS responses default to wav.
   */
  private detectExtension(mime: string): "mp3" | "wav" {
    if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
    return "wav";
  }

  private async readErrorMessage(response: Response): Promise<string> {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const data = await response.json();
        const detail = data?.detail ?? data?.error?.message ?? data?.message;
        if (typeof detail === "string" && detail.trim()) {
          return detail;
        }
      } catch {
        // Fall through to status text.
      }
    }

    const text = await response.text().catch(() => "");
    return text.trim() || `DeepInfra TTS failed with HTTP ${response.status}`;
  }
}
