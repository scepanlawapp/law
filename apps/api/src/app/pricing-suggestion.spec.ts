import {
  calculatePricingCandidate,
  PricingCandidate,
  PricingContext,
  PricingSuggestionService,
  PricingContextResolver,
  PricingSuggestionDto,
  PricingSuggestionController,
} from "@law/work-entries";
import { FakeChatModelProvider } from "@law/llm";
import { WorkspaceContextService } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Reflector, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import {
  HARDCODED_WORKSPACE_ID,
  PlatformPrismaService,
  WorkspaceAccessGuard,
  WorkspaceContextInterceptor,
} from "@law/core";

const context: PricingContext = {
  work: { title: "Sastavljanje tuzbe", workDate: "2026-10-10", minutes: 90 },
  facts: { claimValue: "100000", claimCurrency: "RSD" },
  clientName: null,
  caseName: null,
  warnings: [],
  sources: [
    {
      id: "source",
      sourceId: "source",
      versionId: "v1",
      version: 1,
      kind: "LEGAL_TARIFF",
      title: "Tarifa",
      reference: "Tarifni broj 1",
      sourceUrl: null,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      excerpt: "",
      text: "Cena 100 bodova. Bod 50 RSD. Satnica 8000 RSD. Naknada 2% RSD. Minimum 3000 RSD.",
      reliableDate: true,
    },
  ],
};
function candidate(
  formula: PricingCandidate["formula"] = "POINTS",
): PricingCandidate {
  return {
    formula,
    currency: "RSD",
    explanation: "Rad prema tarifi",
    evidence: [{ id: "source", excerpt: context.sources[0].text }],
    base: {
      value: "100",
      source: "EVIDENCE",
      key: "source",
      excerpt: "100 bodova",
    },
    unitValue: {
      value: "50",
      source: "EVIDENCE",
      key: "source",
      excerpt: "Bod 50 RSD",
    },
    quantity: null,
    adjustmentPercent: null,
    minimum: null,
    maximum: null,
  };
}
describe("pricing suggestion calculation", () => {
  it("calculates evidenced tariff points deterministically", () =>
    expect(calculatePricingCandidate(candidate(), context).suggestedPrice).toBe(
      "5000.00",
    ));
  it("calculates hourly work", () => {
    const input = candidate("HOURLY");
    input.base = {
      value: "8000",
      source: "EVIDENCE",
      key: "source",
      excerpt: "Satnica 8000 RSD",
    };
    input.unitValue = null;
    input.quantity = {
      value: "90",
      source: "FACT",
      key: "minutes",
      excerpt: "90",
    };
    expect(calculatePricingCandidate(input, context).suggestedPrice).toBe(
      "12000.00",
    );
  });
  it("calculates claim percentage with an evidenced minimum", () => {
    const input = candidate("CLAIM_PERCENT");
    input.base = {
      value: "100000",
      source: "FACT",
      key: "claimValue",
      excerpt: "100000",
    };
    input.unitValue = {
      value: "2",
      source: "EVIDENCE",
      key: "source",
      excerpt: "2% RSD",
    };
    input.minimum = {
      value: "3000",
      source: "EVIDENCE",
      key: "source",
      excerpt: "Minimum 3000 RSD",
    };
    expect(calculatePricingCandidate(input, context).suggestedPrice).toBe(
      "3000.00",
    );
  });
  it("rejects invented operands", () => {
    const input = candidate();
    if (input.base) input.base.value = "101";
    expect(() => calculatePricingCandidate(input, context)).toThrow(
      "OPERAND_NOT_EVIDENCED",
    );
  });
  it("rejects invented excerpts", () => {
    const input = candidate();
    input.evidence[0].excerpt = "Never present";
    expect(() => calculatePricingCandidate(input, context)).toThrow();
  });
  it("rejects unreliable historical dates", () =>
    expect(() =>
      calculatePricingCandidate(candidate(), {
        ...context,
        sources: [{ ...context.sources[0], reliableDate: false }],
      }),
    ).toThrow());
  it("never uses retainer fee as work value", () =>
    expect(() =>
      calculatePricingCandidate(candidate(), {
        ...context,
        sources: [{ ...context.sources[0], kind: "RETAINER" }],
      }),
    ).toThrow("RETAINER_IS_NOT_WORK_VALUE"));
  it("supports a public tariff with an exact effective-date clause", () => {
    const clause = "Ova tarifa se primenjuje od 1.1.2026.";
    const input = candidate();
    input.evidence[0].dateEvidence = {
      sourceId: "date",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      excerpt: clause,
    };
    expect(
      calculatePricingCandidate(input, {
        ...context,
        sources: [
          { ...context.sources[0], reliableDate: false },
          { ...context.sources[0], id: "date", text: clause },
        ],
      }).suggestedPrice,
    ).toBe("5000.00");
  });
  it("rejects future and mismatched-version date evidence", () => {
    const input = candidate();
    input.evidence[0].dateEvidence = {
      sourceId: "date",
      effectiveFrom: "2027-01-01",
      effectiveTo: null,
      excerpt: "Primenjuje se od 2027-01-01",
    };
    expect(() =>
      calculatePricingCandidate(input, {
        ...context,
        sources: [
          { ...context.sources[0], reliableDate: false },
          {
            ...context.sources[0],
            id: "date",
            text: "Primenjuje se od 2027-01-01",
          },
        ],
      }),
    ).toThrow("SOURCE_NOT_APPLICABLE_ON_WORK_DATE");
    expect(() =>
      calculatePricingCandidate(input, {
        ...context,
        sources: [
          { ...context.sources[0], reliableDate: false },
          {
            ...context.sources[0],
            id: "date",
            versionId: "v2",
            text: "Primenjuje se od 2027-01-01",
          },
        ],
      }),
    ).toThrow("UNVERIFIED_EVIDENCE_OR_DATE");
  });
  it("preserves a known fixed zero instead of unknown", () => {
    const input = candidate("FIXED");
    input.unitValue = null;
    input.base = {
      value: "0",
      source: "EVIDENCE",
      key: "source",
      excerpt: "0 RSD",
    };
    input.evidence[0].excerpt = "0 RSD";
    expect(
      calculatePricingCandidate(input, {
        ...context,
        sources: [{ ...context.sources[0], text: "0 RSD" }],
      }).suggestedPrice,
    ).toBe("0.00");
  });
  it("rounds the final hourly amount half up", () => {
    const input = candidate("HOURLY");
    input.unitValue = null;
    input.base = {
      value: "1",
      source: "EVIDENCE",
      key: "source",
      excerpt: "1 RSD",
    };
    input.evidence[0].excerpt = "1 RSD";
    input.quantity = {
      value: "1",
      source: "FACT",
      key: "minutes",
      excerpt: "1",
    };
    expect(
      calculatePricingCandidate(input, {
        ...context,
        work: { ...context.work, minutes: 1 },
        sources: [{ ...context.sources[0], text: "1 RSD" }],
      }).suggestedPrice,
    ).toBe("0.02");
  });
  it("rejects incompatible claim currency and unsupported formulas", () => {
    const input = candidate("CLAIM_PERCENT");
    input.base = {
      value: "100000",
      source: "FACT",
      key: "claimValue",
      excerpt: "100000",
    };
    input.unitValue = {
      value: "2",
      source: "EVIDENCE",
      key: "source",
      excerpt: "2% RSD",
    };
    expect(() =>
      calculatePricingCandidate(input, {
        ...context,
        facts: { ...context.facts, claimCurrency: "EUR" },
      }),
    ).toThrow("CLAIM_CURRENCY_MISMATCH");
    expect(() =>
      calculatePricingCandidate(candidate("UNSUPPORTED"), context),
    ).toThrow("UNSUPPORTED_FORMULA");
  });
});

