import { FakeChatModelProvider } from "@law/llm";
import { WorkspaceContextService } from "@law/core";
import { WorkCaptureService, parseWorkCapture } from "@law/work-entries";
import { WorkspaceRole } from "@law/api-interfaces";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";

const clientRow = (id: string, displayName: string) => ({
  id,
  clientNumber: `K-${id}`,
  type: "COMPANY",
  displayName,
  status: "ACTIVE",
});

const output = (overrides: Record<string, unknown> = {}) => ({
  clientName: "Delta Medija",
  caseHint: null,
  minutes: 30,
  categoryName: "pregled ugovora",
  description: "Telefonski razgovor oko ugovora o licenci",
  ...overrides,
});

describe("work capture parsing", () => {
  const db = {
    serviceCategory: { findMany: jest.fn() },
    client: { findMany: jest.fn() },
    case: { findMany: jest.fn() },
  };
  const run = <T>(fn: () => Promise<T>) =>
    WorkspaceContextService.run(
      {
        workspaceId,
        userId,
        role: WorkspaceRole.OWNER,
      } as never,
      fn,
    );
  const serviceFor = (provider: unknown) =>
    new WorkCaptureService(db as never, provider as never);

  beforeEach(() => {
    jest.resetAllMocks();
    db.serviceCategory.findMany.mockResolvedValue([
      { id: "cat-1", name: "Pregled ugovora", active: true, order: 0 },
    ]);
    db.client.findMany.mockResolvedValue([
      clientRow("c-1", "Delta Medija d.o.o."),
      clientRow("c-2", "Marko Petrović"),
    ]);
    db.case.findMany.mockResolvedValue([]);
  });

  it("resolves a single client and the category", async () => {
    db.client.findMany.mockResolvedValue([clientRow("c-1", "Delta Medija")]);
    const result = await run(() =>
      serviceFor(new FakeChatModelProvider(output())).parse(
        "Pola sata telefonom sa Markom iz Delta Medije",
      ),
    );
    expect(result).toMatchObject({
      ok: true,
      clientId: "c-1",
      clientCandidates: [],
      serviceCategoryId: "cat-1",
      minutes: 30,
    });
  });

  it("lists candidates and leaves the id null when several clients match", async () => {
    db.client.findMany.mockResolvedValue([
      clientRow("c-1", "Delta Medija"),
      clientRow("c-2", "Delta Holding"),
      clientRow("c-3", "Marko Petrović"),
    ]);
    const result = await run(() =>
      serviceFor(
        new FakeChatModelProvider(output({ clientName: "Delta" })),
      ).parse("sat vremena za Deltu"),
    );
    expect(result.ok).toBe(true);
    expect(result.clientId).toBeNull();
    expect(result.clientCandidates.map((client) => client.id)).toEqual([
      "c-1",
      "c-2",
    ]);
  });

  it("matches names without diacritics and constrains the case to the client", async () => {
    db.client.findMany.mockResolvedValue([clientRow("c-2", "Marko Petrović")]);
    db.case.findMany.mockResolvedValue([
      {
        id: "k-1",
        caseNumber: "P-2026-001",
        name: "Ugovor o licenci",
        status: "ACTIVE",
        priority: "NORMAL",
      },
    ]);
    const result = await run(() =>
      serviceFor(
        new FakeChatModelProvider(
          output({
            clientName: "marko petrovic",
            caseHint: "licenci",
            categoryName: null,
          }),
        ),
      ).parse("x"),
    );
    expect(result).toMatchObject({
      clientId: "c-2",
      caseId: "k-1",
      serviceCategoryId: null,
    });
    expect(db.case.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId,
      clientId: "c-2",
    });
  });

  it("returns ok:false when the provider throws", async () => {
    const provider = {
      completeStructured: jest.fn().mockRejectedValue(new Error("boom")),
    };
    const result = await run(() => serviceFor(provider).parse("x"));
    expect(result).toMatchObject({
      ok: false,
      clientId: null,
      clientCandidates: [],
      minutes: null,
    });
  });

  it("returns ok:false when the output fails the schema", async () => {
    const result = await run(() =>
      serviceFor(new FakeChatModelProvider(output({ minutes: 2000 }))).parse(
        "x",
      ),
    );
    expect(result.ok).toBe(false);
  });

  it("returns ok:false without a key or injected provider", async () => {
    const previous = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const result = await run(() =>
        new WorkCaptureService(db as never).parse("x"),
      );
      expect(result.ok).toBe(false);
    } finally {
      if (previous !== undefined) process.env.OPENROUTER_API_KEY = previous;
    }
  });

  it("passes the date and categories to the model", async () => {
    const provider = {
      completeStructured: jest.fn().mockResolvedValue(output()),
    };
    await run(() => serviceFor(provider).parse("x"));
    const prompt = provider.completeStructured.mock.calls[0][0].messages[1]
      .content as string;
    expect(prompt).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(prompt).toContain("Pregled ugovora");
  });

  it("parseWorkCapture rejects non-integer minutes", async () => {
    await expect(
      parseWorkCapture(new FakeChatModelProvider(output({ minutes: 1.5 })), {
        text: "x",
        today: "2026-10-04",
        categories: [],
      }),
    ).rejects.toThrow();
  });
});
