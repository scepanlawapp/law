import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  createFileStorageConfig,
  LocalStorageAdapter,
  StorageError,
  buildStorageKey,
} from "@law/file-storage";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const fileId = "22222222-2222-4222-a222-222222222222";

describe("LocalStorageAdapter", () => {
  let root: string;
  let adapter: LocalStorageAdapter;
  const key = buildStorageKey(workspaceId, fileId);

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "law-file-storage-"));
    adapter = new LocalStorageAdapter(createFileStorageConfig({ root }));
  });

  it("writes bytes exclusively and refuses overwrite", async () => {
    const first = await adapter.write(key, Readable.from([Buffer.from("%PDF-1.4 ok")]), {
      maxBytes: 1_000_000,
      tempSuffix: "op-1",
    });
    expect(first.bytes).toBeGreaterThan(0);
    const stored = await readFile(join(root, key));
    expect(stored.toString("utf8")).toContain("%PDF-1.4");

    await expect(
      adapter.write(key, Readable.from([Buffer.from("%PDF-1.4 other")]), {
        maxBytes: 1_000_000,
        tempSuffix: "op-2",
      }),
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" } satisfies Partial<StorageError>);
  });

  it("rejects traversal keys", () => {
    expect(() => adapter.resolvePath("../outside/content")).toThrow(StorageError);
    expect(() => adapter.resolvePath("/etc/passwd")).toThrow(StorageError);
  });

  it("rejects a symlink that escapes the storage root", async () => {
    const outside = await mkdtemp(join(tmpdir(), "law-outside-"));
    const target = join(outside, "secret");
    await writeFile(target, "nope");
    await mkdir(join(root, workspaceId), { recursive: true });
    await symlink(outside, join(root, workspaceId, fileId));

    await expect(adapter.read(key)).rejects.toBeInstanceOf(StorageError);
  });
});
