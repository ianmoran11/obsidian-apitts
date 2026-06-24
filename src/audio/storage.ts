import { TFile, TFolder, Vault } from "obsidian";

export interface AudioStorageResult {
  path: string;
  basename: string;
}

export function sanitizePathSegment(segment: string, fallback = "Untitled"): string {
  return (
    segment
      .replace(/[\\/:*?"<>|#^[\]]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || fallback
  );
}

export function slugifyForFilename(value: string, fallback = "audio"): string {
  return (
    sanitizePathSegment(value, fallback)
      .toLowerCase()
      .replace(/[^a-z0-9._ -]+/g, "-")
      .replace(/[ ._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || fallback
  );
}

function normalizeRoot(root: string): string {
  return (root || "_Audio").replace(/^\/+|\/+$/g, "") || "_Audio";
}

export async function ensureFolder(vault: Vault, folderPath: string): Promise<void> {
  const parts = folderPath.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = vault.getAbstractFileByPath(current);
    if (existing instanceof TFolder) continue;
    if (existing) {
      throw new Error(`Cannot create folder ${current}; a file already exists there.`);
    }
    try {
      await vault.createFolder(current);
    } catch (error) {
      // The folder may already exist even though getAbstractFileByPath missed it
      // (metadata cache lag, sync, or case-insensitive filesystems). Tolerate that.
      if (!(vault.getAbstractFileByPath(current) instanceof TFolder)) throw error;
    }
  }
}

export function getMirroredAudioFolder(
  sourceFile: TFile,
  audioOutputFolder: string,
): string {
  const root = normalizeRoot(audioOutputFolder);
  const sourceWithoutExtension = sourceFile.path.replace(/\.md$/i, "");
  const mirrored = sourceWithoutExtension
    .split("/")
    .filter(Boolean)
    .map((segment) => sanitizePathSegment(segment))
    .join("/");
  return `${root}/${mirrored}`;
}

export async function saveAudioToMirroredFolder(
  vault: Vault,
  opts: {
    audioOutputFolder: string;
    sourceFile: TFile;
    sectionIndex: number;
    sectionTitle: string;
    chunkIndex: number;
    totalChunks: number;
    audio: ArrayBuffer;
    extension?: string;
  },
): Promise<AudioStorageResult> {
  const folder = getMirroredAudioFolder(opts.sourceFile, opts.audioOutputFolder);
  await ensureFolder(vault, folder);

  const sectionSlug = slugifyForFilename(opts.sectionTitle, "section");
  const chunkSuffix = opts.totalChunks > 1 ? `-${String(opts.chunkIndex).padStart(2, "0")}` : "";
  const basename = `${String(opts.sectionIndex).padStart(3, "0")}-${sectionSlug}${chunkSuffix}.${opts.extension ?? "mp3"}`;
  const path = `${folder}/${basename}`;

  const existing = vault.getAbstractFileByPath(path);
  if (existing instanceof TFolder) {
    throw new Error(`Cannot write audio to ${path}; a folder already exists there.`);
  }

  if (existing instanceof TFile) {
    await vault.modifyBinary(existing, opts.audio);
  } else {
    try {
      await vault.createBinary(path, opts.audio);
    } catch (error) {
      // If the file already exists despite the cache miss, overwrite it.
      const current = vault.getAbstractFileByPath(path);
      if (current instanceof TFile) {
        await vault.modifyBinary(current, opts.audio);
      } else {
        throw error;
      }
    }
  }

  return { path, basename };
}
