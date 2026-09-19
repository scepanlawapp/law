import { parseLegalHtml } from "./legal-source-parser";

describe("parseLegalHtml", () => {
  it("extracts validated legal text and a stable content hash", () => {
    const result = parseLegalHtml(
      `<!doctype html><html><head><title>Zakon o radu</title></head><body>
        <nav>Navigacija</nav><main><h1>Zakon o radu</h1><p>Član 1.</p><p>(1) Овим законом уређују се права.</p><script>ignore()</script></main>
      </body></html>`,
      { sourceUrl: "https://example.test/law" },
    );

    expect(result.metadata.title).toBe("Zakon o radu");
    expect(result.rawText).toContain("Član 1.");
    expect(result.rawText).not.toContain("ignore");
    expect(result.sourceScript).toBe("MIXED");
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects pages without article markers", () => {
    expect(() =>
      parseLegalHtml(
        "<html><body><h1>Not a law</h1><p>Hello</p></body></html>",
        {
          sourceUrl: "https://example.test/not-law",
        },
      ),
    ).toThrow("article markers");
  });
});
