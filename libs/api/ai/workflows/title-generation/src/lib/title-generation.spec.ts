import { FakeChatModelProvider } from "@law/llm";
import { buildTitleUserPrompt } from "./context";
import { generateTitle } from "./runner";
import { titleSchema } from "./schema";

describe("titleSchema", () => {
  it("parses a populated title", () => {
    expect(titleSchema.parse({ title: "Tužba za naknadu štete" })).toEqual({
      title: "Tužba za naknadu štete",
    });
  });

  it("trims whitespace", () => {
    expect(titleSchema.parse({ title: "  Ugovor o zakupu  " })).toEqual({
      title: "Ugovor o zakupu",
    });
  });

  it("rejects an empty title", () => {
    expect(() => titleSchema.parse({ title: "   " })).toThrow();
  });
});

describe("buildTitleUserPrompt", () => {
  it("includes the message text and attachment previews", () => {
    const result = buildTitleUserPrompt({
      messageContent: "Treba mi tužba za naknadu štete",
      attachments: [
        {
          originalName: "presuda.pdf",
          mimeType: "application/pdf",
          text: "Prvi osnovni sud u Beogradu.",
        },
      ],
      perAttachmentMaxChars: 300,
    });

    expect(result.prompt).toContain("tužba za naknadu štete");
    expect(result.prompt).toContain("presuda.pdf");
    expect(result.prompt).toContain("Prvi osnovni sud u Beogradu.");
    expect(result.truncated).toBe(false);
  });

  it("truncates long attachment previews to the budget", () => {
    const result = buildTitleUserPrompt({
      messageContent: "Razvod braka",
      attachments: [
        {
          originalName: "dugo.txt",
          mimeType: "text/plain",
          text: "a".repeat(1000),
        },
      ],
      perAttachmentMaxChars: 100,
    });

    expect(result.truncated).toBe(true);
    expect(result.prompt).toContain("…");
  });

  it("marks attachments without extracted text", () => {
    const result = buildTitleUserPrompt({
      messageContent: "(attachment)",
      attachments: [
        {
          originalName: "scan.png",
          mimeType: "image/png",
          text: "",
        },
      ],
      perAttachmentMaxChars: 300,
    });

    expect(result.prompt).toContain("[text not yet extracted]");
    expect(result.truncated).toBe(false);
  });

  it("renders a no-attachments block", () => {
    const result = buildTitleUserPrompt({
      messageContent: "Zdravo",
      attachments: [],
      perAttachmentMaxChars: 300,
    });

    expect(result.prompt).toContain("No attachments.");
  });
});

describe("generateTitle", () => {
  it("resolves a structured title from the provider", async () => {
    const provider = new FakeChatModelProvider({ title: "Tužba za štetu" });

    await expect(
      generateTitle(provider, "First user message:\nTužba za štetu"),
    ).resolves.toEqual({ title: "Tužba za štetu" });
  });

  it("rejects when the provider returns an invalid shape", async () => {
    const provider = new FakeChatModelProvider({ title: "" });

    await expect(
      generateTitle(provider, "First user message:\nX"),
    ).rejects.toThrow();
  });
});