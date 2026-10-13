import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import {
  HlmInput,
  HLM_INPUT_NUMBER_LOCALE,
  HlmNumberLocale,
} from "@spartan-ng/helm/input";

@Component({
  standalone: true,
  imports: [HlmInput, ReactiveFormsModule],
  template: `
    <input hlmInput id="money" inputmode="decimal" [formControl]="money" />
    <input
      hlmInput
      id="number"
      type="number"
      inputmode="decimal"
      min="0"
      max="2000000"
      step="0.01"
      [formControl]="number"
    />
    <input
      hlmInput
      id="count"
      type="number"
      min="1"
      max="10000"
      [formControl]="count"
    />
    <input hlmInput id="text" [formControl]="text" />
    <input
      hlmInput
      id="identifier"
      inputmode="numeric"
      [formControl]="identifier"
    />
    <input hlmInput id="date" type="date" [formControl]="date" />
  `,
})
class Host {
  readonly money = new FormControl("1234567.89", { nonNullable: true });
  readonly number = new FormControl<number | null>(
    1234567.89,
    Validators.required,
  );
  readonly count = new FormControl<number | null>(1234);
  readonly text = new FormControl("hello", { nonNullable: true });
  readonly identifier = new FormControl("001234567", { nonNullable: true });
  readonly date = new FormControl("2026-10-13", { nonNullable: true });
}

