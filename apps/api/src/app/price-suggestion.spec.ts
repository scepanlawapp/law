import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { WorkspaceContextService } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { PriceSuggestionContextBuilder } from "@law/financials";
import { PriceSuggestionDto } from "@law/financials";
import { PriceSuggestionService } from "@law/financials";
import { createPriceSuggestionAgent } from "@law/mastra";

jest.mock("@law/mastra", () => {
  const actual = jest.requireActual("@law/mastra");
  return { ...actual, createPriceSuggestionAgent: jest.fn() };
});

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";
const clientId = "33333333-3333-4333-a333-333333333333";
const caseId = "44444444-4444-4444-a444-444444444444";
const input = {
  clientId,
  caseId,
  title: "Priprema dela ugovora",
  workDate: "2026-10-13",
  minutes: 30,
  taskCompletionFraction: 0.1,
};
const run = <T>(fn: () => T, role = WorkspaceRole.ADMIN) =>
  WorkspaceContextService.run({ workspaceId, userId, role }, fn);

function setup() {
  // Only read methods exist: a database write fails this test immediately.
  const db = {
    client: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: clientId, displayName: "Klijent" }),
    },
    case: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: caseId, clientId, name: "Predmet" }),
    },
    task: { findFirst: jest.fn().mockResolvedValue(null) },
    event: { findFirst: jest.fn().mockResolvedValue(null) },
    serviceCategory: { findFirst: jest.fn().mockResolvedValue(null) },
    workEntry: {
      findFirst: jest.fn().mockResolvedValue({ userId }),
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { minutes: 120 } }),
    },
    priceSource: { findMany: jest.fn().mockResolvedValue([]) },
    retainerAgreement: { findMany: jest.fn().mockResolvedValue([]) },
    clientBillingProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    organizationSettings: {
      findFirst: jest.fn().mockResolvedValue({ defaultCurrencyCode: "RSD" }),
    },
  };
  const builder = new PriceSuggestionContextBuilder(db as never);
  return { db, builder, service: new PriceSuggestionService(builder) };
}
function source(id: string, scope: string, caseSpecific = false) {
  return {
    id,
    scope,
    title: id,
    caseId: caseSpecific ? caseId : null,
    sourceUrl: null,
    versions: [
      {
        id: id + "-v2",
        rawText: "Cena celog zadatka: 10000 RSD",
        effectiveFrom: null,
        effectiveTo: null,
      },
    ],
  };
}

