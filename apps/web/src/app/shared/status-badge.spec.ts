import { priorityBadgeClass, statusBadgeClass } from "./status-badge";

describe("status badge semantics", () => {
  it("uses success styling for successful states", () => {
    expect(statusBadgeClass("ACTIVE")).toContain("text-success");
    expect(statusBadgeClass("CONFIRMED")).toContain("text-success");
    expect(statusBadgeClass("SENT")).toContain("text-success");
  });

  it("distinguishes warning, informational, destructive, and muted states", () => {
    expect(statusBadgeClass("ON_HOLD")).toContain("text-warning");
    expect(statusBadgeClass("IN_PROGRESS")).toContain("text-info");
    expect(statusBadgeClass("CANCELLED")).toContain("text-destructive");
    expect(statusBadgeClass("ARCHIVED")).toContain("text-muted-foreground");
  });

  it("maps task priority from low through urgent", () => {
    expect(priorityBadgeClass("LOW")).toContain("text-info");
    expect(priorityBadgeClass("NORMAL")).toContain("text-muted-foreground");
    expect(priorityBadgeClass("HIGH")).toContain("text-warning");
    expect(priorityBadgeClass("URGENT")).toContain("text-destructive");
  });
});
