import { App, Modal, Setting } from "obsidian";

export type GenerationScope = "whole" | "sections";

export interface GenerationOptions {
  scope: GenerationScope;
  headingLevel: number;
}

export class GenerationOptionsModal extends Modal {
  private selectedScope: GenerationScope = "whole";
  private headingLevel: number;

  constructor(
    app: App,
    private readonly noteCount: number,
    defaultHeadingLevel: number,
    private readonly onSubmit: (options: GenerationOptions) => void,
  ) {
    super(app);
    this.headingLevel = defaultHeadingLevel;
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
      .setDesc("Generate one audio set for each whole note, or split each note into sections.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("whole", "Whole notes")
          .addOption("sections", "Sections by heading level")
          .setValue(this.selectedScope)
          .onChange((value) => {
            this.selectedScope = value as GenerationScope;
            this.renderHeadingVisibility();
          }),
      );

    const headingSetting = new Setting(contentEl)
      .setName("Section heading level")
      .setDesc("Sections start at headings up to and including this level; deeper headings stay inside their parent section.")
      .addDropdown((dropdown) => {
        for (let level = 1; level <= 6; level++) {
          dropdown.addOption(String(level), `Heading ${level}`);
        }
        dropdown.setValue(String(this.headingLevel)).onChange((value) => {
          this.headingLevel = parseInt(value, 10) || 2;
        });
      });
    headingSetting.settingEl.addClass("apitts-heading-level-setting");

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
            this.onSubmit({ scope: this.selectedScope, headingLevel: this.headingLevel });
          }),
      );

    this.renderHeadingVisibility();
  }

  private renderHeadingVisibility(): void {
    const setting = this.contentEl.querySelector<HTMLElement>(".apitts-heading-level-setting");
    if (setting) {
      setting.toggleClass("apitts-hidden", this.selectedScope !== "sections");
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
