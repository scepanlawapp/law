import {
  AI_ACCESS_OFF_MESSAGE,
  DocumentAccessPolicy,
  accessRefusalMessage,
} from "@law/chat";

const version = { contentId: "content-1" };

describe("DocumentAccessPolicy", () => {
  it("allows a live document with AI access on", () => {
    expect(
      DocumentAccessPolicy.forDocument({
        archivedAt: null,
        aiAccess: true,
        currentVersion: version,
      }),
    ).toEqual({ readable: true, contentId: "content-1" });
  });

  it("allows a not yet backfilled document (no content) without changing the decision", () => {
    expect(
      DocumentAccessPolicy.forDocument({
        archivedAt: null,
        aiAccess: true,
        currentVersion: { contentId: null },
      }),
    ).toEqual({ readable: true, contentId: null });
    expect(
      DocumentAccessPolicy.forDocument({
        archivedAt: null,
        aiAccess: false,
        currentVersion: { contentId: null },
      }),
    ).toEqual({ readable: false, reason: "AI_ACCESS_OFF" });
  });

  it("refuses a document with AI access off, whatever its content", () => {
    expect(
      DocumentAccessPolicy.forDocument({
        archivedAt: null,
        aiAccess: false,
        currentVersion: version,
      }),
    ).toEqual({ readable: false, reason: "AI_ACCESS_OFF" });
  });

  it("refuses an archived document even with AI access on", () => {
    expect(
      DocumentAccessPolicy.forDocument({
        archivedAt: new Date("2026-10-01T00:00:00Z"),
        aiAccess: true,
        currentVersion: version,
      }),
    ).toEqual({ readable: false, reason: "ARCHIVED" });
  });

  it("allows an unfiled attachment", () => {
    expect(
      DocumentAccessPolicy.forAttachment({
        contentId: "content-2",
        document: null,
      }),
    ).toEqual({ readable: true, contentId: "content-2" });
  });

  it("applies the filed document's AI access to its attachment", () => {
    expect(
      DocumentAccessPolicy.forAttachment({
        contentId: "content-2",
        document: { archivedAt: null, aiAccess: false },
      }),
    ).toEqual({ readable: false, reason: "AI_ACCESS_OFF" });
    expect(
      DocumentAccessPolicy.forAttachment({
        contentId: "content-2",
        document: { archivedAt: null, aiAccess: true },
      }),
    ).toEqual({ readable: true, contentId: "content-2" });
    expect(
      DocumentAccessPolicy.forAttachment({
        contentId: null,
        document: { archivedAt: new Date(), aiAccess: true },
      }),
    ).toEqual({ readable: false, reason: "ARCHIVED" });
  });

  it("words the refusal for the user", () => {
    expect(AI_ACCESS_OFF_MESSAGE("Ugovor")).toBe(
      'Dokument „Ugovor" nije dostupan asistentu (AI pristup je isključen). Korisnik ga može uključiti u detaljima dokumenta.',
    );
    expect(
      accessRefusalMessage({ readable: false, reason: "AI_ACCESS_OFF" }, "X"),
    ).toBe(AI_ACCESS_OFF_MESSAGE("X"));
    expect(
      accessRefusalMessage({ readable: false, reason: "ARCHIVED" }, "X"),
    ).toBeNull();
  });
});
