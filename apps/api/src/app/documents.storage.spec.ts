import { LegalDocumentStorage } from "@law/legal-documents";

describe("LegalDocumentStorage", () => {
  it("rejects document storage traversal outside the document directory", async () => {
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
