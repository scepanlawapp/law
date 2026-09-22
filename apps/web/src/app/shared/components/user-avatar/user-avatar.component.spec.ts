import { ComponentFixture, TestBed } from "@angular/core/testing";
import { UserAvatarComponent } from "./user-avatar.component";

describe("UserAvatarComponent", () => {
  let fixture: ComponentFixture<UserAvatarComponent>;
  let component: UserAvatarComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserAvatarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UserAvatarComponent);
    component = fixture.componentInstance;
  });

  it("renders non-editable avatar as a span with initials", () => {
    fixture.componentRef.setInput("user", {
      firstName: "Marko",
      lastName: "Markovic",
      email: "marko@example.com",
    });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector("button");
    const span = element.querySelector("span");

    expect(button).toBeNull();
    expect(span).not.toBeNull();
    expect(span?.textContent?.trim()).toBe("MM");
  });

  it("renders editable avatar as a button and emits avatarClick on click", () => {
    fixture.componentRef.setInput("user", {
      firstName: "Jelena",
      lastName: "Jankovic",
    });
    fixture.componentRef.setInput("editable", true);
    fixture.componentRef.setInput("editLabel", "Change photo");
    fixture.detectChanges();

    const clickSpy = jest.fn();
    component.avatarClick.subscribe(clickSpy);

    const button = fixture.nativeElement.querySelector(
      "button",
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe("Change photo");

    button.click();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("derives initials from username or email when names are missing", () => {
    fixture.componentRef.setInput("user", {
      email: "advokat@law.rs",
    });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent?.trim()).toBe("AD");
  });
});
