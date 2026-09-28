import { toDateInputValue } from "./billing-entry-dialog.utils";

describe("billing entry dialog utilities", () => {
  it("normalizes a candidate timestamp for a date input", () => {
    expect(toDateInputValue("2026-09-28T14:30:00.000Z")).toBe("2026-09-28");
  });

  it("uses the local calendar date when no candidate date is available", () => {
    expect(toDateInputValue(undefined, new Date(2026, 8, 7, 23, 30))).toBe(
      "2026-09-07",
    );
  });
});
