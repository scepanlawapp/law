import { TestBed } from "@angular/core/testing";
import { PendingActionSummary } from "@law/api-interfaces";
import { PendingActionCardComponent } from "./pending-action-card";

const pending: PendingActionSummary = {
  id: "action-1",
  jobId: "job-1",
  correlationId: "corr-1",
  actionType: "create_deadline",
  summary: "Novi rok: Odgovor na tužbu — 15.10.2026.",
  details: ["Predmet: 2026-21 – Poništaj rešenja", "Vrsta roka: sudski"],
  status: "PENDING",
  resultMessage: null,
  errorMessage: null,
  expiresAt: "2026-09-28T12:00:00.000Z",
  decidedAt: null,
  createdAt: "2026-09-27T12:00:00.000Z",
};

function render(action: PendingActionSummary, busy = false) {
  const fixture = TestBed.createComponent(PendingActionCardComponent);
  fixture.componentRef.setInput("action", action);
  fixture.componentRef.setInput("busy", busy);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, element, buttons: [...element.querySelectorAll("button")] };
}

describe("PendingActionCardComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PendingActionCardComponent],
    }).compileComponents();
  });

  it("shows the proposal and emits approve and decline", () => {
    const { fixture, element, buttons } = render(pending);
    const events: string[] = [];
    fixture.componentInstance.approve.subscribe(() => events.push("approve"));
    fixture.componentInstance.decline.subscribe(() => events.push("decline"));

    expect(element.textContent).toContain("Novi rok: Odgovor na tužbu");
    expect(element.textContent).toContain("Vrsta roka: sudski");
    expect(buttons).toHaveLength(2);
    buttons[0].click();
    buttons[1].click();
    expect(events).toEqual(["approve", "decline"]);
  });

  it("disables both buttons while the decision is in flight", () => {
    const { buttons } = render(pending, true);

    expect(buttons.every((button) => button.disabled)).toBe(true);
  });

  it("shows the outcome instead of buttons once decided", () => {
    const { element, buttons } = render({
      ...pending,
      status: "APPROVED",
      resultMessage: "Rok „Odgovor na tužbu“ je kreiran za 15.10.2026.",
    });

    expect(buttons).toHaveLength(0);
    expect(element.textContent).toContain("je kreiran za 15.10.2026.");
    expect(element.querySelector("section")?.getAttribute("data-status")).toBe(
      "APPROVED",
    );
  });

  it("shows the error of a failed execution", () => {
    const { element } = render({
      ...pending,
      status: "FAILED",
      errorMessage: "Responsible user is not a member",
    });

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      "Responsible user is not a member",
    );
  });
});
