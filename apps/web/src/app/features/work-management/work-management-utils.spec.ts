import { dateInputValue, taskDueMode } from "./work-management-utils";

describe("work-management due target defaults", () => {
  it("defaults a new task to no due target or date value", () => {
    expect(taskDueMode()).toBe("NONE");
    expect(dateInputValue(undefined)).toBe("");
  });
});
