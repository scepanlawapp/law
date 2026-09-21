import {
  buildDocumentCreateFormData,
  clampPercent,
  titleFromFilename,
  validateSize,
  validateTitle,
} from "./document-upload.utils";

describe("document-upload.utils", () => {
  it("derives a title from the filename without the last extension", () => {
    expect(titleFromFilename("ugovor.final.pdf")).toBe("ugovor.final");
  });

  it("requires a trimmed title within 320 characters", () => {
    expect(validateTitle("  ")).toBe("documents.upload.errorTitleRequired");
    expect(validateTitle("a".repeat(321))).toBe(
      "documents.upload.errorTitleMax",
    );
    expect(validateTitle(" Ugovor ")).toBeNull();
  });

  it("rejects empty and oversized files", () => {
    expect(validateSize(0, 100)).toBe("documents.upload.errorEmptyFile");
    expect(validateSize(101, 100)).toBe("documents.upload.errorTooLarge");
    expect(validateSize(100, 100)).toBeNull();
  });

  it("clamps known progress without fabricating values", () => {
    expect(clampPercent(50, 100)).toBe(50);
    expect(clampPercent(150, 100)).toBe(100);
    expect(clampPercent(0, 0)).toBe(0);
  });

  it("appends title and repeated association fields before the file", () => {
    const file = new File(["pdf"], "ugovor.pdf", { type: "application/pdf" });
    const body = buildDocumentCreateFormData({
      title: "Ugovor",
      caseIds: ["case-1", "case-2"],
      clientIds: ["client-1"],
      file,
    });
    expect([...body.keys()]).toEqual([
      "title",
      "caseIds",
      "caseIds",
      "clientIds",
      "file",
    ]);
    expect(body.get("title")).toBe("Ugovor");
    expect(body.getAll("caseIds")).toEqual(["case-1", "case-2"]);
    const uploaded = body.get("file");
    expect(uploaded).toBeInstanceOf(File);
    expect((uploaded as File).name).toBe("ugovor.pdf");
  });
});
