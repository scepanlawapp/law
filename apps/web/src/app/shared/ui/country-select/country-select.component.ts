import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal,
} from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import {
  comboboxContainsFilter,
  ComboboxFilter,
} from "@spartan-ng/brain/combobox";
import {
  HlmCombobox,
  HlmComboboxContent,
  HlmComboboxEmpty,
  HlmComboboxInput,
  HlmComboboxItem,
  HlmComboboxList,
  HlmComboboxPortal,
  HlmComboboxTrigger,
  HlmComboboxValue,
  HlmComboboxValueTemplate,
} from "@spartan-ng/helm/combobox";
import { LocalizationService } from "../../../core/localization/localization.service";
import { CountryOption, loadCountryOptions } from "../../utils/countries";

let nextCountrySelectId = 0;

@Component({
  selector: "law-country-select",
  standalone: true,
  imports: [
    HlmCombobox,
    HlmComboboxContent,
    HlmComboboxEmpty,
    HlmComboboxInput,
    HlmComboboxItem,
    HlmComboboxList,
    HlmComboboxPortal,
    HlmComboboxTrigger,
    HlmComboboxValue,
    HlmComboboxValueTemplate,
  ],
  templateUrl: "./country-select.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CountrySelectComponent),
      multi: true,
    },
  ],
  host: { class: "block" },
})
export class CountrySelectComponent implements ControlValueAccessor {
  private readonly localization = inject(LocalizationService);

  readonly inputId = input<string>(`country-select-${nextCountrySelectId++}`);
  readonly required = input(false, { transform: booleanAttribute });
  /** Optional override; defaults to the translated "Select a country" label. */
  readonly placeholder = input<string | undefined>(undefined);

  protected readonly disabled = signal(false);
  protected readonly options = signal<CountryOption[]>([]);
  protected readonly selected = signal<CountryOption | null>(null);

  protected readonly resolvedPlaceholder = computed(
    () =>
      this.placeholder() ?? this.localization.translate("common.selectCountry"),
  );
  protected readonly searchPlaceholder = computed(() =>
    this.localization.translate("common.searchCountry"),
  );
  protected readonly emptyMessage = computed(() =>
    this.localization.translate("common.noCountriesFound"),
  );

  protected readonly itemToString = (
    item: CountryOption | null | undefined,
  ): string => item?.name ?? "";

  protected readonly isItemEqualToValue = (
    itemValue: CountryOption | null | undefined,
    selectedValue: CountryOption | null | undefined,
  ): boolean => (itemValue?.code ?? null) === (selectedValue?.code ?? null);

  protected readonly filterCountries: ComboboxFilter<CountryOption> = (
    itemValue,
    search,
    collator,
  ) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    if (itemValue.code.toLowerCase() === query) return true;
    return comboboxContainsFilter(itemValue.name, search, collator);
  };

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private selectedCode: string | null = null;

  constructor() {
    effect(() => {
      const language = this.localization.language();
      loadCountryOptions(language).then((options) => {
        this.options.set(options);
        this.selected.set(
          this.selectedCode
            ? (options.find((option) => option.code === this.selectedCode) ??
                null)
            : null,
        );
      });
    });
  }

  writeValue(value: string | null | undefined): void {
    this.selectedCode = value ? value.toUpperCase() : null;
    this.selected.set(
      this.selectedCode
        ? (this.options().find((option) => option.code === this.selectedCode) ??
            null)
        : null,
    );
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onValueChange(value: CountryOption | null | undefined): void {
    this.selectedCode = value?.code ?? null;
    this.selected.set(value ?? null);
    this.onChange(this.selectedCode);
  }

  protected handleClosed(): void {
    this.onTouched();
  }
}
