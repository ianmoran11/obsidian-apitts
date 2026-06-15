import { App, Modal, Setting, TFile } from "obsidian";

export class NotePickerModal extends Modal {
  private readonly selected = new Set<string>();
  private query = "";
  private listEl!: HTMLElement;
  private countEl!: HTMLElement;

  constructor(
    app: App,
    private readonly files: TFile[],
    preselected: TFile[],
    private readonly onSubmit: (files: TFile[]) => void,
  ) {
    super(app);
    for (const file of preselected) this.selected.add(file.path);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("apitts-note-picker-modal");
    contentEl.createEl("h2", { text: "Select notes for TTS" });

    new Setting(contentEl)
      .setName("Filter notes")
      .addText((text) =>
        text
          .setPlaceholder("Type part of a path...")
          .onChange((value) => {
            this.query = value.toLowerCase();
            this.renderList();
          }),
      );

    const actions = contentEl.createDiv({ cls: "apitts-picker-actions" });
    this.countEl = actions.createSpan({ cls: "apitts-picker-count" });
    actions.createEl("button", { text: "Select visible" }, (button) => {
      button.addEventListener("click", () => {
        for (const file of this.visibleFiles()) this.selected.add(file.path);
        this.renderList();
      });
    });
    actions.createEl("button", { text: "Clear" }, (button) => {
      button.addEventListener("click", () => {
        this.selected.clear();
        this.renderList();
      });
    });

    this.listEl = contentEl.createDiv({ cls: "apitts-note-list" });

    new Setting(contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) =>
        button
          .setCta()
          .setButtonText("Continue")
          .onClick(() => {
            const picked = this.files.filter((file) => this.selected.has(file.path));
            if (picked.length === 0) return;
            this.close();
            this.onSubmit(picked);
          }),
      );

    this.renderList();
  }

  private visibleFiles(): TFile[] {
    if (!this.query) return this.files;
    return this.files.filter((file) => file.path.toLowerCase().includes(this.query));
  }

  private renderList(): void {
    this.listEl.empty();
    const visible = this.visibleFiles();
    this.countEl.setText(`${this.selected.size} selected · ${visible.length} visible`);

    for (const file of visible) {
      const row = this.listEl.createDiv({ cls: "apitts-note-row" });
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = this.selected.has(file.path);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.selected.add(file.path);
        else this.selected.delete(file.path);
        this.countEl.setText(`${this.selected.size} selected · ${visible.length} visible`);
      });
      row.createSpan({ text: file.path });
      row.addEventListener("click", (event) => {
        if (event.target === checkbox) return;
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change"));
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
