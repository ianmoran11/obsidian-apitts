import {
  App,
  BasesView,
  BasesViewRegistration,
  Notice,
  QueryController,
  TFile,
  TFolder,
  Vault,
  type BasesEntry,
  type BasesEntryGroup,
  type BasesPropertyId,
} from "obsidian";
import type ApiTtsPlugin from "../main";
import { ensureFolder, sanitizePathSegment } from "../audio/storage";

export const AUDIOBOOK_EXPORT_VIEW = "apitts-audiobook-export";

const DEFAULT_FILENAME_PROP = "formula.new-mp3-name" as BasesPropertyId;
const DEFAULT_OUTPUT_ROOT = "Audiobooks";

type CopyMode = "copy" | "move";
type ConflictMode = "overwrite" | "skip" | "keepBoth";

interface ExportOptions {
  filenameProp: BasesPropertyId;
  outputRoot: string;
  copyMode: CopyMode;
  onConflict: ConflictMode;
}

interface ExportSummary {
  groups: number;
  copied: number;
  overwritten: number;
  skipped: number;
  errors: number;
}

/**
 * A custom Bases view that copies each entry's file into a per-group folder,
 * renaming it to a chosen property (e.g. the `name_new` column). Designed for
 * turning a grouped Base of lesson mp3s into audiobook folders, one per group.
 */
export class AudiobookExportView extends BasesView {
  type = AUDIOBOOK_EXPORT_VIEW;

  private rootEl: HTMLElement | null = null;
  private summaryEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private logEl!: HTMLElement;
  private exportButton!: HTMLButtonElement;
  private running = false;

  constructor(
    controller: QueryController,
    private readonly containerEl: HTMLElement,
    app: App,
    private readonly plugin: ApiTtsPlugin,
  ) {
    super(controller);
    this.app = app;
  }

  onload(): void {
    this.plugin.activeExportView = this;
    this.renderShell();
    this.renderSummary();
  }

  onunload(): void {
    if (this.plugin.activeExportView === this) this.plugin.activeExportView = null;
    this.rootEl?.remove();
    this.rootEl = null;
  }

  onDataUpdated(): void {
    if (!this.rootEl) this.renderShell();
    this.renderSummary();
  }

  /** Build the static structure once. */
  private renderShell(): void {
    this.containerEl.empty();
    const root = this.containerEl.createDiv({ cls: "apitts-audiobook-export" });
    this.rootEl = root;

    root.createDiv({ cls: "apitts-audiobook-title", text: "Audiobook export" });
    root.createDiv({
      cls: "apitts-audiobook-desc",
      text: "Copies each row's file into Output folder / Group / Filename property, using this view's grouping. Configure the properties in the view options menu.",
    });

    this.exportButton = root.createEl("button", {
      cls: "mod-cta apitts-audiobook-button",
      text: "Copy to audiobook folders",
    });
    this.exportButton.addEventListener("click", () => void this.runExport());

    this.summaryEl = root.createDiv({ cls: "apitts-audiobook-summary" });
    this.statusEl = root.createDiv({ cls: "apitts-audiobook-status" });

    const logDetails = root.createEl("details", { cls: "apitts-audiobook-log-details" });
    logDetails.createEl("summary", { text: "Show log" });
    this.logEl = logDetails.createDiv({ cls: "apitts-audiobook-log" });
  }

  /** Refresh the preview of what the export would produce. */
  private renderSummary(): void {
    if (!this.summaryEl) return;
    const groups = this.data?.groupedData ?? [];
    const totalFiles = groups.reduce((sum, group) => sum + group.entries.length, 0);

    this.summaryEl.empty();
    if (groups.length === 0) {
      this.summaryEl.setText("No matching rows. Adjust the base filters to select files to export.");
      if (this.exportButton) this.exportButton.disabled = true;
      return;
    }

    if (this.exportButton) this.exportButton.disabled = this.running;

    const { outputRoot } = this.readOptions();
    this.summaryEl.createDiv({
      text: `${totalFiles} file${totalFiles === 1 ? "" : "s"} in ${groups.length} group${groups.length === 1 ? "" : "s"} → ${outputRoot}/`,
    });

    const previewList = this.summaryEl.createEl("ul", { cls: "apitts-audiobook-preview" });
    for (const group of groups.slice(0, 6)) {
      const name = this.groupFolderName(group);
      previewList.createEl("li", {
        text: `${name}/ — ${group.entries.length} file${group.entries.length === 1 ? "" : "s"}`,
      });
    }
    if (groups.length > 6) {
      previewList.createEl("li", { text: `…and ${groups.length - 6} more` });
    }
  }

  private groupFolderName(group: BasesEntryGroup): string {
    const raw = group.hasKey() ? group.key?.toString() ?? "" : "";
    return sanitizePathSegment(raw, "Ungrouped");
  }

  private readOptions(): ExportOptions {
    const config = this.config;
    const filenameProp = config.getAsPropertyId("filenameProp") ?? DEFAULT_FILENAME_PROP;

    const rawRoot = String(config.get("outputRoot") ?? "").trim();
    const outputRoot = (rawRoot || DEFAULT_OUTPUT_ROOT).replace(/^\/+|\/+$/g, "") || DEFAULT_OUTPUT_ROOT;

    const copyMode = (config.get("copyMode") as CopyMode) === "move" ? "move" : "copy";

    const conflict = config.get("onConflict") as ConflictMode;
    const onConflict: ConflictMode =
      conflict === "skip" || conflict === "keepBoth" ? conflict : "overwrite";

    return { filenameProp, outputRoot, copyMode, onConflict };
  }