describe("shared hlmInput numeric formatting", () => {
  const locale = signal<HlmNumberLocale>("sr");
  function setup() {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        { provide: HLM_INPUT_NUMBER_LOCALE, useValue: () => locale() },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const input = (id: string): HTMLInputElement =>
      fixture.nativeElement.querySelector("#" + id);
    const type = (id: string, value: string) => {
      const element = input(id);
      element.dispatchEvent(new Event("focus"));
      element.value = value;
      element.dispatchEvent(new Event("input"));
      fixture.detectChanges();
    };
    const blur = (id: string) => {
      input(id).dispatchEvent(new Event("blur"));
      fixture.detectChanges();
    };
    return { fixture, form: fixture.componentInstance, input, type, blur };
  }
  beforeEach(() => locale.set("sr"));

  it("formats decimal and integer views while preserving model values and types", () => {
    const { input, form } = setup();
    expect(input("money").value).toBe("1.234.567,89");
    expect(input("number").value).toBe("1.234.567,89");
    expect(input("count").value).toBe("1.234");
    expect(form.money.value).toBe("1234567.89");
    expect(form.number.value).toBe(1234567.89);
    expect(form.count.value).toBe(1234);
    expect(input("number").type).toBe("text");
    expect(input("number").getAttribute("role")).toBe("spinbutton");
  });

  it("leaves text, identifiers and dates on their normal accessors", () => {
    const { input, form, type } = setup();
    expect(input("identifier").value).toBe("001234567");
    expect(input("date").type).toBe("date");
    type("text", "a,b.c");
    expect(form.text.value).toBe("a,b.c");
    type("identifier", "0012300");
    expect(form.identifier.value).toBe("0012300");
  });

  it("removes grouping while focused, preserves caret and formats on blur", () => {
    const { input, form, type, blur } = setup();
    input("money").dispatchEvent(new Event("focus"));
    expect(input("money").value).toBe("1234567,89");
    type("money", "1234,5");
    input("money").setSelectionRange(3, 3);
    expect(input("money").selectionStart).toBe(3);
    expect(input("money").value).toBe("1234,5");
    expect(form.money.value).toBe("1234.5");
    blur("money");
    expect(input("money").value).toBe("1.234,50");
    expect(form.money.touched).toBe(true);
    expect(form.money.dirty).toBe(true);
  });

  it.each(["1.234.567,89", "1,234,567.89", "1 234 567,89", "1234567.89"])(
    "accepts unambiguous pasted value %s",
    (value) => {
      const { input, form, type, blur } = setup();
      type("money", value);
      blur("money");
      expect(form.money.value).toBe("1234567.89");
      expect(input("money").value).toBe("1.234.567,89");
    },
  );

  it.each(["1,234,567", "1.234.567"])(
    "accepts unambiguous whole-number groups %s",
    (value) => {
      const { form, type, blur, input } = setup();
      type("money", value);
      blur("money");
      expect(form.money.value).toBe("1234567");
      expect(input("money").value).toBe("1.234.567,00");
    },
  );

  it("preserves numeric-model fractions expressed in exponent notation", () => {
    const { form, fixture, input } = setup();
    form.number.setValue(1e-7);
    fixture.detectChanges();
    expect(input("number").value).toBe("0,0000001");
    expect(form.number.value).toBe(1e-7);
  });

  it("uses the active locale for ambiguous separators", () => {
    const { form, type, fixture, blur } = setup();
    type("money", "1.234");
    blur("money");
    expect(form.money.value).toBe("1234");
    locale.set("en");
    fixture.detectChanges();
    type("money", "1.234");
    expect(form.money.value).toBe("1.234");
  });

  it("updates the view on language changes without changing the model or emitting value changes", () => {
    const { input, fixture, form } = setup();
    const changed = jest.fn();
    form.money.valueChanges.subscribe(changed);
    locale.set("en");
    fixture.detectChanges();
    expect(input("money").value).toBe("1,234,567.89");
    expect(form.money.value).toBe("1234567.89");
    expect(changed).not.toHaveBeenCalled();
  });

  it("does not reinterpret an in-progress value when the locale changes", () => {
    const { input, fixture, form, type, blur } = setup();
    type("money", "1,2");
    locale.set("en");
    fixture.detectChanges();
    expect(input("money").value).toBe("1,2");
    input("money").value = "1,25";
    input("money").dispatchEvent(new Event("input"));
    fixture.detectChanges();
    expect(form.money.value).toBe("1.25");
    blur("money");
    expect(input("money").value).toBe("1.25");
  });

  it("preserves large decimal strings and extra fractional precision without rounding", () => {
    const { input, form, fixture, type, blur } = setup();
    form.money.setValue("9999999999999999.99");
    fixture.detectChanges();
    expect(input("money").value).toBe("9.999.999.999.999.999,99");
    type("money", "9.999.999.999.999.999,99");
    blur("money");
    expect(form.money.value).toBe("9999999999999999.99");
    form.money.setValue("1234.567891");
    fixture.detectChanges();
    expect(input("money").value).toBe("1.234,567891");
  });

  it("handles programmatic patches, clears, reset and disabled state", () => {
    const { input, form, fixture, type } = setup();
    form.money.setValue("20.00");
    form.number.setValue(20);
    fixture.detectChanges();
    expect(input("money").value).toBe("20,00");
    expect(input("number").value).toBe("20,00");
    type("number", "");
    expect(form.number.value).toBeNull();
    expect(form.number.hasError("required")).toBe(true);
    type("money", "");
    expect(form.money.value).toBe("");
    form.money.reset();
    fixture.detectChanges();
    expect(input("money").value).toBe("1234567,89");
    form.money.disable();
    fixture.detectChanges();
    expect(input("money").disabled).toBe(true);
    form.money.enable();
    fixture.detectChanges();
    expect(input("money").disabled).toBe(false);
  });

  it.each(["12x", "1,2,3", "12.34.56", "-", "1 23", "Infinity", "1e3"])(
    "rejects malformed optional numeric input %s rather than accepting a prefix",
    (value) => {
      const { form, type } = setup();
      type("count", value);
      expect(form.count.value).toBeNull();
      expect(form.count.invalid).toBe(true);
      expect(form.count.hasError("hlmNumber")).toBe(true);
      type("count", "1234");
      expect(form.count.valid).toBe(true);
    },
  );

  it("keeps min/max validation and keyboard stepping on number fields", () => {
    const { input, form, type, fixture } = setup();
    type("count", "10001");
    expect(form.count.hasError("max")).toBe(true);
    type("count", "-1");
    expect(form.count.hasError("min")).toBe(true);
    type("number", "1,23");
    input("number").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    fixture.detectChanges();
    expect(form.number.value).toBe(1.24);
    expect(input("number").value).toBe("1,24");
    input("number").readOnly = true;
    input("number").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(form.number.value).toBe(1.24);
  });

  it("waits for composition to finish before committing a numeric value", () => {
    const { input, form } = setup();
    const element = input("money");
    element.dispatchEvent(new Event("compositionstart"));
    element.value = "12,34";
    element.dispatchEvent(new Event("input"));
    expect(form.money.value).toBe("1234567.89");
    element.dispatchEvent(new Event("compositionend"));
    expect(form.money.value).toBe("12.34");
  });
  it("keeps typed decimal aliases stable as a third digit is entered", () => {
    const { input, form } = setup();
    const element = input("money");
    element.dispatchEvent(new Event("focus"));
    for (const value of ["1.2", "1.23", "1.234", "1.2345"]) {
      element.value = value;
      element.dispatchEvent(
        new InputEvent("input", {
          inputType: "insertText",
          data: value.at(-1),
        }),
      );
      expect(form.money.value).toBe(value);
    }
    element.value = "1.234,56";
    element.dispatchEvent(
      new InputEvent("input", { inputType: "insertFromPaste" }),
    );
    expect(form.money.value).toBe("1234.56");
    expect(element.value).toBe("1234,56");
  });
});
