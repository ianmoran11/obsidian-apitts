import { Notice, TFile, Vault } from "obsidian";
import { saveAudioToMirroredFolder } from "./audio/storage";
import type { ApiTtsSettings } from "./settings";
import { DeepInfraTtsClient } from "./tts/deepinfra";
import type { GenerationOptions } from "./ui/optionsModal";
import type { ProgressModal } from "./ui/progressModal";
import {
  buildAudioEmbedBlock,
  findCalloutAtLine,
  findCodeBlockAtLine,
  findMarkdownSectionAtLine,
  insertOrReplaceAudioBlock,
  makeChunksForSection,
  makeWholeNoteSection,
  removeExistingAudioBlock,
  splitMarkdownByCallouts,
  splitMarkdownByCodeBlocks,
  splitMarkdownByHeadingLevel,
  type TtsChunk,
  type TtsSection,
} from "./text/markdown";

interface PreparedFile {
  file: TFile;
  originalMarkdown: string;
  chunks: TtsChunk[];
}

interface GeneratedEmbed {
  label: string;
  path: string;
}

export class TtsGenerator {
  constructor(
    private readonly vault: Vault,
    private readonly settings: ApiTtsSettings,
    private readonly progress: ProgressModal,
  ) {}

  async generateForFiles(
    files: TFile[],
    options: GenerationOptions,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.settings.deepInfraApiKey.trim()) {
      throw new Error("Add a DeepInfra API key in APITTS settings first.");
    }

    this.progress.setProgress(0, 1, "Preparing notes...");
    const prepared = await this.prepareFiles(files, options);
    const totalChunks = prepared.reduce((sum, item) => sum + item.chunks.length, 0);
    if (totalChunks === 0) {
      throw new Error("No readable text found in the selected notes.");
    }

    const client = new DeepInfraTtsClient(this.settings.deepInfraApiKey);
    let completed = 0;

    for (const item of prepared) {
      const embeds: GeneratedEmbed[] = [];

      for (const chunk of item.chunks) {
        this.throwIfAborted(signal);
        const label = this.describeChunk(chunk);
        this.progress.setProgress(
          completed,
          totalChunks,
          `Generating ${item.file.basename}: ${label}`,
        );

        const result = await client.generateSpeech(
          {
            text: chunk.text,
            model: this.settings.ttsModel,
            voice: this.settings.ttsVoice,
            outputFormat: "mp3",
          },
          signal,
        );

        const saved = await saveAudioToMirroredFolder(this.vault, {
          audioOutputFolder: this.settings.audioOutputFolder,
          sourceFile: item.file,
          sectionIndex: chunk.section.index,
          sectionTitle: chunk.section.title,
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunk.totalChunks,
          audio: result.audio,
          extension: result.extension,
        });

        embeds.push({ label, path: saved.path });
        completed += 1;
        this.progress.setProgress(completed, totalChunks, `Saved ${saved.path}`);
        this.progress.addLog(`Saved ${saved.path}`);
      }

      if (embeds.length > 0) {
        const block = buildAudioEmbedBlock(embeds);
        await this.vault.modify(
          item.file,
          insertOrReplaceAudioBlock(item.originalMarkdown, block),
        );
        this.progress.addLog(`Embedded ${embeds.length} audio file${embeds.length === 1 ? "" : "s"} in ${item.file.path}`);
      }
    }

    new Notice(`APITTS generated ${totalChunks} audio file${totalChunks === 1 ? "" : "s"}.`);
  }

  private async prepareFiles(
    files: TFile[],
    options: GenerationOptions,
  ): Promise<PreparedFile[]> {
    const prepared: PreparedFile[] = [];

    for (const file of files) {
      const originalMarkdown = await this.vault.read(file);
      const cleanMarkdown = removeExistingAudioBlock(originalMarkdown);
      const sections = this.computeSections(
        originalMarkdown,
        cleanMarkdown,
        options,
        files.length === 1,
      );
      const chunks = sections.flatMap((section) =>
        makeChunksForSection(section, this.settings.ttsCharacterLimit),
      );
      if (chunks.length === 0) {
        this.progress.addLog(`Skipped ${file.path}: no readable text.`);
        continue;
      }
      prepared.push({ file, originalMarkdown, chunks });
    }

    return prepared;
  }

  /**
   * Resolve which sections to read for a note. When "current only" is chosen and a
   * cursor position is available for a single note, return just the section / callout /
   * code block containing the cursor; otherwise split the whole note for the scope.
   */
  private computeSections(
    originalMarkdown: string,
    cleanMarkdown: string,
    options: GenerationOptions,
    single: boolean,
  ): TtsSection[] {
    const useCursor = options.cursorOnly && options.activeLine !== undefined && single;

    switch (options.scope) {
      case "whole":
        return [makeWholeNoteSection(cleanMarkdown)];

      case "callouts": {
        const atCursor = useCursor
          ? findCalloutAtLine(originalMarkdown, options.activeLine!)
          : null;
        return atCursor ? [atCursor] : splitMarkdownByCallouts(cleanMarkdown);
      }

      case "codeBlocks": {
        const atCursor = useCursor
          ? findCodeBlockAtLine(originalMarkdown, options.activeLine!)
          : null;
        return atCursor ? [atCursor] : splitMarkdownByCodeBlocks(cleanMarkdown);
      }

      case "sections":
      default:
        return useCursor
          ? [findMarkdownSectionAtLine(originalMarkdown, options.headingLevel, options.activeLine!)]
          : splitMarkdownByHeadingLevel(cleanMarkdown, options.headingLevel);
    }
  }

  private describeChunk(chunk: TtsChunk): string {
    const part = chunk.totalChunks > 1 ? ` part ${chunk.chunkIndex}/${chunk.totalChunks}` : "";
    return `${chunk.section.title}${part}`;
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    throw new Error("Audio generation cancelled.");
  }
}
