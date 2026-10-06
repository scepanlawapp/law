import {
  droppedCandidates,
  uploadCandidate,
} from "./document-upload-candidates";

const file = new File(["pdf"], "contract.pdf", { type: "application/pdf" });
const fileEntry = (name: string) => ({
  name,
  isFile: true,
  isDirectory: false,
  file: (resolve: (file: File) => void) => resolve(file),
});
const directoryEntry = (name: string, batches: unknown[][]) => ({
  name,
  isFile: false,
  isDirectory: true,
  createReader: () => {
    let index = 0;
    return {
      readEntries: (resolve: (entries: unknown[]) => void) =>
        resolve(batches[index++] ?? []),
    };
  },
});
const transfer = (entries: unknown[]) =>
  ({
    files: [file],
    items: entries.map((entry) => ({
      kind: "file",
      webkitGetAsEntry: () => entry,
    })),
  }) as unknown as DataTransfer;

describe("upload candidates", () => {
  it("normalizes picker paths and ordinary files", () => {
    expect(uploadCandidate(file).relativeDirectoryPath).toBe("");
    expect(
      uploadCandidate(file, "Legal\\Contracts\\contract.pdf"),
    ).toMatchObject({
      relativePath: "Legal/Contracts/contract.pdf",
      relativeDirectoryPath: "Legal/Contracts",
      rootFolderName: "Legal",
    });
  });
  it("rejects traversal", () => {
    expect(() => uploadCandidate(file, "Legal/../contract.pdf")).toThrow();
  });
  it("reads every directory batch and nested directory", async () => {
    const entries = [
      directoryEntry("Legal", [
        [
          directoryEntry("Contracts", [
            [fileEntry("one.pdf")],
            [fileEntry("two.pdf")],
          ]),
        ],
        [fileEntry("notes.pdf")],
      ]),
    ];
    expect(
      (await droppedCandidates(transfer(entries), false)).map(
        (item) => item.relativePath,
      ),
    ).toEqual([
      "Legal/Contracts/one.pdf",
      "Legal/Contracts/two.pdf",
      "Legal/notes.pdf",
    ]);
  });
  it("rejects directory drops in version mode", async () => {
    await expect(
      droppedCandidates(transfer([directoryEntry("Legal", [])]), true),
    ).rejects.toThrow("versionFolderError");
  });
  it("keeps ordinary file drops when directory APIs are missing", async () => {
    expect(
      await droppedCandidates(
        { files: [file], items: [] } as unknown as DataTransfer,
        false,
      ),
    ).toHaveLength(1);
  });
  it("reports unreadable directory drops without flattening", async () => {
    await expect(
      droppedCandidates(
        {
          files: [new File([], "Legal")],
          items: [],
        } as unknown as DataTransfer,
        false,
      ),
    ).rejects.toThrow("folderDropUnsupported");
  });
});