describe("price suggestion context", () => {
  it("orders effective sources by retainer, case, client, profile, office, public, and scopes every query", async () => {
    const { db, builder } = setup();
    db.priceSource.findMany.mockResolvedValue([
      source("public", "WORKSPACE_PUBLIC_REFERENCE"),
      source("office", "COMPANY_CATALOG"),
      source("client", "CLIENT_AGREEMENT"),
      source("case", "CASE_OVERRIDE", true),
      { ...source("expired", "CASE_OVERRIDE", true), versions: [] },
    ]);
    db.retainerAgreement.findMany.mockResolvedValue([
      {
        id: "retainer",
        title: "Paušal",
        validFrom: new Date("2026-10-01"),
        categories: [],
      },
    ]);
    db.clientBillingProfile.findFirst.mockResolvedValue({
      id: "profile",
      hourlyRate: 100,
      currency: "RSD",
    });
    const context = await run(() => builder.build({ ...input, id: "edit-id" }));
    expect(context.orderedSources.map((s) => s.id)).toEqual([
      "retainer",
      "case",
      "client",
      "profile",
      "office",
      "public",
    ]);
    expect(context.orderedSources[0].facts).toMatchObject({
      usedMinutesExcludingCurrentEntry: 120,
    });
    expect(db.workEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId,
          id: { not: "edit-id" },
          workDate: {
            gte: new Date("2026-10-01"),
            lte: new Date(input.workDate),
          },
        }),
      }),
    );
    const query = db.priceSource.findMany.mock.calls[0][0];
    expect(query.include.versions.where).toMatchObject({
      workspaceId,
      AND: [
        {
          OR: [
            { effectiveFrom: null },
            { effectiveFrom: { lte: new Date(input.workDate) } },
          ],
        },
        {
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: new Date(input.workDate) } },
          ],
        },
      ],
    });
    for (const model of Object.values(db))
      for (const method of Object.values(model))
        for (const call of method.mock.calls)
          expect(call[0].where.workspaceId).toBe(workspaceId);
  });
  it("uses unsaved fields for an edit and excludes it from task history", async () => {
    const { db, builder } = setup();
    db.workEntry.findFirst.mockResolvedValue({
      userId,
      title: "Old",
      minutes: 999,
    });
    db.task.findFirst.mockResolvedValue({
      id: "task",
      clientId,
      caseId,
      title: "Ceo ugovor",
    });
    db.workEntry.findMany.mockResolvedValue([
      { title: "Raniji deo", minutes: 60 },
    ]);
    const context = await run(() =>
      builder.build({
        ...input,
        id: "edit",
        taskId: "task",
        additionalInformation: "Само припрема",
      }),
    );
    expect(context.workEvent).toMatchObject({
      minutes: 30,
      taskCompletionFraction: 0.1,
      additionalInformation: "Samo priprema",
    });
    expect(context.relatedWork).toHaveLength(1);
    expect(db.workEntry.findMany.mock.calls[0][0].where.id).toEqual({
      not: "edit",
    });
  });
  it("supports creation without an id", async () => {
    const { db, builder } = setup();
    await run(() => builder.build(input));
    expect(db.workEntry.findFirst).not.toHaveBeenCalled();
  });
  it("denies members and other lawyers entries before loading pricing", async () => {
    const { db, builder } = setup();
    await expect(
      run(() => builder.build(input), WorkspaceRole.MEMBER),
    ).rejects.toThrow("Finance access");
    db.workEntry.findFirst.mockResolvedValue({ userId: "someone-else" });
    await expect(
      run(() => builder.build({ ...input, id: "entry" }), WorkspaceRole.LAWYER),
    ).rejects.toThrow("Own work");
    expect(db.priceSource.findMany).not.toHaveBeenCalled();
  });
  it("rejects nonexistent and mismatched references", async () => {
    const { db, builder } = setup();
    db.case.findFirst.mockResolvedValue(null);
    await expect(run(() => builder.build(input))).rejects.toThrow(
      "Case not found",
    );
    db.case.findFirst.mockResolvedValue({
      id: caseId,
      clientId: "another-client",
    });
    await expect(run(() => builder.build(input))).rejects.toThrow(
      "Case does not belong",
    );
    expect(db.priceSource.findMany).not.toHaveBeenCalled();
  });
  it("does not include unrelated client/case prices in the query", async () => {
    const { db, builder } = setup();
    await run(() => builder.build({ title: "Rad", workDate: input.workDate }));
    expect(db.priceSource.findMany.mock.calls[0][0].where.OR).toEqual([
      {
        scope: { in: ["COMPANY_CATALOG", "WORKSPACE_PUBLIC_REFERENCE"] },
        clientId: null,
        caseId: null,
      },
    ]);
    expect(db.retainerAgreement.findMany).not.toHaveBeenCalled();
  });
});

describe("price suggestion request validation", () => {
  it.each([
    {},
    { workEvent: null },
    { workEvent: [] },
    { workEvent: { ...input, minutes: -1 } },
    { workEvent: { ...input, taskCompletionFraction: 2 } },
    { workEvent: { ...input, workDate: "2026-02-30" } },
  ])("rejects malformed payload %j", async (payload) => {
    expect(
      (await validate(plainToInstance(PriceSuggestionDto, payload))).length,
    ).toBeGreaterThan(0);
  });
  it("accepts a create snapshot and nullable duration", async () => {
    expect(
      await validate(
        plainToInstance(PriceSuggestionDto, {
          workEvent: { ...input, minutes: null },
        }),
      ),
    ).toEqual([]);
  });
});

