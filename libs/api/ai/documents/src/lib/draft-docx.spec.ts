import JSZip from "jszip";
import { renderDraftDocx } from "./draft-docx";

describe("renderDraftDocx", () => {
  it("renders Serbian Cyrillic, lists, and highlighted placeholders", async () => {
    const buffer = await renderDraftDocx({
      script: "cyrillic",
      text: [
        "# TUŽBA",
        "",
        "Tužilac je naveo činjenice.",
        "",
        "- Prvi dokaz",
        "1. Drugi dokaz",
        "",
        "Vrednost spora: [UNOS POTREBAN: vrednost spora]",
      ].join("\n"),
    });

    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");

    expect(documentXml).toContain("ТУЖБА");
    expect(documentXml).toContain("Први доказ");
    expect(documentXml).toContain("Други доказ");
    expect(documentXml).toContain("UNOS POTREBAN");
    expect(documentXml).toContain("w:highlight w:val=\"yellow\"");
  });

  it("keeps Latin text unchanged when Latin export is requested", async () => {
    const buffer = await renderDraftDocx({
      script: "latin",
      text: "Tužilac: Petar Petrović",
    });
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");

    expect(documentXml).toContain("Tužilac: Petar Petrović");
    expect(documentXml).not.toContain("Тужилац");
  });

  it("uses the document type as the title, in the export script", async () => {
    const titleOf = async (options: Parameters<typeof renderDraftDocx>[0]) => {
      const zip = await JSZip.loadAsync(await renderDraftDocx(options));
      return zip.file("docProps/core.xml")?.async("string");
    };

    expect(
      await titleOf({ script: "latin", text: "Tekst", title: "Žalba" }),
    ).toContain("<dc:title>Žalba</dc:title>");
    expect(
      await titleOf({ script: "cyrillic", text: "Tekst", title: "Žalba" }),
    ).toContain("<dc:title>Жалба</dc:title>");
    expect(await titleOf({ script: "latin", text: "Tekst" })).toContain(
      "<dc:title>Nacrt</dc:title>",
    );
  });
});
