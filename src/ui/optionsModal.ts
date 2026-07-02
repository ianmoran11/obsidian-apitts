import { App, Modal, Setting } from "obsidian";
import {
  DEFAULT_VOICE_DESCRIPTION,
  TTS_MODELS,
  isVoiceDesignModel,
} from "../tts/models";

export type GenerationScope = "whole" | "sections" | "callouts" | "codeBlocks";

export interface GenerationOptions {
  scope: GenerationScope;
  headingLevel: number;
  cursorOnly: boolean;
  activeLine?: number;
  ttsModel: string;
  voiceDescription: string;
}

export class GenerationOptionsModal extends Modal {
  private selectedScope: GenerationScope;
  private headingLevel: number;
  private cursorOnly = true;
  private ttsModel: string;
  private voiceDescription: string;

  constructor(
    app: App,
    private readonly noteCount: number,
    defaultHeadingLevel: number,
    private readonly defaultTtsModel: string,
    private readonly defaultVoiceDescription: string,
    private readonly onSubmit: (options: GenerationOptions) => void,
    private readonly hasActiveCursorSection = false,
  ) {
    super(app);
    this.headingLevel = defaultHeadingLevel;
    this.ttsModel = defaultTtsModel;
    this.voiceDescription = defaultVoiceDescription;
    // When a cursor is available, default to reading just the section at the cursor.
    this.selectedScope = hasActiveCursorSection ? "sections" : "whole";
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("apitts-options-modal");
    contentEl.createEl("h2", { text: "Generate text-to-speech audio" });
    contentEl.createEl("p", {
      text: `Generate embedded audio for ${this.noteCount} note${this.noteCount === 1 ? "" : "s"}.`,
    });

    new Setting(contentEl)
      .setName("Content to read")
      .setDesc(
        this.hasActiveCursorSection
          ? "Whole note, the heading section containing the cursor, or one audio per code block / callout."
          : "Whole note, sections by heading level, or one audio per code block / callout.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("whole", "Whole notes")
          .addOption("sections", "Sections by heading level")
          .addOption("codeBlocks", "Code blocks")
          .addOption("callouts", "Callouts")
          .setValue(this.selectedScope)
          .onChange((value) => {
            this.selectedScope = value as GenerationScope;
            this.renderConditionalSettings();
          }),
      );

    new Setting(contentEl)
      .setName("TTS model")
      .setDesc("DeepInfra text-to-speech model.")
      .addDropdown((dropdown) => {
        for (const model of TTS_MODELS) {
          dropdown.addOption(model.slug, model.label);
        }
        dropdown.setValue(this.ttsModel).onChange((value) => {
          this.ttsModel = value;
          this.renderConditionalSettings();
        });
      });

    const voiceDescriptionSetting = new Setting(contentEl)
      .setName("Voice description")
      .setDesc(
        "Describe the voice in a full sentence for Qwen3-TTS-VoiceDesign (e.g. \"A bright, engaging American male storyteller voice\"). Tag/key:value syntax is not understood well.",
      )
      .addTextArea((text) => {
        text
          .setPlaceholder(DEFAULT_VOICE_DESCRIPTION)
          .setValue(this.voiceDescription)
          .onChange((value) => {
            this.voiceDescription = value.trim() || DEFAULT_VOICE_DESCRIPTION;
          });
        text.inputEl.rows = 2;
        text.inputEl.style.width = "100%";
      });
    voiceDescriptionSetting.settingEl.addClass("apitts-voice-description-setting");

    const headingSetting = new Setting(contentEl)
      .setName("Section heading level")
      .setDesc(
        "Sections start at headings up to and including this level; deeper headings stay inside their parent section.",
      )
      .addDropdown((dropdown) => {
        for (let level = 1; level <= 6; level++) {
          dropdown.addOption(String(level), `Heading ${level}`);
        }
        dropdown.setValue(String(this.headingLevel)).onChange((value) => {
          this.headingLevel = parseInt(value, 10) || 2;
        });
      });
    headingSetting.settingEl.addClass("apitts-heading-level-setting");

    const cursorSetting = new Setting(contentEl)
      .setName("Only the block at the cursor")
      .setDesc(
        "Generate a single audio for the section, callout, or code block containing the cursor. Turn off to generate one audio per match in the note.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.cursorOnly).onChange((value) => {
          this.cursorOnly = value;
        }),
      );
    cursorSetting.settingEl.addClass("apitts-cursor-only-setting");

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("Cancel")
          .onClick(() => this.close()),
      )
      .addButton((button) =>
        button
          .setCta()
          .setButtonText("Generate audio")
          .onClick(() => {
            this.close();
            this.onSubmit({
              scope: this.selectedScope,
              headingLevel: this.headingLevel,
              cursorOnly: this.cursorOnly,
              ttsModel: this.ttsModel,
              voiceDescription: this.voiceDescription,
            });
          }),
      );

    this.renderConditionalSettings();
  }

  private renderConditionalSettings(): void {
    const headingSetting = this.contentEl.querySelector<HTMLElement>(".apitts-heading-level-setting");
    headingSetting?.toggleClass("apitts-hidden", this.selectedScope !== "sections");

    // "Current block only" applies to the splitting scopes, and only when a cursor is available.
    const cursorSetting = this.contentEl.querySelector<HTMLElement>(".apitts-cursor-only-setting");
    cursorSetting?.toggleClass(
      "apitts-hidden",
      !this.hasActiveCursorSection || this.selectedScope === "whole",
    );

    // The voice description field only applies to voice-design models.
    const voiceDescriptionSetting =
      this.contentEl.querySelector<HTMLElement>(".apitts-voice-description-setting");
    voiceDescriptionSetting?.toggleClass(
      "apitts-hidden",
      !isVoiceDesignModel(this.ttsModel),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
