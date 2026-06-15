import { App, Modal, Setting } from "obsidian";

export class ProgressModal extends Modal {
  private progressEl!: HTMLProgressElement;
  private statusEl!: HTMLElement;
  private logEl!: HTMLElement;
  private current = 0;
  private total = 1;

  constructor(
    app: App,
    private readonly abortController: AbortController,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("apitts-progress-modal");
    contentEl.createEl("h2", { text: "Generating TTS audio" });
    this.statusEl = contentEl.createDiv({ cls: "apitts-progress-status" });
    this.progressEl = contentEl.createEl("progress", { cls: "apitts-progress-bar" });
    this.progressEl.max = this.total;
    this.progressEl.value = this.current;
    this.logEl = contentEl.createDiv({ cls: "apitts-progress-log" });

    new Setting(contentEl).addButton((button) =>
      button
        .setWarning()
        .setButtonText("Cancel")
        .onClick(() => {
          this.abortController.abort();
          this.addLog("Cancelling after the current request stops...");
        }),
    );

    this.setProgress(0, 1, "Preparing notes...");
  }

  setProgress(current: number, total: number, status: string): void {
    this.current = current;
    this.total = Math.max(1, total);
    if (!this.progressEl || !this.statusEl) return;
    this.progressEl.max = this.total;
    this.progressEl.value = Math.min(current, this.total);
    this.statusEl.setText(`${status} (${Math.min(current, this.total)} / ${this.total})`);
  }

  addLog(message: string): void {
    if (!this.logEl) return;
    const line = this.logEl.createDiv({ text: message });
    line.addClass("apitts-progress-log-line");
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  finish(message: string): void {
    this.setProgress(this.total, this.total, message);
    this.addLog(message);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
