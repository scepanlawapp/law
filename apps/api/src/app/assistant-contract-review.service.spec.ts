import type { ChatStreamEvent } from "@law/api-interfaces";
import { FakeChatModelProvider } from "@law/llm";
import type { AssistantTurnScope } from "@law/mastra";
import {
  AssistantContractReviewService,
  ChatEventBus,
  ChatRuntimeConfig,
} from "@law/chat";

const scope: AssistantTurnScope = {
  workspaceId: "workspace-1",
  sessionId: "session-1",
  jobId: "job-turn",
  correlationId: "corr-1",
  messageId: "message-1",
  language: "sr",
  userId: "user-1",
  userDisplayName: "Ana Advokat",
};

const review = {
  summary: "NDA između Alfa i Beta.",
  keyTerms: [{ label: "Trajanje", value: "neograničeno", clause: "Član 6" }],
  issues: [
    {
      title: "Stilska nejasnoća",
      category: "RISK",
      risk: "LOW",
      clause: null,
      quote: null,
      explanation: "Nejasno.",
      suggestion: null,
      citations: [],
    },
    {
      title: "Neograničeno trajanje",
      category: "RISK",
      risk: "HIGH",
      clause: "Član 6",
      quote: "obaveza traje neograničeno",
      explanation: "Nesrazmerno za primaoca.",
      suggestion: "Ograničiti na 3 godine.",
      citations: [1],
    },
  ],
  missingClauses: [
    { title: "Vraćanje informacija", explanation: "Nema.", suggestion: null },
  ],
  warnings: [],
  usedCitations: [1],
};

function setup(options: {
  documents?: unknown[];
  outputs?: unknown[];
  withReads?: boolean;
}) {
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    documentAnalysis: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: "analysis-1",
          createdAt: new Date("2026-10-07T09:00:00.000Z"),
          ...data,
        };
        created.push(row);
        return Promise.resolve(row);
      }),
    },
  };
  const events = new ChatEventBus();
  const emitted: ChatStreamEvent[] = [];
  events.stream("session-1").subscribe((event) => emitted.push(event));
  const documentReads = {
    documentsByRef: jest.fn().mockResolvedValue(
      options.documents ?? [
        {
          id: "att:nda",
          name: "NDA Alfa",
          mimeType: "nda.pdf",
          status: "COMPLETED",
          text: "Član 6. Obaveza traje neograničeno.",
        },
      ],
    ),
  };
  const matterLink = { sessionCaseId: jest.fn().mockResolvedValue("case-1") };
  const provider = new FakeChatModelProvider(options.outputs ?? [review]);
  const completeStructured = jest.spyOn(provider, "completeStructured");
  const legalKnowledge = {
    search: jest.fn().mockResolvedValue([
      {
        id: "chunk-1",
        text: "Poslovna tajna je informacija…",
        score: 0.9,
        source: {
          title: "Zakon o zaštiti poslovne tajne",
          publisher: "Paragraf Lex",
          sourceUrl: "https://www.paragraf.rs/",
          jurisdiction: "RS",
        },
        articleNumber: "4",
        paragraphNumber: null,
        pointNumber: null,
      },
    ]),
  };
  const service = new AssistantContractReviewService(
    prisma as never,
    events,
    new ChatRuntimeConfig(),
    matterLink as never,
    options.withReads === false ? undefined : (documentReads as never),
    provider,
    legalKnowledge as never,
  );
  return {
    service,
    prisma,
    created,
    emitted,
    documentReads,
    completeStructured,
    legalKnowledge,
  };
}

