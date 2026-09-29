import { CaseSummary } from "@law/api-interfaces";
import {
  clientIdForCase,
  compatibleCaseId,
  withCaseClient,
} from "./event-dialog.utils";

const caseItem = {
  id: "case-1",
  client: { id: "client-1" },
} as CaseSummary;

describe("event dialog client helpers", () => {
  it("adds the selected case client without dropping other clients", () => {
    expect(withCaseClient([caseItem], "case-1", ["client-2"])).toEqual([
      "client-2",
      "client-1",
    ]);
    expect(withCaseClient([caseItem], "missing", ["client-2"])).toEqual([
      "client-2",
    ]);
  });

  it("derives the client when a case is selected", () => {
    expect(clientIdForCase([caseItem], "case-1")).toBe("client-1");
    expect(clientIdForCase([caseItem], "missing")).toBeUndefined();
  });

  it("clears a case that does not belong to the selected client", () => {
    expect(compatibleCaseId([caseItem], "case-1", ["client-1"])).toBe("case-1");
    expect(compatibleCaseId([caseItem], "case-1", ["client-2"])).toBe("");
  });
});
