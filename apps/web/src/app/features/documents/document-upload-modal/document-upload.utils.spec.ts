import {
  clampPercent,
  formatFileSize,
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

  it("formats file sizes in the given locale", () => {
    expect(formatFileSize(512, "en-GB")).toBe("512 byte");
    expect(formatFileSize(1536, "en-GB")).toBe("1.5 kB");
    expect(formatFileSize(1536, "sr-Latn-RS")).toBe("1,5 kB");
    expect(formatFileSize(25 * 1024 * 1024, "en-GB")).toBe("25 MB");
  });
});
