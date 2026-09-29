import { CaseSummary } from "@law/api-interfaces";
import {
  clientIdForCase,
  compatibleCaseId,
  eventClientIds,
} from "./event-dialog.utils";

const caseItem = {
  id: "case-1",
  client: { id: "client-1" },
} as CaseSummary;

describe("event dialog client helpers", () => {
  it("maps the optional selected client to the event API shape", () => {
    expect(eventClientIds("client-1")).toEqual(["client-1"]);
    expect(eventClientIds("")).toEqual([]);
  });

  it("derives the client when a case is selected", () => {
    expect(clientIdForCase([caseItem], "case-1")).toBe("client-1");
    expect(clientIdForCase([caseItem], "missing")).toBeUndefined();
  });

  it("clears a case that does not belong to the selected client", () => {
    expect(compatibleCaseId([caseItem], "case-1", "client-1")).toBe("case-1");
    expect(compatibleCaseId([caseItem], "case-1", "client-2")).toBe("");
  });
});
