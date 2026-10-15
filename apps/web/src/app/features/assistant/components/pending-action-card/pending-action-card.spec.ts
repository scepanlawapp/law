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
  mode: "CARD",
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

  it("offers to open the prefilled form instead of approving", () => {
    const { fixture, element, buttons } = render({
      ...pending,
      actionType: "create_event",
      mode: "FORM",
      summary: "Novi događaj: Sastanak sa Borkom — 16.10.2026. u 12:00",
    });
    const events: string[] = [];
    fixture.componentInstance.openForm.subscribe(() => events.push("form"));
    fixture.componentInstance.approve.subscribe(() => events.push("approve"));

    expect(buttons).toHaveLength(2);
    expect(element.textContent).toContain("assistant.pendingAction.openForm");
    buttons[0].click();
    expect(events).toEqual(["form"]);
  });

  it("marks an automatic save and links to the created event", () => {
    const { fixture, element, buttons } = render({
      ...pending,
      actionType: "create_event",
      mode: "AUTO",
      status: "APPROVED",
      resultEntityId: "event-1",
      resultEntityType: "EVENT",
      resultMessage: "Događaj „Sastanak“ je zakazan za 16.10.2026. u 12:00.",
    });
    const events: string[] = [];
    fixture.componentInstance.openResult.subscribe(() => events.push("open"));

    expect(element.textContent).toContain("assistant.pendingAction.status.AUTO");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain(
      "assistant.pendingAction.openResult.EVENT",
    );
    buttons[0].click();
    expect(events).toEqual(["open"]);
  });

  it("says automatically logged work still needs confirming", () => {
    const { element, buttons } = render({
      ...pending,
      actionType: "log_work_entry",
      mode: "AUTO",
      status: "APPROVED",
      resultEntityId: "entry-1",
      resultEntityType: "WORK_ENTRY",
      resultMessage: "Rad je upisan kao predlog.",
    });

    expect(element.textContent).toContain(
      "assistant.pendingAction.status.AUTO_PROPOSED",
    );
    expect(buttons[0].textContent).toContain(
      "assistant.pendingAction.openResult.WORK_ENTRY",
    );
  });

  it("offers undo on an automatic save and shows it once undone", () => {
    const auto = {
      ...pending,
      actionType: "create_task" as const,
      mode: "AUTO" as const,
      status: "APPROVED" as const,
      resultEntityId: "task-1",
      resultEntityType: "TASK" as const,
      resultMessage: "Zadatak je kreiran.",
      canUndo: true,
    };
    const { fixture, buttons } = render(auto);
    const events: string[] = [];
    fixture.componentInstance.undo.subscribe(() => events.push("undo"));

    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      "assistant.pendingAction.openResult.TASK",
      "assistant.pendingAction.undo",
    ]);
    buttons[1].click();
    expect(events).toEqual(["undo"]);

    const undone = render({
      ...auto,
      canUndo: false,
      undoneAt: "2026-10-15T12:00:00.000Z",
    });
    expect(undone.element.textContent).toContain("assistant.pendingAction.undone");
    expect(undone.buttons).toHaveLength(0);
  });
});
