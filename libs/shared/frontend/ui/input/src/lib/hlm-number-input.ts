import {
  Directive,
  ElementRef,
  InjectionToken,
  OnInit,
  OnDestroy,
  Renderer2,
  effect,
  inject,
} from "@angular/core";
import {
  AbstractControl,
  ControlValueAccessor,
  DefaultValueAccessor,
  NgControl,
  NumberValueAccessor,
  ValidationErrors,
} from "@angular/forms";
import {
  HlmNumberLocale,
  formatInputNumber,
  parseInputNumber,
} from "./number-format";

/** An app supplies a reactive locale reader; the shared library never imports app services. */
export const HLM_INPUT_NUMBER_LOCALE = new InjectionToken<
  () => HlmNumberLocale
>("HLM_INPUT_NUMBER_LOCALE", { providedIn: "root", factory: () => () => "sr" });

/** Composed into HlmInput. Non-numeric controls keep their original Angular accessor. */
@Directive({
  standalone: true,
  selector: "[hlmNumberInput]",
  host: {
    "(focus)": "onFocus()",
    "(blur)": "onBlur()",
    "(input)": "onInput()",
    "(keydown)": "onKeydown($event)",
    "(compositionstart)": "composing = true",
    "(compositionend)": "onCompositionEnd()",
    "[attr.role]": 'enabled && numberModel ? "spinbutton" : originalRole',
    "[attr.aria-valuenow]":
      'enabled && numberModel && !invalid && canonical !== "" ? canonical : null',
    "[attr.aria-valuemin]":
      'enabled && numberModel ? element.getAttribute("min") : null',
    "[attr.aria-valuemax]":
      'enabled && numberModel ? element.getAttribute("max") : null',
  },
})
export class HlmNumberInput implements ControlValueAccessor, OnInit, OnDestroy {
  protected readonly element =
    inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private readonly renderer = inject(Renderer2);
  private readonly control = inject(NgControl, { self: true, optional: true });
  private readonly locale = inject(HLM_INPUT_NUMBER_LOCALE);
  protected readonly originalRole = this.element.getAttribute("role");
  protected readonly numberModel =
    this.element.getAttribute("type") === "number";
  protected readonly enabled =
    this.element.tagName === "INPUT" &&
    (this.numberModel || this.element.getAttribute("inputmode") === "decimal");
  private readonly fractionDigits =
    this.element.getAttribute("inputmode") === "decimal"
      ? 2
      : (this.element.getAttribute("step")?.split(".")[1]?.length ?? 0);
  private boundControl: AbstractControl | null = null;
  private focused = false;
  protected composing = false;
  protected invalid = false;
  protected canonical = "";
  private editingLocale: HlmNumberLocale = this.locale();
  private onChange: (value: number | string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private readonly numberValidator = (
    _control: AbstractControl,
  ): ValidationErrors | null => (this.invalid ? { hlmNumber: true } : null);

  constructor() {
    // Only replace the built-in accessors, never another custom control's behavior.
    if (
      this.control?.valueAccessor &&
      !(this.control.valueAccessor instanceof DefaultValueAccessor) &&
      !(this.control.valueAccessor instanceof NumberValueAccessor)
    ) {
      this.enabled = false;
    }
    if (!this.enabled) return;
    if (this.control) this.control.valueAccessor = this;
    // Native number inputs reject grouping characters. Angular's existing static
    // number validators remain attached, while this accessor handles the text view.
    this.renderer.setProperty(this.element, "type", "text");
    this.renderer.setAttribute(
      this.element,
      "inputmode",
      this.fractionDigits ? "decimal" : "numeric",
    );
    effect(() => {
      const locale = this.locale();
      if (!this.focused && !this.invalid) this.render(locale);
    });
  }

  ngOnInit(): void {
    if (!this.enabled) return;
    const control = this.control?.control;
    if (control) {
      this.boundControl = control;
      control.addValidators(this.numberValidator);
      control.updateValueAndValidity({ emitEvent: false });
    } else {
      this.writeValue(this.element.value);
    }
  }

  ngOnDestroy(): void {
    if (!this.boundControl) return;
    this.boundControl.removeValidators(this.numberValidator);
    this.boundControl.updateValueAndValidity({ emitEvent: false });
  }

  writeValue(value: unknown): void {
    if (!this.enabled) return;
    const raw = value == null ? "" : String(value);
    // Programmatic form values use a decimal point, independent of UI language.
    this.canonical =
      typeof value === "number" && Number.isFinite(value)
        ? expandNumber(value)
        : /^-?\d+(?:\.\d*)?$/.test(raw) || raw === ""
          ? raw
          : (parseInputNumber(raw, this.locale()) ?? raw);
    this.invalid =
      this.canonical !== "" && !/^-?\d+(?:\.\d*)?$/.test(this.canonical);
    if (this.invalid) this.renderer.setProperty(this.element, "value", raw);
    else this.render(this.focused ? this.editingLocale : this.locale());
  }

  registerOnChange(fn: (value: number | string | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.renderer.setProperty(this.element, "disabled", disabled);
  }

  protected onFocus(): void {
    if (!this.enabled) return;
    this.focused = true;
    this.editingLocale = this.locale();
    if (!this.invalid) this.render(this.editingLocale);
  }

  protected onBlur(): void {
    if (!this.enabled) return;
    this.focused = false;
    if (!this.invalid) this.render(this.locale());
    this.onTouched();
  }

  protected onInput(): void {
    if (
      !this.enabled ||
      this.composing ||
      this.element.readOnly ||
      this.element.disabled
    )
      return;
    const parsed = parseInputNumber(
      this.element.value,
      this.focused ? this.editingLocale : this.locale(),
    );
    this.invalid =
      parsed === null ||
      (this.numberModel && parsed !== "" && !Number.isFinite(Number(parsed)));
    if (!this.invalid) this.canonical = parsed ?? "";
    this.onChange(
      this.numberModel
        ? this.invalid || parsed === ""
          ? null
          : Number(parsed)
        : (parsed ?? this.element.value),
    );
    // Keep the typed text/caret untouched until blur, including incomplete '-' or '1,'.
  }

  protected onCompositionEnd(): void {
    this.composing = false;
    this.onInput();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (
      !this.enabled ||
      !this.numberModel ||
      !["ArrowUp", "ArrowDown"].includes(event.key) ||
      this.element.readOnly ||
      this.element.disabled ||
      this.composing
    )
      return;
    event.preventDefault();
    const step = Number(this.element.getAttribute("step")) || 1;
    const current =
      this.invalid || !this.canonical ? 0 : Number(this.canonical);
    const decimals = Math.min(
      15,
      Math.max(
        this.canonical.split(".")[1]?.length ?? 0,
        String(step).split(".")[1]?.length ?? 0,
      ),
    );
    let next = Number(
      (current + (event.key === "ArrowUp" ? step : -step)).toFixed(decimals),
    );
    const min = this.element.getAttribute("min");
    const max = this.element.getAttribute("max");
    if (min !== null) next = Math.max(Number(min), next);
    if (max !== null) next = Math.min(Number(max), next);
    this.writeValue(next);
    this.onChange(next);
  }

  private render(locale: HlmNumberLocale): void {
    this.renderer.setProperty(
      this.element,
      "value",
      this.canonical === ""
        ? ""
        : formatInputNumber(
            this.canonical,
            locale,
            this.focused ? 0 : this.fractionDigits,
            !this.focused,
          ),
    );
  }
}

function expandNumber(value: number): string {
  const raw = String(value);
  if (!/[eE]/.test(raw)) return raw;
  const [mantissa, exponent] = raw.toLowerCase().split("e");
  const sign = mantissa.startsWith("-") ? "-" : "";
  const [whole, fraction = ""] = mantissa.replace("-", "").split(".");
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  return (
    sign +
    (point <= 0
      ? "0." + "0".repeat(-point) + digits
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : digits.slice(0, point) + "." + digits.slice(point))
  );
}
