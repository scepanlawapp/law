import { LegalDocumentStorage } from "./documents.storage";

describe("LegalDocumentStorage", () => {
  it("rejects storage keys that escape the document directory", async () => {
    const storage = new LegalDocumentStorage();

    await expect(
      storage.read(
        "workspace-1",
        "document-1",
        "tenants/workspace-1/documents/document-1/../other.txt",
      ),
    ).rejects.toThrow("Invalid document storage path");
  });
});