describe("pricing suggestion orchestration", () => {
  it("calculates evidenced adjustments and rejects contradictory limits", () => {
    const input = candidate();
    const text = `${context.sources[0].text} Uvecanje 50%. Maksimum 6000 RSD.`;
    input.evidence[0].excerpt = text;
    input.adjustmentPercent = {
      value: "50",
      source: "EVIDENCE",
      key: "source",
      excerpt: "Uvecanje 50%",
    };
    input.maximum = {
      value: "6000",
      source: "EVIDENCE",
      key: "source",
      excerpt: "Maksimum 6000 RSD",
    };
    const adjusted = { ...context, sources: [{ ...context.sources[0], text }] };
    expect(calculatePricingCandidate(input, adjusted).suggestedPrice).toBe(
      "6000.00",
    );
    input.minimum = {
      value: "8000",
      source: "EVIDENCE",
      key: "source",
      excerpt: "8000 RSD",
    };
    expect(() => calculatePricingCandidate(input, adjusted)).toThrow(
      "CONFLICTING_LIMITS",
    );
  });
  it("recognizes Serbian dinar evidence without inferring a currency", () => {
    const input = candidate("FIXED");
    input.unitValue = null;
    input.evidence[0].excerpt = "Naknada 100 dinara";
    input.base = {
      value: "100",
      source: "EVIDENCE",
      key: "source",
      excerpt: "100 dinara",
    };
    const adjusted = {
      ...context,
      sources: [{ ...context.sources[0], text: "Naknada 100 dinara" }],
    };
    expect(calculatePricingCandidate(input, adjusted).currency).toBe("RSD");
    input.currency = "EUR";
    expect(() => calculatePricingCandidate(input, adjusted)).toThrow(
      "CURRENCY_NOT_EVIDENCED",
    );
  });
  it("does not treat publication dates as effective-date evidence", () => {
    const input = candidate();
    input.evidence[0].dateEvidence = {
      sourceId: "date",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      excerpt: "Objavljeno 2026-01-01",
    };
    expect(() =>
      calculatePricingCandidate(input, {
        ...context,
        sources: [
          { ...context.sources[0], reliableDate: false },
          { ...context.sources[0], id: "date", text: "Objavljeno 2026-01-01" },
        ],
      }),
    ).toThrow("UNVERIFIED_EVIDENCE_OR_DATE");
  });
  const request: PricingSuggestionDto = { kind: "UNSAVED", work: context.work };
  const result = (candidates = [candidate()]) => ({
    status: "SUGGESTED",
    explanation: "Cena rada prema izvorima",
    missingInformation: [],
    candidates,
  });
  const resolver = {
    resolve: jest.fn(async () => ({
      ...context,
      warnings: [...context.warnings],
    })),
  };
  beforeEach(() => jest.clearAllMocks());
  it("returns a read-only supported tariff suggestion", async () => {
    const service = new PricingSuggestionService(
      resolver as never,
      new FakeChatModelProvider(result()),
    );
    const response = await service.suggest(request);
    expect(response).toMatchObject({
      status: "SUGGESTED",
      suggestedPrice: "5000.00",
      currency: "RSD",
      reviewRequired: true,
    });
    expect(response.sources[0]).toMatchObject({
      versionId: "v1",
      reference: "Tarifni broj 1",
    });
  });
  it("returns supported alternatives without assigning priority", async () => {
    const second = candidate("FIXED");
    second.unitValue = null;
    const service = new PricingSuggestionService(
      resolver as never,
      new FakeChatModelProvider(result([candidate(), second])),
    );
    const response = await service.suggest(request);
    expect(response.status).toBe("NEEDS_REVIEW");
    expect(response.suggestedPrice).toBeNull();
    expect(response.alternatives.map((item) => item.suggestedPrice)).toEqual([
      "5000.00",
      "100.00",
    ]);
    expect(response.warnings).toContain("SOURCE_PRIORITY_UNDEFINED");
  });
  it("returns actionable facts and accepts them on a second request", async () => {
    const provider = new FakeChatModelProvider([
      {
        status: "NEEDS_INFORMATION",
        explanation: "Nedostaje vrednost spora",
        missingInformation: [
          {
            key: "claimValue",
            label: "Vrednost spora",
            type: "DECIMAL",
            reason: "Tarifni raspon zavisi od vrednosti spora",
          },
        ],
        candidates: [],
      },
      result(),
    ]);
    const service = new PricingSuggestionService(resolver as never, provider);
    const first = await service.suggest(request);
    expect(first.status).toBe("NEEDS_INFORMATION");
    expect(first.missingInformation[0].key).toBe("claimValue");
    expect(first.suggestedPrice).toBeNull();
    const followup = {
      ...request,
      pricingFacts: { claimValue: "100000", claimCurrency: "RSD" },
    };
    expect((await service.suggest(followup)).status).toBe("SUGGESTED");
    expect(resolver.resolve).toHaveBeenLastCalledWith(followup);
  });
  it("distinguishes unsupported work and rejected evidence", async () => {
    const service = new PricingSuggestionService(
      resolver as never,
      new FakeChatModelProvider({ ...result([]), status: "UNSUPPORTED" }),
    );
    expect((await service.suggest(request)).status).toBe("UNSUPPORTED");
    const forged = candidate();
    forged.evidence[0].excerpt = "invented";
    const invalid = new PricingSuggestionService(
      resolver as never,
      new FakeChatModelProvider(result([forged])),
    );
    expect(await invalid.suggest(request)).toMatchObject({
      status: "NEEDS_REVIEW",
      suggestedPrice: null,
      alternatives: [],
    });
  });
  it("degrades invalid model output without exposing it", async () => {
    const service = new PricingSuggestionService(
      resolver as never,
      new FakeChatModelProvider({ secret: "sensitive" }),
    );
    const response = await service.suggest(request);
    expect(response.status).toBe("NEEDS_REVIEW");
    expect(JSON.stringify(response)).not.toContain("sensitive");
  });
  it("does not approve overlapping source versions", async () => {
    const service = new PricingSuggestionService(
      {
        resolve: async () => ({
          ...context,
          warnings: ["MULTIPLE_APPLICABLE_SOURCE_VERSIONS"],
        }),
      } as never,
      new FakeChatModelProvider(result()),
    );
    expect((await service.suggest(request)).suggestedPrice).toBeNull();
  });
  it("aborts a hung model call and clears the deadline", async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    const provider = {
      completeStructured: jest.fn((input) => {
        signal = input.abortSignal;
        return new Promise(() => undefined);
      }),
    };
    try {
      const service = new PricingSuggestionService(
        resolver as never,
        provider as never,
      );
      const pending = service.suggest(request);
      await jest.advanceTimersByTimeAsync(20001);
      expect((await pending).suggestedPrice).toBeNull();
      expect(signal?.aborted).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("pricing context authorization and reads", () => {
  const manager = {
    workspaceId: "workspace",
    userId: "user",
    role: WorkspaceRole.OWNER,
  };
  function setup() {
    const write = jest.fn(() => {
      throw new Error("Writes forbidden");
    });
    const db = {
      client: {
        findFirst: jest.fn(async () => ({
          id: "client",
          displayName: "Client",
        })),
        create: write,
        update: write,
      },
      case: {
        findFirst: jest.fn(async () => ({
          id: "case",
          clientId: "client",
          name: "Case",
          caseNumber: "P1",
        })),
      },
      serviceCategory: { findFirst: jest.fn(async () => ({ id: "category" })) },
      priceSourceVersion: { findMany: jest.fn(async () => []) },
      clientBillingProfile: { findFirst: jest.fn(async () => null) },
      retainerAgreement: { findMany: jest.fn(async () => []) },
      legalChunk: { findMany: jest.fn(async () => []) },
      workEntry: { create: write, update: write },
      invoice: { create: write },
      $transaction: write,
    };
    const entries = {
      get: jest.fn(async () => ({
        title: context.work.title,
        description: "",
        workDate: context.work.workDate,
        minutes: 90,
        client: { id: "client" },
        case: null,
        serviceCategory: null,
      })),
    };
    const knowledge = { search: jest.fn(async () => []) };
    return {
      db,
      entries,
      knowledge,
      write,
      resolver: new PricingContextResolver(
        db as never,
        entries as never,
        knowledge as never,
      ),
    };
  }
  it("enforces finance permissions before any reads or model calls", async () => {
    const { resolver, db } = setup();
    await expect(
      WorkspaceContextService.run(
        { ...manager, role: WorkspaceRole.LAWYER },
        () => resolver.resolve({ kind: "UNSAVED", work: context.work }),
      ),
    ).rejects.toThrow("finance manager");
    expect(db.priceSourceVersion.findMany).not.toHaveBeenCalled();
  });
  it("loads saved and unsaved work without writes and scopes every business read", async () => {
    const { resolver, db, entries, write } = setup();
    const saved = await WorkspaceContextService.run(manager, () =>
      resolver.resolve({ kind: "SAVED", workEntryId: "entry" }),
    );
    const unsaved = await WorkspaceContextService.run(manager, () =>
      resolver.resolve({
        kind: "UNSAVED",
        work: { ...context.work, clientId: "client" },
        pricingFacts: context.facts,
      }),
    );
    expect(saved.work.title).toBe(unsaved.work.title);
    expect(entries.get).toHaveBeenCalledWith("entry");
    expect(write).not.toHaveBeenCalled();
    expect(db.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "client", workspaceId: "workspace" },
      }),
    );
    expect(db.priceSourceVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "workspace" }),
      }),
    );
    expect(unsaved.facts).toEqual(context.facts);
  });
  it("rejects foreign clients and mismatched case ownership", async () => {
    const { resolver, db } = setup();
    db.client.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      WorkspaceContextService.run(manager, () =>
        resolver.resolve({
          kind: "UNSAVED",
          work: { ...context.work, clientId: "foreign" },
        }),
      ),
    ).rejects.toThrow("Client not found");
    await expect(
      WorkspaceContextService.run(manager, () =>
        resolver.resolve({
          kind: "UNSAVED",
          work: { ...context.work, clientId: "other", caseId: "case" },
        }),
      ),
    ).rejects.toThrow("Case does not belong");
  });
  it("rejects ambiguous payloads and impossible work dates", async () => {
    const { resolver } = setup();
    await expect(
      WorkspaceContextService.run(manager, () =>
        resolver.resolve({
          kind: "SAVED",
          workEntryId: "entry",
          work: context.work,
        }),
      ),
    ).rejects.toThrow("not both");
    await expect(
      WorkspaceContextService.run(manager, () =>
        resolver.resolve({
          kind: "UNSAVED",
          work: { ...context.work, workDate: "2026-02-30" },
        }),
      ),
    ).rejects.toThrow("Invalid work date");
  });
  it("validates nested facts and rejects undeclared properties", async () => {
    const body = plainToInstance(PricingSuggestionDto, {
      kind: "UNSAVED",
      work: context.work,
      pricingFacts: {
        claimValue: "100000",
        claimCurrency: "RSD",
        representedParties: 2,
      },
    });
    expect(
      await validate(body, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    body.pricingFacts = { representedParties: 0, claimValue: "NaN" };
    expect((await validate(body)).length).toBeGreaterThan(0);
    const extra = plainToInstance(PricingSuggestionDto, {
      kind: "UNSAVED",
      work: { ...context.work, value: "100" },
    });
    expect(
      (await validate(extra, { whitelist: true, forbidNonWhitelisted: true }))
        .length,
    ).toBeGreaterThan(0);
  });
});