  /** Run the export, invoked by the in-view button or the plugin command. */
  async runExport(): Promise<void> {
    if (this.running) return;
    const groups = this.data?.groupedData ?? [];
    if (groups.length === 0) {
      new Notice("APITTS: no rows to export.");
      return;
    }

    this.running = true;
    this.exportButton.disabled = true;
    this.logEl.empty();

    const options = this.readOptions();
    const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
    const summary: ExportSummary = {
      groups: groups.length,
      copied: 0,
      overwritten: 0,
      skipped: 0,
      errors: 0,
    };

    const vault = this.app.vault;
    let processed = 0;

    try {
      for (const group of groups) {
        const folderName = this.groupFolderName(group);
        const folder = `${options.outputRoot}/${folderName}`;
        try {
          await ensureFolder(vault, folder);
        } catch (error) {
          summary.errors += group.entries.length;
          this.log(`Error creating folder ${folder}: ${describeError(error)}`);
          processed += group.entries.length;
          continue;
        }

        const usedNames = new Set<string>();
        for (const entry of group.entries) {
          processed++;
          this.setStatus(`Copying ${processed} / ${total}…`);
          try {
            await this.copyEntry(vault, folder, entry, options, usedNames, summary);
          } catch (error) {
            summary.errors++;
            this.log(`Error copying ${entry.file.path}: ${describeError(error)}`);
          }
        }
      }
    } finally {
      this.running = false;
      this.exportButton.disabled = false;
    }

    const done =
      `Copied ${summary.copied + summary.overwritten} file(s) into ${summary.groups} folder(s)` +
      (summary.skipped ? `, skipped ${summary.skipped}` : "") +
      (summary.errors ? `, ${summary.errors} error(s)` : "") +
      ".";
    this.setStatus(done);
    this.log(done);
    new Notice(`APITTS: ${done}`);
  }

  private async copyEntry(
    vault: Vault,
    folder: string,
    entry: BasesEntry,
    options: ExportOptions,
    usedNames: Set<string>,
    summary: ExportSummary,
  ): Promise<void> {
    const source = entry.file;
    const rawName = entry.getValue(options.filenameProp)?.toString().trim();
    const { stem, ext } = splitName(rawName || source.name, source.extension);

    const name = this.resolveName(
      vault,
      folder,
      stem,
      ext,
      usedNames,
      options.onConflict === "keepBoth",
    );
    const dest = `${folder}/${name}`;
    const existing = vault.getAbstractFileByPath(dest);

    if (existing instanceof TFolder) {
      throw new Error(`a folder already exists at ${dest}`);
    }

    if (existing instanceof TFile) {
      if (options.onConflict === "skip") {
        summary.skipped++;
        this.log(`Skipped ${dest} (already exists)`);
        return;
      }
      // overwrite (keepBoth never resolves to an existing path)
      await vault.modifyBinary(existing, await vault.readBinary(source));
      summary.overwritten++;
      this.log(`Overwrote ${dest}`);
    } else {
      await vault.copy(source, dest);
      summary.copied++;
      this.log(`Copied ${dest}`);
    }

    if (options.copyMode === "move") {
      await vault.trash(source, true);
    }
  }

  /**
   * Resolve a filename that is unique within this run (and, for keepBoth, on disk).
   * For overwrite/skip we only dedupe against names already written this run, so the
   * conflict behaviour applies to files from previous runs.
   */
  private resolveName(
    vault: Vault,
    folder: string,
    stem: string,
    ext: string,
    usedNames: Set<string>,
    mustNotExistOnDisk: boolean,
  ): string {
    let n = 0;
    let name = "";
    for (;;) {
      name = n === 0 ? `${stem}.${ext}` : `${stem}-${n}.${ext}`;
      const key = name.toLowerCase();
      const collidesInRun = usedNames.has(key);
      const existsOnDisk =
        mustNotExistOnDisk && vault.getAbstractFileByPath(`${folder}/${name}`) != null;
      if (!collidesInRun && !existsOnDisk) break;
      n++;
    }
    usedNames.add(name.toLowerCase());
    return name;
  }

  private setStatus(text: string): void {
    this.statusEl?.setText(text);
  }

  private log(message: string): void {
    if (!this.logEl) return;
    this.logEl.createDiv({ cls: "apitts-audiobook-log-line", text: message });
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
}

/** Split a desired filename into a sanitized stem and an extension. */
function splitName(rawName: string, fallbackExt: string): { stem: string; ext: string } {
  const ext = (fallbackExt || "mp3").replace(/^\.+/, "").toLowerCase() || "mp3";
  const withoutExt = rawName.replace(new RegExp(`\\.${ext}$`, "i"), "");
  const stem = sanitizePathSegment(withoutExt, "audio");
  return { stem, ext };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function audiobookExportRegistration(
  app: App,
  plugin: ApiTtsPlugin,
): BasesViewRegistration {
  return {
    name: "Audiobook export",
    icon: "audio-lines",
    factory: (controller, containerEl) =>
      new AudiobookExportView(controller, containerEl, app, plugin),
    options: () => [
      {
        type: "property",
        key: "filenameProp",
        displayName: "Filename property",
        default: DEFAULT_FILENAME_PROP,
      },
      {
        type: "folder",
        key: "outputRoot",
        displayName: "Output folder",
        default: DEFAULT_OUTPUT_ROOT,
        placeholder: DEFAULT_OUTPUT_ROOT,
      },
      {
        type: "dropdown",
        key: "copyMode",
        displayName: "Copy or move",
        default: "copy",
        options: { copy: "Copy", move: "Move" } as Record<string, string>,
      },
      {
        type: "dropdown",
        key: "onConflict",
        displayName: "If a file exists",
        default: "overwrite",
        options: {
          overwrite: "Overwrite",
          skip: "Skip",
          keepBoth: "Keep both",
        } as Record<string, string>,
      },
    ],
  };
}
