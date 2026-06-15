import {
  Menu,
  Notice,
  Plugin,
  TAbstractFile,
  TFile,
  TFolder,
} from "obsidian";
import { TtsGenerator } from "./generator";
import {
  ApiTtsSettingTab,
  DEFAULT_SETTINGS,
  type ApiTtsSettings,
} from "./settings";
import { GenerationOptionsModal } from "./ui/optionsModal";
import { NotePickerModal } from "./ui/notePickerModal";
import { ProgressModal } from "./ui/progressModal";

export default class ApiTtsPlugin extends Plugin {
  settings!: ApiTtsSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new ApiTtsSettingTab(this.app, this));
    this.registerCommands();
    this.registerFileMenu();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private registerCommands(): void {
    this.addCommand({
      id: "generate-active-note-audio",
      name: "Generate TTS audio for active note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!this.isMarkdownFile(file)) return false;
        if (!checking) this.openOptionsModal([file]);
        return true;
      },
    });

    this.addCommand({
      id: "generate-multiple-notes-audio",
      name: "Generate TTS audio for multiple notes...",
      callback: () => this.openNotePicker(),
    });
  }

  private registerFileMenu(): void {
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
        if (this.isMarkdownFile(file)) {
          menu.addItem((item) =>
            item
              .setTitle("Generate TTS audio")
              .setIcon("audio-lines")
              .onClick(() => this.openOptionsModal([file])),
          );
          return;
        }

        if (file instanceof TFolder) {
          const files = this.markdownFilesInFolder(file);
          if (files.length === 0) return;
          menu.addItem((item) =>
            item
              .setTitle("Generate TTS audio for notes in folder")
              .setIcon("audio-lines")
              .onClick(() => this.openOptionsModal(files)),
          );
        }
      }),
    );
  }

  private openNotePicker(): void {
    const files = this.app.vault
      .getMarkdownFiles()
      .sort((a, b) => a.path.localeCompare(b.path));
    const active = this.app.workspace.getActiveFile();
    new NotePickerModal(
      this.app,
      files,
      this.isMarkdownFile(active) ? [active] : [],
      (picked) => this.openOptionsModal(picked),
    ).open();
  }

  private openOptionsModal(files: TFile[]): void {
    if (files.length === 0) {
      new Notice("No markdown notes selected.");
      return;
    }

    const activeLine = files.length === 1 ? this.getActiveCursorLineForFile(files[0]) : undefined;

    new GenerationOptionsModal(
      this.app,
      files.length,
      this.settings.defaultHeadingLevel,
      (options) => this.generate(files, { ...options, activeLine }),
      activeLine !== undefined,
    ).open();
  }

  private getActiveCursorLineForFile(file: TFile): number | undefined {
    const activeEditor = this.app.workspace.activeEditor;
    if (activeEditor?.file?.path !== file.path || !activeEditor.editor) return undefined;
    return activeEditor.editor.getCursor().line;
  }

  private async generate(
    files: TFile[],
    options: Parameters<TtsGenerator["generateForFiles"]>[1],
  ): Promise<void> {
    const abortController = new AbortController();
    const progress = new ProgressModal(this.app, abortController);
    progress.open();

    try {
      await new TtsGenerator(this.app.vault, this.settings, progress).generateForFiles(
        files,
        options,
        abortController.signal,
      );
      progress.finish("Done");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      progress.addLog(`Error: ${message}`);
      new Notice(`APITTS failed: ${message}`);
    }
  }

  private isMarkdownFile(file: TAbstractFile | null): file is TFile {
    return file instanceof TFile && file.extension.toLowerCase() === "md";
  }

  private markdownFilesInFolder(folder: TFolder): TFile[] {
    const prefix = folder.path ? `${folder.path}/` : "";
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(prefix))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}