describe("pricing suggestion HTTP boundary", () => {
  let app: INestApplication;
  let url: string;
  let role = "OWNER";
  const suggest = jest.fn(async () => ({
    status: "NEEDS_INFORMATION",
    suggestedPrice: null,
    missingInformation: [{ key: "claimValue", type: "DECIMAL" }],
  }));
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PricingSuggestionController],
      providers: [
        { provide: PricingSuggestionService, useValue: { suggest } },
        {
          provide: PlatformPrismaService,
          useValue: {
            workspaceMember: {
              findUnique: jest.fn(async () => ({
                workspaceId: HARDCODED_WORKSPACE_ID,
                role,
                status: "ACTIVE",
              })),
            },
          },
        },
        WorkspaceAccessGuard,
        WorkspaceContextService,
        Reflector,
        { provide: APP_INTERCEPTOR, useClass: WorkspaceContextInterceptor },
      ],
    })
      .overrideGuard(CsrfOriginGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (execution: ExecutionContext) => {
          const request = execution.switchToHttp().getRequest();
          if (request.headers.cookie !== "law_session=test")
            throw new UnauthorizedException();
          request.auth = {
            user: { id: "11111111-1111-4111-8111-111111111111" },
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    role = "OWNER";
    jest.clearAllMocks();
  });
  const post = (body: unknown, authenticated = true) =>
    fetch(`${url}/api/work-entries/pricing-suggestion`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authenticated ? { cookie: "law_session=test" } : {}),
      },
      body: JSON.stringify(body),
    });
  it("validates structured facts and returns no-store responses", async () => {
    const response = await post({
      kind: "UNSAVED",
      work: context.work,
      pricingFacts: { claimValue: "100000", claimCurrency: "RSD" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      status: "NEEDS_INFORMATION",
      suggestedPrice: null,
    });
    expect(suggest).toHaveBeenCalledWith(
      expect.objectContaining({
        pricingFacts: expect.objectContaining({ claimValue: "100000" }),
      }),
    );
  });
  it("rejects unauthenticated and non-manager requests before interpretation", async () => {
    expect(
      (await post({ kind: "UNSAVED", work: context.work }, false)).status,
    ).toBe(401);
    role = "LAWYER";
    expect((await post({ kind: "UNSAVED", work: context.work })).status).toBe(
      403,
    );
    expect(suggest).not.toHaveBeenCalled();
  });
  it("rejects unknown fields, invalid facts and missing saved IDs", async () => {
    expect((await post({ kind: "SAVED" })).status).toBe(400);
    expect(
      (
        await post({
          kind: "UNSAVED",
          work: context.work,
          pricingFacts: { representedParties: -1 },
        })
      ).status,
    ).toBe(400);
    expect(
      (await post({ kind: "UNSAVED", work: { ...context.work, value: "999" } }))
        .status,
    ).toBe(400);
    expect(suggest).not.toHaveBeenCalled();
  });
});
