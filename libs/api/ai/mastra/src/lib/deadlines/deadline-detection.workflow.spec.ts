import { FakeChatModelProvider } from "@law/llm";
import {
  createDeadlineDetectionWorkflow,
  runDeadlineDetectionWorkflow,
  type DeadlineDetectionInput,
} from "./deadline-detection.workflow";

const presuda = [
  "OSNOVNI SUD U BEOGRADU P 123/2026 dana 15.09.2026.",
  "PRESUDA: ODBIJA SE tužbeni zahtev.",
  "POUKA O PRAVNOM LEKU: Protiv ove presude dozvoljena je žalba u roku od 15 dana od dana prijema.",
].join("\n");

function input(
  overrides: Partial<DeadlineDetectionInput> = {},
): DeadlineDetectionInput {
  return {
    documentTitle: "Presuda.pdf",
    text: presuda,
    serviceDate: "2026-10-02",
    today: "2026-10-07",
    maxChars: 40_000,
    ...overrides,
  };
}

const classified = {
  actKind: "FIRST_INSTANCE_JUDGMENT",
  civilProcedure: "GENERAL",
  actTitle: "Presuda P 123/2026",
  caseNumber: "P 123/2026",
  decisionDate: "2026-09-15",
  remedyQuote: "dozvoljena je žalba u roku od 15 dana",
  statedPeriodDays: 15,
  // The model must not compute: a deadline it returns is ignored.
  dueDate: "2026-10-30",
};

describe("deadline-detection workflow", () => {
  it("classifies with the model and computes the date by the rules", async () => {
    const provider = new FakeChatModelProvider(classified);
    const workflow = createDeadlineDetectionWorkflow({ provider });

    const result = await runDeadlineDetectionWorkflow(workflow, input());

    expect(result.outcome).toMatchObject({
      status: "COMPUTED",
      dueDate: "2026-10-19",
      rule: { days: 15, legalBasis: "ZPP čl. 367 st. 1" },
    });
    expect(result.truncated).toBe(false);
    expect(result.promptChars).toBe(presuda.length);
  });

  it("asks for the service date when none is known", async () => {
    const provider = new FakeChatModelProvider(classified);
    const result = await runDeadlineDetectionWorkflow(
      createDeadlineDetectionWorkflow({ provider }),
      input({ serviceDate: null }),
    );
    expect(result.outcome.status).toBe("NEEDS_SERVICE_DATE");
  });

  it("fails when the model output is invalid", async () => {
    const provider = new FakeChatModelProvider({ warnings: "x" });
    await expect(
      runDeadlineDetectionWorkflow(
        createDeadlineDetectionWorkflow({ provider }),
        input(),
      ),
    ).rejects.toThrow();
  });
});
