import { chunkText } from "./chunker";

function paragraphs(totalLength: number): string {
  const parts: string[] = [];
  let length = 0;
  let index = 0;
  while (length < totalLength) {
    const paragraph = `Paragraf ${index} `.padEnd(180 + (index % 5) * 40, "x");
    parts.push(paragraph);
    length += paragraph.length + 2;
    index += 1;
  }
  return parts.join("\n\n").slice(0, totalLength);
}

describe("chunkText", () => {
  it("returns no chunks for empty text", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns a single chunk for short text", () => {
    const text = "Kratak tekst.";
    expect(chunkText(text)).toEqual([
      { ordinal: 0, text, charStart: 0, charEnd: text.length },
    ]);
  });

  it("returns a single chunk for text of exactly the default size", () => {
    const text = "a".repeat(1500);
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      ordinal: 0,
      charStart: 0,
      charEnd: 1500,
    });
  });

  it("splits long text into bounded, overlapping, faithful chunks", () => {
    const source = paragraphs(4000);
    const chunks = chunkText(source);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, i) => {
      expect(chunk.ordinal).toBe(i);
      expect(chunk.text.length).toBeLessThanOrEqual(1500);
      expect(chunk.text).toBe(source.slice(chunk.charStart, chunk.charEnd));
    });
    expect(chunks[0].charStart).toBe(0);
    expect(chunks[chunks.length - 1].charEnd).toBe(source.length);
    for (let i = 1; i < chunks.length; i++) {
      const overlap = chunks[i - 1].charEnd - chunks[i].charStart;
      expect(overlap).toBeGreaterThanOrEqual(1);
      expect(overlap).toBeLessThanOrEqual(200);
      expect(chunks[i].charStart).toBeGreaterThan(chunks[i - 1].charStart);
    }
  });

  it("breaks on a paragraph boundary found in the last 300 chars of the window", () => {
    const source = `${"a".repeat(1300)}\n\n${"b".repeat(2000)}`;
    const [first] = chunkText(source);
    expect(first.charEnd).toBe(1302);
    expect(first.text.endsWith("\n\n")).toBe(true);
  });

  it("hard-splits text with no paragraph breaks and still terminates", () => {
    const source = "z".repeat(5000);
    const chunks = chunkText(source);
    expect(chunks[chunks.length - 1].charEnd).toBe(5000);
    chunks.forEach((chunk) =>
      expect(chunk.text.length).toBeLessThanOrEqual(1500),
    );
  });

  it("honours custom size and overlap", () => {
    const source = "w".repeat(300);
    const chunks = chunkText(source, { size: 100, overlap: 20 });
    chunks.forEach((chunk) =>
      expect(chunk.text.length).toBeLessThanOrEqual(100),
    );
    expect(chunks[1].charStart).toBe(chunks[0].charEnd - 20);
    expect(chunks[chunks.length - 1].charEnd).toBe(300);
  });
});
