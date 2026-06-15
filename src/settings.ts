import {
  AbstractInputSuggest,
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TFolder,
} from "obsidian";
import type ApiTtsPlugin from "./main";

export interface ApiTtsSettings {
  deepInfraApiKey: string;
  ttsModel: string;
  ttsVoice: string;
  audioOutputFolder: string;
  ttsCharacterLimit: number;
  defaultHeadingLevel: number;
}

export const DEFAULT_SETTINGS: ApiTtsSettings = {
  deepInfraApiKey: "",
  ttsModel: "hexgrad/Kokoro-82M",
  ttsVoice: "",
  audioOutputFolder: "_Audio",
  ttsCharacterLimit: 12000,
  defaultHeadingLevel: 2,
};

class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(
    app: App,
    inputEl: HTMLInputElement,
    private readonly onSelectCb: (folder: TFolder) => void,
  ) {
    super(app, inputEl);
  }

  getSuggestions(query: string): TFolder[] {
    const lower = query.toLowerCase();
    return this.app.vault
      .getAllFolders()
      .filter((folder) => folder.path.toLowerCase().includes(lower));
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path || "/");
  }

  selectSuggestion(folder: TFolder): void {
    this.setValue(folder.path);
    this.close();
    this.onSelectCb(folder);
  }
}

export class ApiTtsSettingTab extends PluginSettingTab {
  declare plugin: ApiTtsPlugin;

  constructor(app: App, plugin: ApiTtsPlugin) {
    super(app, plugin as unknown as Plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "APITTS settings" });

    containerEl.createEl("p", {
      text: "APITTS uses DeepInfra text-to-speech and writes audio below a mirrored output folder such as _Audio/Folder/Note/001-section.mp3.",
    });

    new Setting(containerEl)
      .setName("DeepInfra API key")
      .setDesc("API key for DeepInfra text-to-speech.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("deepinfra_...")
          .setValue(this.plugin.settings.deepInfraApiKey)
          .onChange(async (value) => {
            this.plugin.settings.deepInfraApiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("TTS model")
      .setDesc("DeepInfra model slug. The default is copied from Scholia.")
      .addText((text) =>
        text
          .setPlaceholder("hexgrad/Kokoro-82M")
          .setValue(this.plugin.settings.ttsModel)
          .onChange(async (value) => {
            this.plugin.settings.ttsModel = value.trim() || DEFAULT_SETTINGS.ttsModel;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("TTS voice")
      .setDesc("Optional model-specific voice id.")
      .addText((text) =>
        text
          .setPlaceholder("Optional")
          .setValue(this.plugin.settings.ttsVoice)
          .onChange(async (value) => {
            this.plugin.settings.ttsVoice = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Audio output folder")
      .setDesc("Root folder. Audio mirrors the note path inside this folder.")
      .addText((text) => {
        text
          .setPlaceholder("_Audio")
          .setValue(this.plugin.settings.audioOutputFolder)
          .onChange(async (value) => {
            this.plugin.settings.audioOutputFolder = value.trim() || DEFAULT_SETTINGS.audioOutputFolder;
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.plugin.app, text.inputEl, (folder) => {
          text.setValue(folder.path);
          this.plugin.settings.audioOutputFolder = folder.path || DEFAULT_SETTINGS.audioOutputFolder;
          this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Characters per TTS request")
      .setDesc("Long notes are split into chunks of at most this many characters.")
      .addText((text) => {
        text.inputEl.type = "number";
        text
          .setValue(String(this.plugin.settings.ttsCharacterLimit))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            this.plugin.settings.ttsCharacterLimit = Math.min(
              50000,
              Math.max(1000, Number.isFinite(parsed) ? parsed : DEFAULT_SETTINGS.ttsCharacterLimit),
            );
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Default section heading level")
      .setDesc("When generating section audio, split at headings up to this level.")
      .addDropdown((dropdown) => {
        for (let level = 1; level <= 6; level++) {
          dropdown.addOption(String(level), `Heading ${level}`);
        }
        dropdown
          .setValue(String(this.plugin.settings.defaultHeadingLevel))
          .onChange(async (value) => {
            this.plugin.settings.defaultHeadingLevel = parseInt(value, 10) || DEFAULT_SETTINGS.defaultHeadingLevel;
            await this.plugin.saveSettings();
          });
      });
  }
}