describe("AssistantContractReviewService", () => {
  it("reviews a document, stores the analysis on the session's case, and announces it", async () => {
    const {
      service,
      created,
      emitted,
      documentReads,
      completeStructured,
      legalKnowledge,
    } = setup({});

    const result = await service.reviewContract(scope, {
      documentRef: " att:nda ",
      contractType: "NDA",
      clientSide: "Прималац Бета",
    });

    expect(documentReads.documentsByRef).toHaveBeenCalledWith(scope, [
      "att:nda",
    ]);
    expect(legalKnowledge.search).toHaveBeenCalledWith(
      "Zakon o obligacionim odnosima (ZOO) i Zakon o zaštiti poslovne tajne",
      expect.any(Number),
      "workspace-1",
    );
    const system = completeStructured.mock.calls[0][0].messages[0].content;
    expect(system).toContain("Kancelarija zastupa: Primalac Beta");
    expect(created[0]).toMatchObject({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      caseId: "case-1",
      jobId: "job-turn",
      kind: "CONTRACT_REVIEW",
      documentRef: "att:nda",
      documentTitle: "NDA Alfa",
      contractType: "NDA",
      clientSide: "Primalac Beta",
      truncated: false,
      citations: [
        expect.objectContaining({
          marker: 1,
          sourceTitle: "Zakon o zaštiti poslovne tajne",
        }),
      ],
    });
    expect(emitted.at(-1)).toMatchObject({
      type: "analysis.updated",
      correlationId: "corr-1",
      analysis: {
        id: "analysis-1",
        contractType: "NDA",
        result: expect.objectContaining({
          issues: [
            expect.objectContaining({ title: "Neograničeno trajanje" }),
            expect.objectContaining({ title: "Stilska nejasnoća" }),
          ],
        }),
      },
    });
    expect(result).toEqual({
      status: "REVIEW_READY",
      analysisId: "analysis-1",
      documentTitle: "NDA Alfa",
      contractType: "Ugovor o poverljivosti",
      summary: "NDA između Alfa i Beta.",
      issueCounts: { high: 1, medium: 0, low: 1 },
      topIssues: [
        {
          title: "Neograničeno trajanje",
          risk: "HIGH",
          category: "RISK",
          clause: "Član 6",
        },
        {
          title: "Stilska nejasnoća",
          risk: "LOW",
          category: "RISK",
          clause: null,
        },
      ],
      missingClauses: ["Vraćanje informacija"],
      citationCount: 1,
      truncated: false,
    });
  });

  it("reports an unknown document without calling the model", async () => {
    const { service, prisma, completeStructured } = setup({ documents: [] });

    await expect(
      service.reviewContract(scope, {
        documentRef: "doc:missing",
        contractType: "OTHER_CONTRACT",
      }),
    ).resolves.toMatchObject({ status: "NOT_FOUND" });
    expect(completeStructured).not.toHaveBeenCalled();
    expect(prisma.documentAnalysis.create).not.toHaveBeenCalled();
  });

  it("reports a document without readable text", async () => {
    const { service, completeStructured } = setup({
      documents: [
        {
          id: "doc:scan",
          name: "Sken",
          mimeType: "scan.png",
          status: "FAILED",
        },
      ],
    });

    await expect(
      service.reviewContract(scope, {
        documentRef: "doc:scan",
        contractType: "SERVICES_CONTRACT",
      }),
    ).resolves.toMatchObject({
      status: "NO_TEXT",
      message: expect.stringContaining("Sken"),
    });
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it("returns FAILED and stores nothing when the model output is invalid", async () => {
    const { service, prisma } = setup({ outputs: [{ summary: 3 }] });

    await expect(
      service.reviewContract(scope, {
        documentRef: "att:nda",
        contractType: "NDA",
      }),
    ).resolves.toMatchObject({ status: "FAILED" });
    expect(prisma.documentAnalysis.create).not.toHaveBeenCalled();
  });

  it("is unavailable without document reads", async () => {
    const { service } = setup({ withReads: false });

    await expect(
      service.reviewContract(scope, {
        documentRef: "att:nda",
        contractType: "NDA",
      }),
    ).resolves.toMatchObject({ status: "FAILED" });
  });
});
