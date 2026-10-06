export interface DocumentUploadCandidate {
  file: File;
  relativePath: string;
  relativeDirectoryPath: string;
  rootFolderName: string | null;
}

export function uploadCandidate(
  file: File,
  path = file.webkitRelativePath || file.name,
): DocumentUploadCandidate {
  const parts = path.replace(/\\/g, "/").split("/");
  if (
    parts.some(
      (part) =>
        !part.trim() ||
        part.trim() === "." ||
        part.trim() === ".." ||
        Array.from(part).some(
          (character) =>
            character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        ),
    )
  ) {
    throw new Error("documents.upload.folderError");
  }
  return {
    file,
    relativePath: parts.join("/"),
    relativeDirectoryPath: parts.slice(0, -1).join("/"),
    rootFolderName: parts.length > 1 ? parts[0] : null,
  };
}

export async function droppedCandidates(
  transfer: DataTransfer,
  versionMode: boolean,
): Promise<DocumentUploadCandidate[]> {
  // Capture entries/files synchronously before the browser clears the drag data store.
  const files = Array.from(transfer.files);
  const items = Array.from(transfer.items).filter(
    (item) => item.kind === "file",
  );
  const entries = items.map((item) => item.webkitGetAsEntry?.() ?? null);
  if (versionMode && entries.some((entry) => entry?.isDirectory))
    throw new Error("documents.upload.versionFolderError");
  if (!items.length || entries.every((entry) => !entry)) {
    if (files.some((file) => !file.type && !file.size))
      throw new Error("documents.upload.folderDropUnsupported");
    return files.map((file) => uploadCandidate(file));
  }
  const result: DocumentUploadCandidate[] = [];
  async function visit(entry: FileSystemEntry, prefix: string): Promise<void> {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      result.push(uploadCandidate(file, path));
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // Chromium returns batches (often 100 entries); continue until empty.
      while (true) {
        const children = await new Promise<FileSystemEntry[]>(
          (resolve, reject) => reader.readEntries(resolve, reject),
        );
        if (!children.length) break;
        for (const child of children) await visit(child, path);
      }
    }
  }
  for (let i = 0; i < items.length; i++) {
    const entry = entries[i];
    if (entry) await visit(entry, "");
    else {
      const file = files[i];
      if (!file || (!file.type && !file.size))
        throw new Error("documents.upload.folderDropUnsupported");
      result.push(uploadCandidate(file));
    }
  }
  return result;
}
