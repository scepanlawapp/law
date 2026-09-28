import { TestBed } from "@angular/core/testing";
import { AssistantStarterPrompt } from "../../assistant-starter-prompts";
import { StarterPromptsComponent } from "./starter-prompts";

const prompts: AssistantStarterPrompt[] = [
  { id: "myTasks", icon: "lucideListChecks", mode: "send" },
  { id: "researchLaw", icon: "lucideBookOpen", mode: "compose" },
];

function render(disabled = false) {
  const fixture = TestBed.createComponent(StarterPromptsComponent);
  fixture.componentRef.setInput("prompts", prompts);
  fixture.componentRef.setInput("disabled", disabled);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, buttons: [...element.querySelectorAll("button")] };
}

describe("StarterPromptsComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StarterPromptsComponent],
    }).compileComponents();
  });

  it("renders a card per prompt and emits the clicked one", () => {
    const { fixture, buttons } = render();
    const selected: string[] = [];
    fixture.componentInstance.selected.subscribe((prompt) =>
      selected.push(prompt.id),
    );

    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain("assistant.starter.myTasks.title");
    expect(buttons[1].getAttribute("data-mode")).toBe("compose");
    buttons[1].click();
    expect(selected).toEqual(["researchLaw"]);
  });

  it("disables every card while a message is being sent", () => {
    const { buttons } = render(true);

    expect(buttons.every((button) => button.disabled)).toBe(true);
  });
});
