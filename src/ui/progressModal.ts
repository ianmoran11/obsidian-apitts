import { App } from "obsidian";

export class ProgressModal {
  private containerEl: HTMLElement | null = null;
  private progressEl!: HTMLProgressElement;
  private statusEl!: HTMLElement;
  private logEl!: HTMLElement;
  private cancelButtonEl!: HTMLButtonElement;
  private current = 0;
  private total = 1;

  constructor(
    private readonly app: App,
    private readonly abortController: AbortController,
  ) {}

  open(): void {
    this.close();

    this.containerEl = this.app.workspace.containerEl.createDiv({
      cls: "apitts-progress-popover",
      attr: { "aria-live": "polite" },
    });

    const headerEl = this.containerEl.createDiv({ cls: "apitts-progress-header" });
    headerEl.createDiv({ cls: "apitts-progress-title", text: "Generating TTS audio" });
    this.cancelButtonEl = headerEl.createEl("button", {
      cls: "apitts-progress-cancel-button",
      text: "Cancel",
    });
    this.cancelButtonEl.onclick = () => {
      this.abortController.abort();
      this.cancelButtonEl.disabled = true;
      this.cancelButtonEl.setText("Cancelling…");
      this.addLog("Cancelling after the current request stops...");
    };

    this.statusEl = this.containerEl.createDiv({ cls: "apitts-progress-status" });
    this.progressEl = this.containerEl.createEl("progress", { cls: "apitts-progress-bar" });
    this.progressEl.max = this.total;
    this.progressEl.value = this.current;

    const logDetailsEl = this.containerEl.createEl("details", {
      cls: "apitts-progress-log-details",
    });
    logDetailsEl.createEl("summary", { text: "Show log" });
    this.logEl = logDetailsEl.createDiv({ cls: "apitts-progress-log" });

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
    if (this.cancelButtonEl) {
      this.cancelButtonEl.disabled = false;
      this.cancelButtonEl.removeClass("apitts-progress-cancel-button");
      this.cancelButtonEl.addClass("apitts-progress-close-button");
      this.cancelButtonEl.setText("Close");
      this.cancelButtonEl.onclick = () => this.close();
    }
  }

  close(): void {
    this.containerEl?.remove();
    this.containerEl = null;
  }
}