describe("request-only pricing agent", () => {
  const generate = jest.fn();
  const originalKey = process.env.OPENROUTER_API_KEY;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    jest
      .mocked(createPriceSuggestionAgent)
      .mockReturnValue({ generate } as never);
    generate.mockResolvedValue({
      object: {
        suggestedPrice: 1000,
        currency: "RSD",
        explanation: "10000 × 0,1 = 1000 RSD",
        reviewRequired: false,
        confidence: "MEDIUM",
        missingInformation: [],
        warnings: [],
        sourceIds: ["case"],
      },
    });
  });
  afterAll(() => {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  });
  it("returns verified source metadata and forces review, without writes or conversation options", async () => {
    const { db, service } = setup();
    db.priceSource.findMany.mockResolvedValue([
      source("case", "CASE_OVERRIDE", true),
    ]);
    const result = await run(() => service.suggest(input));
    expect(result).toMatchObject({
      suggestedPrice: 1000,
      reviewRequired: true,
      sources: [{ id: "case", versionId: "case-v2", kind: "CASE_OVERRIDE" }],
    });
    const [messages, options] = generate.mock.calls[0];
    expect(
      JSON.parse(messages[0].content).workEvent.taskCompletionFraction,
    ).toBe(0.1);
    expect(options).not.toHaveProperty("memory");
    expect(options).not.toHaveProperty("threadId");
    expect(options).toHaveProperty("abortSignal");
  });
  it("does not call the agent when no price basis exists", async () => {
    const { service } = setup();
    expect(await run(() => service.suggest(input))).toMatchObject({
      suggestedPrice: null,
      reviewRequired: true,
      confidence: "LOW",
    });
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects fabricated sources and invalid model amounts", async () => {
    const { db, service } = setup();
    db.priceSource.findMany.mockResolvedValue([
      source("case", "CASE_OVERRIDE", true),
    ]);
    generate.mockResolvedValueOnce({
      object: { ...(await generate()).object, sourceIds: ["invented"] },
    });
    await expect(run(() => service.suggest(input))).rejects.toThrow(
      "temporarily unavailable",
    );
    generate.mockResolvedValueOnce({
      object: { ...(await generate()).object, suggestedPrice: -5 },
    });
    await expect(run(() => service.suggest(input))).rejects.toThrow(
      "temporarily unavailable",
    );
  });
  it("removes internal UUID references from user-facing narrative", async () => {
    const { db, service } = setup();
    db.priceSource.findMany.mockResolvedValue([
      source("case", "CASE_OVERRIDE", true),
    ]);
    const result = (await generate()).object;
    generate.mockResolvedValueOnce({
      object: {
        ...result,
        explanation:
          "Kategorija 'Pregovori' (ID: ff9fd8b0-f11d-4704-8359-e6961fe12463), ugovor 'Retainer' (ID: d6693f81-cb53-4ecc-b0c7-e90932816cbf). 1500 × (12 / 900) = 20 EUR.",
        warnings: [
          "Ugovor (d6693f81-cb53-4ecc-b0c7-e90932816cbf) zahteva proveru.",
        ],
        missingInformation: [
          "Proverite kategoriju [ID: ff9fd8b0-f11d-4704-8359-e6961fe12463].",
        ],
      },
    });
    const response = await run(() => service.suggest(input));
    expect(response.explanation).toBe(
      "Kategorija 'Pregovori', ugovor 'Retainer'. 1500 × (12 / 900) = 20 EUR.",
    );
    expect(response.warnings).toEqual(["Ugovor zahteva proveru."]);
    expect(response.missingInformation).toEqual(["Proverite kategoriju."]);
    expect(response.sources[0].id).toBe("case");
  });

  it("does not silently convert currencies", async () => {
    const { db, service } = setup();
    db.priceSource.findMany.mockResolvedValue([
      source("case", "CASE_OVERRIDE", true),
    ]);
    generate.mockResolvedValueOnce({
      object: { ...(await generate()).object, currency: "EUR" },
    });
    expect(await run(() => service.suggest(input))).toMatchObject({
      suggestedPrice: null,
      currency: "RSD",
      confidence: "LOW",
    });
  });
});
